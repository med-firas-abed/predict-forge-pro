#include <Wire.h>
#include <Adafruit_INA219.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>
#include "esp_system.h"

Adafruit_INA219 ina219;
Adafruit_MPU6050 mpu;

// ------------------------------
// Pins
// ------------------------------
const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;

// ------------------------------
// Timing
// ------------------------------
const unsigned long LOOP_MS = 300;
const unsigned long DEBUG_NOTE_MS = 1000;

// ------------------------------
// Sensor settings
// ------------------------------
const bool PRINT_DEBUG_NOTES = true;
const bool INA_USE_32V_2A = false;
const float CURRENT_ZERO_CLAMP_A = 0.003f;

// ------------------------------
// Learning logic
// Goal:
// 1. Learn motor OFF baseline.
// 2. Learn FREE-RUN baseline.
// 3. Treat FREE-RUN as normal.
// 4. Only blocking / overload becomes anomaly.
// ------------------------------
const int REST_CALIB_SAMPLES = 30;
const int RUN_CALIB_SAMPLES = 25;
const int TOTAL_CALIB_SAMPLES = REST_CALIB_SAMPLES + RUN_CALIB_SAMPLES;

const float REST_TO_RUN_CURRENT_DELTA_A = 0.020f;
const float REST_TO_RUN_VIB_DELTA = 0.35f;

const float MOTOR_OFF_CURRENT_MARGIN_A = 0.012f;
const float MOTOR_OFF_VIB_MARGIN = 0.20f;

const int MOTOR_ON_CONFIRM_COUNT = 3;
const int MOTOR_OFF_CONFIRM_COUNT = 5;

// ------------------------------
// Vibration settings
// ------------------------------
const float GRAVITY_MS2 = 9.81f;
const int RMS_WINDOW = 20;

// ------------------------------
// State
// ------------------------------
enum LearnPhase {
  PHASE_REST_CALIB,
  PHASE_WAIT_FREE_RUN,
  PHASE_RUN_CALIB,
  PHASE_ACTIVE
};

LearnPhase phase = PHASE_REST_CALIB;

bool inaAvailable = false;
bool mpuAvailable = false;

unsigned long lastLoopMs = 0;
unsigned long lastDebugMs = 0;

int restCalibCount = 0;
int runCalibCount = 0;
int motorOnCounter = 0;
int motorOffCounter = 0;

float restSumCurrentA = 0.0f;
float restSumVibration = 0.0f;
float runSumCurrentA = 0.0f;
float runSumVibration = 0.0f;

float restBaselineCurrentA = 0.0f;
float restBaselineVibration = 0.0f;

float runBaselineCurrentA = 0.0f;
float runBaselineVibration = 0.0f;

float uiBaselineCurrentA = 0.0f;
float uiBaselineVibration = 0.0f;

float threshCurrentA = 0.0f;
float threshCurrentDangerA = 0.0f;
float threshVibration = 0.0f;
float threshVibrationDanger = 0.0f;

float vibSquares[RMS_WINDOW];
int vibIndex = 0;
int vibCount = 0;

// ------------------------------
// Helpers
// ------------------------------
float maxf2(float a, float b) {
  return a > b ? a : b;
}

const char *resetReasonText(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON:
      return "POWERON";
    case ESP_RST_SW:
      return "SOFTWARE";
    case ESP_RST_PANIC:
      return "PANIC";
    case ESP_RST_INT_WDT:
      return "INT_WDT";
    case ESP_RST_TASK_WDT:
      return "TASK_WDT";
    case ESP_RST_WDT:
      return "WDT";
    case ESP_RST_DEEPSLEEP:
      return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:
      return "BROWNOUT";
    case ESP_RST_SDIO:
      return "SDIO";
    default:
      return "OTHER";
  }
}

const char *phaseText(LearnPhase value) {
  switch (value) {
    case PHASE_REST_CALIB:
      return "REST_CALIB";
    case PHASE_WAIT_FREE_RUN:
      return "WAIT_FREE_RUN";
    case PHASE_RUN_CALIB:
      return "RUN_CALIB";
    case PHASE_ACTIVE:
      return "ACTIVE";
    default:
      return "UNKNOWN";
  }
}

float currentWarnThresholdFromRun(float baseline) {
  return maxf2(baseline * 1.70f, baseline + 0.035f);
}

float currentDangerThresholdFromRun(float baseline) {
  return maxf2(baseline * 2.40f, baseline + 0.070f);
}

float vibrationWarnThresholdFromRun(float baseline) {
  return maxf2(baseline * 1.75f, baseline + 0.45f);
}

float vibrationDangerThresholdFromRun(float baseline) {
  return maxf2(baseline * 2.50f, baseline + 0.90f);
}

bool motorLooksRunning(float currentA, float vibrationRms) {
  return currentA > (restBaselineCurrentA + REST_TO_RUN_CURRENT_DELTA_A)
    || vibrationRms > (restBaselineVibration + REST_TO_RUN_VIB_DELTA);
}

bool motorLooksStopped(float currentA, float vibrationRms) {
  return currentA < (restBaselineCurrentA + MOTOR_OFF_CURRENT_MARGIN_A)
    && vibrationRms < (restBaselineVibration + MOTOR_OFF_VIB_MARGIN);
}

int calibrationCountForUi() {
  switch (phase) {
    case PHASE_REST_CALIB:
      return restCalibCount;
    case PHASE_WAIT_FREE_RUN:
      return REST_CALIB_SAMPLES;
    case PHASE_RUN_CALIB:
      return REST_CALIB_SAMPLES + runCalibCount;
    case PHASE_ACTIVE:
      return TOTAL_CALIB_SAMPLES;
    default:
      return 0;
  }
}

float computeRms(float value) {
  vibSquares[vibIndex] = value * value;
  vibIndex = (vibIndex + 1) % RMS_WINDOW;

  if (vibCount < RMS_WINDOW) {
    vibCount++;
  }

  float sum = 0.0f;
  for (int i = 0; i < vibCount; i++) {
    sum += vibSquares[i];
  }

  if (vibCount <= 0) {
    return 0.0f;
  }

  return sqrtf(sum / vibCount);
}

float readCurrentAbsA(float &signedCurrentA) {
  signedCurrentA = 0.0f;

  if (!inaAvailable) {
    return 0.0f;
  }

  signedCurrentA = ina219.getCurrent_mA() / 1000.0f;

  if (!isfinite(signedCurrentA)) {
    signedCurrentA = 0.0f;
  }

  float currentAbsA = fabsf(signedCurrentA);

  if (currentAbsA < CURRENT_ZERO_CLAMP_A) {
    currentAbsA = 0.0f;
  }

  return currentAbsA;
}

void readVibration(float &vibrationRaw, float &vibrationRms, float &tempC) {
  vibrationRaw = 0.0f;
  vibrationRms = 0.0f;
  tempC = 0.0f;

  if (!mpuAvailable) {
    return;
  }

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float ax = a.acceleration.x;
  float ay = a.acceleration.y;
  float az = a.acceleration.z;
  float totalAcc = sqrtf(ax * ax + ay * ay + az * az);

  if (!isfinite(totalAcc)) {
    return;
  }

  vibrationRaw = fabsf(totalAcc - GRAVITY_MS2);
  if (!isfinite(vibrationRaw)) {
    vibrationRaw = 0.0f;
  }

  vibrationRms = computeRms(vibrationRaw);
  if (!isfinite(vibrationRms)) {
    vibrationRms = 0.0f;
  }

  tempC = temp.temperature;
  if (!isfinite(tempC)) {
    tempC = 0.0f;
  }
}

void printDebugNote(unsigned long nowMs, float signedCurrentA, float currentAbsA) {
  if (!PRINT_DEBUG_NOTES) {
    return;
  }

  if (nowMs - lastDebugMs < DEBUG_NOTE_MS) {
    return;
  }

  lastDebugMs = nowMs;

  Serial.print("# DEBUG phase=");
  Serial.print(phaseText(phase));
  Serial.print(" ms=");
  Serial.print(nowMs);
  Serial.print(" signed_current_a=");
  Serial.print(signedCurrentA, 4);
  Serial.print(" abs_current_a=");
  Serial.print(currentAbsA, 4);
  Serial.print(" rest_current_a=");
  Serial.print(restBaselineCurrentA, 4);
  Serial.print(" run_current_a=");
  Serial.print(runBaselineCurrentA, 4);
  Serial.print(" thresh_current_a=");
  Serial.print(threshCurrentA, 4);
  Serial.print(" thresh_vibration=");
  Serial.println(threshVibration, 4);
}

const char *activeStatus(bool motorRunning, bool currentWarn, bool currentDanger, bool vibWarn, bool vibDanger) {
  if (!motorRunning) {
    return "REST";
  }

  if (currentDanger || vibDanger) {
    return "ANOMALY_DANGER";
  }

  if (currentWarn && vibWarn) {
    return "ANOMALY_BOTH";
  }

  if (currentWarn) {
    return "ANOMALY_CURRENT";
  }

  if (vibWarn) {
    return "ANOMALY_VIB";
  }

  return "NORMAL_RUN";
}

void printCsvLine(
  unsigned long timestampMs,
  float currentA,
  float vibrationRaw,
  float vibrationRms,
  float tempC,
  const char *status,
  int calibCountValue,
  int calibTotalValue,
  float baselineVibValue,
  float baselineCurrentValue,
  float threshVibValue,
  float threshCurrentValue
) {
  Serial.print(timestampMs);
  Serial.print(",");
  Serial.print(currentA, 4);
  Serial.print(",");
  Serial.print(vibrationRaw, 4);
  Serial.print(",");
  Serial.print(vibrationRms, 4);
  Serial.print(",");
  Serial.print(tempC, 2);
  Serial.print(",");
  Serial.print(status);
  Serial.print(",");
  Serial.print(calibCountValue);
  Serial.print(",");
  Serial.print(calibTotalValue);
  Serial.print(",");
  Serial.print(baselineVibValue, 4);
  Serial.print(",");
  Serial.print(baselineCurrentValue, 4);
  Serial.print(",");
  Serial.print(threshVibValue, 4);
  Serial.print(",");
  Serial.println(threshCurrentValue, 4);
}

void beginRunCalibration() {
  phase = PHASE_RUN_CALIB;
  runCalibCount = 0;
  runSumCurrentA = 0.0f;
  runSumVibration = 0.0f;
  motorOnCounter = 0;
  motorOffCounter = 0;
  Serial.println("# FREE_RUN_CALIB_START keep motor running freely, do not block it");
}

void finishRunCalibration() {
  runBaselineCurrentA = runSumCurrentA / runCalibCount;
  runBaselineVibration = runSumVibration / runCalibCount;

  uiBaselineCurrentA = runBaselineCurrentA;
  uiBaselineVibration = runBaselineVibration;

  threshCurrentA = currentWarnThresholdFromRun(runBaselineCurrentA);
  threshCurrentDangerA = currentDangerThresholdFromRun(runBaselineCurrentA);
  threshVibration = vibrationWarnThresholdFromRun(runBaselineVibration);
  threshVibrationDanger = vibrationDangerThresholdFromRun(runBaselineVibration);

  phase = PHASE_ACTIVE;
  motorOffCounter = 0;

  Serial.print("# FREE_RUN_READY baseline_current_a=");
  Serial.print(runBaselineCurrentA, 4);
  Serial.print(" thresh_current_a=");
  Serial.print(threshCurrentA, 4);
  Serial.print(" baseline_vibration=");
  Serial.print(runBaselineVibration, 4);
  Serial.print(" thresh_vibration=");
  Serial.println(threshVibration, 4);
}

// ------------------------------
// Setup
// ------------------------------
void setup() {
  Serial.begin(115200);
  delay(1500);

  for (int i = 0; i < RMS_WINDOW; i++) {
    vibSquares[i] = 0.0f;
  }

  Serial.println("# BOOT_OK");
  Serial.print("# RESET_REASON=");
  Serial.println(resetReasonText(esp_reset_reason()));

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(50);
  delay(50);

  if (ina219.begin()) {
    inaAvailable = true;
    if (INA_USE_32V_2A) {
      ina219.setCalibration_32V_2A();
      Serial.println("# INA219_OK_CAL_32V_2A");
    } else {
      ina219.setCalibration_32V_1A();
      Serial.println("# INA219_OK_CAL_32V_1A");
    }
  } else {
    inaAvailable = false;
    Serial.println("# INA219_FAIL");
  }

  if (mpu.begin()) {
    mpuAvailable = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("# MPU_OK");
  } else {
    mpuAvailable = false;
    Serial.println("# MPU_FAIL");
  }

  Serial.println("# Step 1: keep motor OFF during startup calibration");
  Serial.println("# Step 2: when asked, turn motor ON and let it spin freely");
  Serial.println("# Step 3: after free-run learning, only overload/blocking should trigger anomaly");
  Serial.println("timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status,calib_count,calib_total,baseline_vib,baseline_current,thresh_vib,thresh_current");
}

// ------------------------------
// Loop
// ------------------------------
void loop() {
  if (millis() - lastLoopMs < LOOP_MS) {
    return;
  }

  lastLoopMs = millis();

  float signedCurrentA = 0.0f;
  float currentA = readCurrentAbsA(signedCurrentA);

  float vibrationRaw = 0.0f;
  float vibrationRms = 0.0f;
  float tempC = 0.0f;
  readVibration(vibrationRaw, vibrationRms, tempC);

  if (phase == PHASE_REST_CALIB) {
    restCalibCount++;
    restSumCurrentA += currentA;
    restSumVibration += vibrationRms;

    uiBaselineCurrentA = restSumCurrentA / restCalibCount;
    uiBaselineVibration = restSumVibration / restCalibCount;

    printCsvLine(
      millis(),
      currentA,
      vibrationRaw,
      vibrationRms,
      tempC,
      "CALIBRATING_REST",
      calibrationCountForUi(),
      TOTAL_CALIB_SAMPLES,
      uiBaselineVibration,
      uiBaselineCurrentA,
      0.0f,
      0.0f
    );

    if (restCalibCount >= REST_CALIB_SAMPLES) {
      restBaselineCurrentA = uiBaselineCurrentA;
      restBaselineVibration = uiBaselineVibration;
      phase = PHASE_WAIT_FREE_RUN;
      Serial.print("# REST_BASELINE_READY current_a=");
      Serial.print(restBaselineCurrentA, 4);
      Serial.print(" vibration=");
      Serial.println(restBaselineVibration, 4);
      Serial.println("# TURN_MOTOR_ON_NOW and let it spin freely");
    }

    return;
  }

  if (phase == PHASE_WAIT_FREE_RUN) {
    uiBaselineCurrentA = restBaselineCurrentA;
    uiBaselineVibration = restBaselineVibration;

    if (motorLooksRunning(currentA, vibrationRms)) {
      motorOnCounter++;
    } else {
      motorOnCounter = 0;
    }

    printCsvLine(
      millis(),
      currentA,
      vibrationRaw,
      vibrationRms,
      tempC,
      "CALIBRATING_WAIT_FREE_RUN",
      calibrationCountForUi(),
      TOTAL_CALIB_SAMPLES,
      uiBaselineVibration,
      uiBaselineCurrentA,
      0.0f,
      0.0f
    );

    if (motorOnCounter >= MOTOR_ON_CONFIRM_COUNT) {
      beginRunCalibration();
    }

    return;
  }

  if (phase == PHASE_RUN_CALIB) {
    if (!motorLooksRunning(currentA, vibrationRms)) {
      motorOffCounter++;
    } else {
      motorOffCounter = 0;
    }

    if (motorOffCounter >= MOTOR_OFF_CONFIRM_COUNT) {
      phase = PHASE_WAIT_FREE_RUN;
      runCalibCount = 0;
      runSumCurrentA = 0.0f;
      runSumVibration = 0.0f;
      motorOnCounter = 0;
      motorOffCounter = 0;
      Serial.println("# FREE_RUN_CALIB_ABORTED motor stopped too early");
      return;
    }

    runCalibCount++;
    runSumCurrentA += currentA;
    runSumVibration += vibrationRms;

    uiBaselineCurrentA = runSumCurrentA / runCalibCount;
    uiBaselineVibration = runSumVibration / runCalibCount;

    printCsvLine(
      millis(),
      currentA,
      vibrationRaw,
      vibrationRms,
      tempC,
      "CALIBRATING_FREE_RUN",
      calibrationCountForUi(),
      TOTAL_CALIB_SAMPLES,
      uiBaselineVibration,
      uiBaselineCurrentA,
      currentWarnThresholdFromRun(uiBaselineCurrentA),
      vibrationWarnThresholdFromRun(uiBaselineVibration)
    );

    if (runCalibCount >= RUN_CALIB_SAMPLES) {
      finishRunCalibration();
    }

    return;
  }

  // PHASE_ACTIVE
  uiBaselineCurrentA = runBaselineCurrentA;
  uiBaselineVibration = runBaselineVibration;

  if (motorLooksStopped(currentA, vibrationRms)) {
    motorOffCounter++;
  } else {
    motorOffCounter = 0;
  }

  bool motorRunning = motorOffCounter < MOTOR_OFF_CONFIRM_COUNT;

  bool currentWarn = motorRunning && currentA > threshCurrentA;
  bool currentDanger = motorRunning && currentA > threshCurrentDangerA;
  bool vibWarn = motorRunning && vibrationRms > threshVibration;
  bool vibDanger = motorRunning && vibrationRms > threshVibrationDanger;

  const char *status = activeStatus(motorRunning, currentWarn, currentDanger, vibWarn, vibDanger);

  printDebugNote(millis(), signedCurrentA, currentA);

  printCsvLine(
    millis(),
    currentA,
    vibrationRaw,
    vibrationRms,
    tempC,
    status,
    calibrationCountForUi(),
    TOTAL_CALIB_SAMPLES,
    uiBaselineVibration,
    uiBaselineCurrentA,
    threshVibration,
    threshCurrentA
  );
}
