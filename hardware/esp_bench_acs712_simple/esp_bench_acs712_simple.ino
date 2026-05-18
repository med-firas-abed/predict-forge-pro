#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>
#include "esp_system.h"

Adafruit_MPU6050 mpu;

// --------------------------------------------------
// Pins
// --------------------------------------------------
const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;
const int ACS712_ADC_PIN = 35; // ADC1 pin on ESP32

// --------------------------------------------------
// Timing
// --------------------------------------------------
const unsigned long LOOP_MS = 200;
const unsigned long DEBUG_NOTE_MS = 1000;
const unsigned long MPU_RECOVER_COOLDOWN_MS = 1500;

// --------------------------------------------------
// I2C / MPU settings
// --------------------------------------------------
const uint32_t I2C_CLOCK_HZ = 50000;
const float MPU_TEMP_MIN_C = -20.0f;
const float MPU_TEMP_MAX_C = 85.0f;
const float MPU_TEMP_MAX_STEP_C = 4.0f;
const int MPU_BAD_SAMPLE_LIMIT = 4;

// --------------------------------------------------
// ACS712 settings
// This version assumes a 5A ACS712 module.
// If you have a 20A module, use 0.100f.
// If you have a 30A module, use 0.066f.
// --------------------------------------------------
const bool PRINT_DEBUG_NOTES = true;
const bool ACS712_CURRENT_INVERT = false;
const int ACS712_ADC_SAMPLES = 8;
const float ACS712_SENSITIVITY_V_PER_A = 0.185f;
const float ACS712_ZERO_CLAMP_A = 0.010f;
const float ACS712_FILTER_ALPHA = 0.38f;
const float ACS712_REST_ZERO_TRACK_ALPHA = 0.10f;

// Divider used between ACS712 OUT and ESP32 GPIO35:
// ACS OUT -> 10k -> GPIO35 -> 20k -> GND
const float ACS712_DIVIDER_R_TOP_OHMS = 10000.0f;
const float ACS712_DIVIDER_R_BOTTOM_OHMS = 20000.0f;

// --------------------------------------------------
// Learning logic
// Goal:
// 1. Learn motor OFF baseline.
// 2. Learn FREE-RUN baseline.
// 3. Treat FREE-RUN as normal.
// 4. Only blocking / overload becomes anomaly.
// --------------------------------------------------
const int REST_CALIB_SAMPLES = 12;
const int RUN_CALIB_SAMPLES = 10;
const int TOTAL_CALIB_SAMPLES = REST_CALIB_SAMPLES + RUN_CALIB_SAMPLES;

const float REST_TO_RUN_CURRENT_DELTA_A = 0.025f;
const float REST_TO_RUN_VIB_DELTA = 0.35f;

const float MOTOR_OFF_CURRENT_MARGIN_A = 0.015f;
const float MOTOR_OFF_VIB_MARGIN = 0.20f;
const bool DEMO_FORCE_ZERO_WHEN_REST = true;
const float DEMO_REST_CURRENT_HEADROOM_A = 0.030f;
const float DEMO_REST_VIB_MARGIN = 0.12f;
const float DEMO_REST_VIB_RAW_MARGIN = 0.30f;

const int MOTOR_ON_CONFIRM_COUNT = 2;
const int MOTOR_OFF_CONFIRM_COUNT = 3;

// --------------------------------------------------
// Vibration settings
// --------------------------------------------------
const float GRAVITY_MS2 = 9.81f;
const int RMS_WINDOW = 8;

// --------------------------------------------------
// State
// --------------------------------------------------
enum LearnPhase {
  PHASE_REST_CALIB,
  PHASE_WAIT_FREE_RUN,
  PHASE_RUN_CALIB,
  PHASE_ACTIVE
};

LearnPhase phase = PHASE_REST_CALIB;

bool mpuAvailable = false;
bool haveValidMpuSample = false;

unsigned long lastLoopMs = 0;
unsigned long lastDebugMs = 0;
unsigned long lastMpuRecoverMs = 0;

int restCalibCount = 0;
int runCalibCount = 0;
int motorOnCounter = 0;
int motorOffCounter = 0;
int mpuBadSampleCount = 0;

float restSumSensorV = 0.0f;
float restSumVibration = 0.0f;
float runSumCurrentA = 0.0f;
float runSumVibration = 0.0f;

float restBaselineSensorV = 2.5f;
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

float filteredCurrentA = 0.0f;
float lastAdcNodeVoltageV = 0.0f;
float lastSensorOutputVoltageV = 0.0f;
float lastGoodVibrationRaw = 0.0f;
float lastGoodVibrationRms = 0.0f;
float lastGoodTempC = 0.0f;

float vibSquares[RMS_WINDOW];
int vibIndex = 0;
int vibCount = 0;

// --------------------------------------------------
// Helpers
// --------------------------------------------------
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
  return maxf2(baseline * 1.65f, baseline + 0.040f);
}

float currentDangerThresholdFromRun(float baseline) {
  return maxf2(baseline * 2.30f, baseline + 0.085f);
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

float demoRestVibrationRawCap() {
  return restBaselineVibration + DEMO_REST_VIB_RAW_MARGIN;
}

bool mechanicsLookQuietForDemo(float vibrationRaw) {
  return isfinite(vibrationRaw) && vibrationRaw < demoRestVibrationRawCap();
}

float demoRestCurrentCapA() {
  return threshCurrentDangerA > 0.0f
    ? (threshCurrentDangerA + MOTOR_OFF_CURRENT_MARGIN_A + DEMO_REST_CURRENT_HEADROOM_A)
    : (runBaselineCurrentA > 0.0f
      ? (runBaselineCurrentA + MOTOR_OFF_CURRENT_MARGIN_A + DEMO_REST_CURRENT_HEADROOM_A)
      : (restBaselineCurrentA + MOTOR_OFF_CURRENT_MARGIN_A + DEMO_REST_CURRENT_HEADROOM_A));
}

bool motorLooksStoppedForDemo(float signedCurrentA, float currentA, float vibrationRaw, float vibrationRms) {
  const bool rawQuiet = mechanicsLookQuietForDemo(vibrationRaw);
  const bool rmsQuiet = vibrationRms < (restBaselineVibration + DEMO_REST_VIB_MARGIN);

  if (!rawQuiet && !rmsQuiet) {
    return false;
  }

  if (signedCurrentA <= ACS712_ZERO_CLAMP_A) {
    return true;
  }

  return currentA < demoRestCurrentCapA();
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

float readAcs712AdcNodeVoltageV() {
  uint32_t sumMv = 0;

  for (int i = 0; i < ACS712_ADC_SAMPLES; i++) {
    sumMv += analogReadMilliVolts(ACS712_ADC_PIN);
    delayMicroseconds(250);
  }

  return (sumMv / (float)ACS712_ADC_SAMPLES) / 1000.0f;
}

float adcNodeToSensorOutputVoltageV(float adcNodeVoltageV) {
  const float dividerGain = (ACS712_DIVIDER_R_TOP_OHMS + ACS712_DIVIDER_R_BOTTOM_OHMS) / ACS712_DIVIDER_R_BOTTOM_OHMS;
  return adcNodeVoltageV * dividerGain;
}

float signedCurrentFromSensorVoltage(float sensorOutputVoltageV, float zeroReferenceVoltageV) {
  float signedCurrentA = (sensorOutputVoltageV - zeroReferenceVoltageV) / ACS712_SENSITIVITY_V_PER_A;

  if (ACS712_CURRENT_INVERT) {
    signedCurrentA = -signedCurrentA;
  }

  if (!isfinite(signedCurrentA)) {
    signedCurrentA = 0.0f;
  }

  return signedCurrentA;
}

float currentAbsFromSigned(float signedCurrentA) {
  if (!isfinite(signedCurrentA)) {
    return 0.0f;
  }

  float currentAbsA = fabsf(signedCurrentA);
  if (!isfinite(currentAbsA) || currentAbsA < ACS712_ZERO_CLAMP_A) {
    return 0.0f;
  }

  return currentAbsA;
}

float smoothCurrentAbs(float currentAbsA) {
  if (!isfinite(currentAbsA)) {
    currentAbsA = 0.0f;
  }

  filteredCurrentA = ACS712_FILTER_ALPHA * currentAbsA + (1.0f - ACS712_FILTER_ALPHA) * filteredCurrentA;

  if (filteredCurrentA < ACS712_ZERO_CLAMP_A) {
    filteredCurrentA = 0.0f;
  }

  return filteredCurrentA;
}

void trackRestZeroReference(float sensorOutputVoltageV) {
  if (!isfinite(sensorOutputVoltageV)) {
    return;
  }

  restBaselineSensorV =
    ACS712_REST_ZERO_TRACK_ALPHA * sensorOutputVoltageV +
    (1.0f - ACS712_REST_ZERO_TRACK_ALPHA) * restBaselineSensorV;
}

bool configureMpuSensor() {
  if (!mpu.begin()) {
    mpuAvailable = false;
    return false;
  }

  mpuAvailable = true;
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  return true;
}

void attemptMpuRecovery(unsigned long nowMs) {
  if (nowMs - lastMpuRecoverMs < MPU_RECOVER_COOLDOWN_MS) {
    return;
  }

  lastMpuRecoverMs = nowMs;
  Serial.println("# MPU_RECOVER_ATTEMPT");
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.setTimeOut(50);
  delay(5);

  if (configureMpuSensor()) {
    mpuBadSampleCount = 0;
    Serial.println("# MPU_RECOVER_OK");
  } else {
    Serial.println("# MPU_RECOVER_FAIL");
  }
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
  float tempCandidate = temp.temperature;
  const bool implausibleTempJump =
    haveValidMpuSample &&
    isfinite(tempCandidate) &&
    fabsf(tempCandidate - lastGoodTempC) > MPU_TEMP_MAX_STEP_C;

  if (!isfinite(totalAcc) || !isfinite(tempCandidate) || tempCandidate < MPU_TEMP_MIN_C || tempCandidate > MPU_TEMP_MAX_C || implausibleTempJump) {
    mpuBadSampleCount++;
    if (mpuBadSampleCount >= MPU_BAD_SAMPLE_LIMIT) {
      attemptMpuRecovery(millis());
    }

    if (haveValidMpuSample) {
      vibrationRaw = lastGoodVibrationRaw;
      vibrationRms = lastGoodVibrationRms;
      tempC = lastGoodTempC;
    }
    return;
  }

  mpuBadSampleCount = 0;
  vibrationRaw = fabsf(totalAcc - GRAVITY_MS2);
  if (!isfinite(vibrationRaw)) {
    vibrationRaw = 0.0f;
  }

  vibrationRms = computeRms(vibrationRaw);
  if (!isfinite(vibrationRms)) {
    vibrationRms = 0.0f;
  }

  tempC = tempCandidate;
  if (!isfinite(tempC)) {
    tempC = 0.0f;
  }

  lastGoodVibrationRaw = vibrationRaw;
  lastGoodVibrationRms = vibrationRms;
  lastGoodTempC = tempC;
  haveValidMpuSample = true;
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
  Serial.print(" adc_v=");
  Serial.print(lastAdcNodeVoltageV, 3);
  Serial.print(" acs_v=");
  Serial.print(lastSensorOutputVoltageV, 3);
  Serial.print(" zero_v=");
  Serial.print(restBaselineSensorV, 3);
  Serial.print(" signed_current_a=");
  Serial.print(signedCurrentA, 4);
  Serial.print(" abs_current_a=");
  Serial.print(currentAbsA, 4);
  Serial.print(" run_current_a=");
  Serial.print(runBaselineCurrentA, 4);
  Serial.print(" thresh_current_a=");
  Serial.print(threshCurrentA, 4);
  Serial.print(" demo_rest_cap_a=");
  Serial.print(demoRestCurrentCapA(), 4);
  Serial.print(" demo_rest_vib_raw_cap=");
  Serial.print(demoRestVibrationRawCap(), 4);
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
  filteredCurrentA = 0.0f;
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

// --------------------------------------------------
// Setup
// --------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1500);

  for (int i = 0; i < RMS_WINDOW; i++) {
    vibSquares[i] = 0.0f;
  }

  pinMode(ACS712_ADC_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(ACS712_ADC_PIN, ADC_11db);

  Serial.println("# BOOT_OK");
  Serial.print("# RESET_REASON=");
  Serial.println(resetReasonText(esp_reset_reason()));
  Serial.println("# SENSOR=ACS712_5A_GPIO35_DIVIDER_10K_20K");

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.setTimeOut(50);
  delay(50);

  if (configureMpuSensor()) {
    Serial.println("# MPU_OK");
  } else {
    Serial.println("# MPU_FAIL");
  }

  Serial.println("# Step 1: keep motor OFF during startup calibration");
  Serial.println("# Step 2: when asked, turn motor ON and let it spin freely");
  Serial.println("# Step 3: after free-run learning, only overload/blocking should trigger anomaly");
  Serial.println("timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status,calib_count,calib_total,baseline_vib,baseline_current,thresh_vib,thresh_current");
}

// --------------------------------------------------
// Loop
// --------------------------------------------------
void loop() {
  if (millis() - lastLoopMs < LOOP_MS) {
    return;
  }

  lastLoopMs = millis();

  lastAdcNodeVoltageV = readAcs712AdcNodeVoltageV();
  lastSensorOutputVoltageV = adcNodeToSensorOutputVoltageV(lastAdcNodeVoltageV);

  float vibrationRaw = 0.0f;
  float vibrationRms = 0.0f;
  float tempC = 0.0f;
  readVibration(vibrationRaw, vibrationRms, tempC);

  if (phase == PHASE_REST_CALIB) {
    restCalibCount++;
    restSumSensorV += lastSensorOutputVoltageV;
    restSumVibration += vibrationRms;

    float runningZeroVoltageV = restSumSensorV / restCalibCount;
    float signedCurrentA = signedCurrentFromSensorVoltage(lastSensorOutputVoltageV, runningZeroVoltageV);
    float currentA = smoothCurrentAbs(currentAbsFromSigned(signedCurrentA));

    uiBaselineCurrentA = 0.0f;
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
      restBaselineSensorV = runningZeroVoltageV;
      restBaselineCurrentA = 0.0f;
      restBaselineVibration = uiBaselineVibration;
      phase = PHASE_WAIT_FREE_RUN;
      filteredCurrentA = 0.0f;

      Serial.print("# REST_BASELINE_READY zero_v=");
      Serial.print(restBaselineSensorV, 3);
      Serial.print(" vibration=");
      Serial.println(restBaselineVibration, 4);
      Serial.println("# TURN_MOTOR_ON_NOW and let it spin freely");
    }

    return;
  }

  float signedCurrentA = signedCurrentFromSensorVoltage(lastSensorOutputVoltageV, restBaselineSensorV);
  float currentA = smoothCurrentAbs(currentAbsFromSigned(signedCurrentA));

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
      filteredCurrentA = 0.0f;
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
      vibrationWarnThresholdFromRun(uiBaselineVibration),
      currentWarnThresholdFromRun(uiBaselineCurrentA)
    );

    if (runCalibCount >= RUN_CALIB_SAMPLES) {
      finishRunCalibration();
    }

    return;
  }

  // PHASE_ACTIVE
  uiBaselineCurrentA = runBaselineCurrentA;
  uiBaselineVibration = runBaselineVibration;

  bool demoRestEvidence = DEMO_FORCE_ZERO_WHEN_REST && motorLooksStoppedForDemo(signedCurrentA, currentA, vibrationRaw, vibrationRms);

  if (demoRestEvidence || motorLooksStopped(currentA, vibrationRms)) {
    motorOffCounter++;
  } else {
    motorOffCounter = 0;
  }

  bool motorRunning = motorOffCounter < MOTOR_OFF_CONFIRM_COUNT;
  if (!motorRunning) {
    trackRestZeroReference(lastSensorOutputVoltageV);
    filteredCurrentA = 0.0f;
  }

  float currentForUi = (!motorRunning && DEMO_FORCE_ZERO_WHEN_REST) ? 0.0f : currentA;
  float baselineCurrentForUi = (!motorRunning && DEMO_FORCE_ZERO_WHEN_REST) ? 0.0f : uiBaselineCurrentA;

  bool currentWarn = motorRunning && currentForUi > threshCurrentA;
  bool currentDanger = motorRunning && currentForUi > threshCurrentDangerA;
  bool vibWarn = motorRunning && vibrationRms > threshVibration;
  bool vibDanger = motorRunning && vibrationRms > threshVibrationDanger;

  const char *status = activeStatus(motorRunning, currentWarn, currentDanger, vibWarn, vibDanger);

  printDebugNote(millis(), signedCurrentA, currentA);

  printCsvLine(
    millis(),
    currentForUi,
    vibrationRaw,
    vibrationRms,
    tempC,
    status,
    calibrationCountForUi(),
    TOTAL_CALIB_SAMPLES,
    uiBaselineVibration,
    baselineCurrentForUi,
    threshVibration,
    threshCurrentA
  );
}
