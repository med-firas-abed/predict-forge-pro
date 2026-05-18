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
const unsigned long LOOP_MS = 150;
const unsigned long DEBUG_NOTE_MS = 1000;
const unsigned long MPU_RECOVER_COOLDOWN_MS = 1500;

// --------------------------------------------------
// I2C / MPU settings
// --------------------------------------------------
const uint32_t I2C_CLOCK_HZ = 50000;
const float MPU_TEMP_MIN_C = -20.0f;
const float MPU_TEMP_MAX_C = 85.0f;
const float MPU_TEMP_MAX_STEP_C = 4.0f;
const float MPU_VIB_RAW_MAX_MS2 = 5.0f;
const float MPU_VIB_RAW_MAX_STEP_MS2 = 2.0f;
const int MPU_BAD_SAMPLE_LIMIT = 4;

// --------------------------------------------------
// ACS712 settings
// This version assumes a 5A ACS712 module.
// If you have a 20A module, use 0.100f.
// If you have a 30A module, use 0.066f.
// --------------------------------------------------
const bool PRINT_DEBUG_NOTES = false;
const bool ACS712_CURRENT_INVERT = false;
const int ACS712_ADC_SAMPLES = 12;
const float ACS712_SENSITIVITY_V_PER_A = 0.185f;
const float ACS712_ZERO_CLAMP_A = 0.005f;
const float ACS712_FILTER_ALPHA = 0.55f;
const float ACS712_REST_ZERO_TRACK_ALPHA = 0.06f;

// Divider used between ACS712 OUT and ESP32 GPIO35:
// ACS OUT -> 10k -> GPIO35 -> 20k -> GND
const float ACS712_DIVIDER_R_TOP_OHMS = 10000.0f;
const float ACS712_DIVIDER_R_BOTTOM_OHMS = 20000.0f;

// --------------------------------------------------
// Simple live mode
// Goal:
// 1. Learn motor OFF zero at startup.
// 2. Stream live current and vibration continuously.
// 3. Keep status simple: REST / RUNNING / BLOCKED.
// --------------------------------------------------
const int REST_CALIB_SAMPLES = 15;
const int REST_CONFIRM_COUNT = 4;
const int RUN_CONFIRM_COUNT = 2;
const int BLOCK_CONFIRM_COUNT = 2;
const float LIVE_ZERO_TRACK_CURRENT_CAP_A = 0.060f;
const float LIVE_REST_ENTER_CURRENT_A = 0.010f;
const float LIVE_REST_EXIT_CURRENT_A = 0.018f;
const float LIVE_REST_VIB_RAW_DELTA = 0.20f;
const float LIVE_REST_VIB_RMS_DELTA = 0.15f;
const float BLOCK_ENTER_CURRENT_A = 0.160f;
const float BLOCK_EXIT_CURRENT_A = 0.120f;

// --------------------------------------------------
// Vibration settings
// --------------------------------------------------
const float GRAVITY_MS2 = 9.81f;
const int RMS_WINDOW = 10;

// --------------------------------------------------
// State
// --------------------------------------------------
enum StreamPhase {
  PHASE_REST_CALIB,
  PHASE_LIVE
};

enum LiveState {
  LIVE_STATE_REST,
  LIVE_STATE_RUNNING,
  LIVE_STATE_BLOCKED
};

StreamPhase phase = PHASE_REST_CALIB;
LiveState liveState = LIVE_STATE_REST;

bool mpuAvailable = false;
bool haveValidMpuSample = false;

unsigned long lastLoopMs = 0;
unsigned long lastDebugMs = 0;
unsigned long lastMpuRecoverMs = 0;

int restCalibCount = 0;
int restConfirmCount = 0;
int runConfirmCount = 0;
int blockConfirmCount = 0;
int unblockConfirmCount = 0;
int mpuBadSampleCount = 0;

float restSumSensorV = 0.0f;
float restSumVibrationRaw = 0.0f;
float restSumVibrationRms = 0.0f;

float restBaselineSensorV = 2.5f;
float restBaselineVibrationRaw = 0.0f;
float restBaselineVibrationRms = 0.0f;

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

const char *phaseText(StreamPhase value) {
  switch (value) {
    case PHASE_REST_CALIB:
      return "REST_CALIB";
    case PHASE_LIVE:
      return "LIVE";
    default:
      return "UNKNOWN";
  }
}

const char *liveStateText(LiveState value) {
  switch (value) {
    case LIVE_STATE_REST:
      return "REST";
    case LIVE_STATE_RUNNING:
      return "RUNNING";
    case LIVE_STATE_BLOCKED:
      return "BLOCKED";
    default:
      return "UNKNOWN";
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
    delayMicroseconds(200);
  }

  return (sumMv / (float)ACS712_ADC_SAMPLES) / 1000.0f;
}

float adcNodeToSensorOutputVoltageV(float adcNodeVoltageV) {
  const float dividerGain =
    (ACS712_DIVIDER_R_TOP_OHMS + ACS712_DIVIDER_R_BOTTOM_OHMS) /
    ACS712_DIVIDER_R_BOTTOM_OHMS;
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

  filteredCurrentA =
    ACS712_FILTER_ALPHA * currentAbsA +
    (1.0f - ACS712_FILTER_ALPHA) * filteredCurrentA;

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
  float vibrationRawCandidate = fabsf(totalAcc - GRAVITY_MS2);
  const bool implausibleTempJump =
    haveValidMpuSample &&
    isfinite(tempCandidate) &&
    fabsf(tempCandidate - lastGoodTempC) > MPU_TEMP_MAX_STEP_C;
  const bool implausibleVibrationMagnitude =
    !isfinite(vibrationRawCandidate) ||
    vibrationRawCandidate > MPU_VIB_RAW_MAX_MS2;
  const bool implausibleVibrationJump =
    haveValidMpuSample &&
    isfinite(vibrationRawCandidate) &&
    fabsf(vibrationRawCandidate - lastGoodVibrationRaw) > MPU_VIB_RAW_MAX_STEP_MS2;

  if (!isfinite(totalAcc) ||
      !isfinite(tempCandidate) ||
      tempCandidate < MPU_TEMP_MIN_C ||
      tempCandidate > MPU_TEMP_MAX_C ||
      implausibleTempJump ||
      implausibleVibrationMagnitude ||
      implausibleVibrationJump) {
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
  vibrationRaw = vibrationRawCandidate;
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

bool mechanicsLookQuiet(float vibrationRaw, float vibrationRms) {
  return vibrationRaw < (restBaselineVibrationRaw + LIVE_REST_VIB_RAW_DELTA) &&
    vibrationRms < (restBaselineVibrationRms + LIVE_REST_VIB_RMS_DELTA);
}

bool machineLooksRestCurrent(float currentA) {
  return currentA < LIVE_REST_ENTER_CURRENT_A;
}

bool machineLooksRunningCurrent(float currentA) {
  return currentA > LIVE_REST_EXIT_CURRENT_A;
}

bool machineLooksBlockedCurrent(float currentA) {
  return currentA > BLOCK_ENTER_CURRENT_A;
}

bool machineLooksUnblockedCurrent(float currentA) {
  return currentA < BLOCK_EXIT_CURRENT_A;
}

const char *liveStatusText(LiveState state) {
  if (phase == PHASE_REST_CALIB) {
    return "CALIBRATING_REST";
  }

  return liveStateText(state);
}

void printDebugNote(
  unsigned long nowMs,
  float signedCurrentA,
  float currentAbsA,
  float vibrationRaw,
  float vibrationRms,
  bool quietNow,
  LiveState state
) {
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
  Serial.print(" vib_raw=");
  Serial.print(vibrationRaw, 4);
  Serial.print(" vib_rms=");
  Serial.print(vibrationRms, 4);
  Serial.print(" quiet=");
  Serial.print(quietNow ? 1 : 0);
  Serial.print(" state=");
  Serial.println(liveStateText(state));
}

void printCsvLine(
  unsigned long timestampMs,
  float currentA,
  float vibrationRaw,
  float vibrationRms,
  float tempC,
  const char *status
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
  Serial.println(status);
}

// --------------------------------------------------
// Setup
// --------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1200);

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
  Serial.println("# MODE=LIVE_ONLY_SIMPLE");

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.setTimeOut(50);
  delay(50);

  if (configureMpuSensor()) {
    Serial.println("# MPU_OK");
  } else {
    Serial.println("# MPU_FAIL");
  }

  Serial.println("# Step 1: keep motor OFF for startup zero calibration");
  Serial.println("# Step 2: after that, current and vibration stream live continuously");
  Serial.println("# CSV=timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status");
  Serial.println("timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status");
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
    restSumVibrationRaw += vibrationRaw;
    restSumVibrationRms += vibrationRms;

    float runningZeroVoltageV = restSumSensorV / restCalibCount;
    float signedCurrentA = signedCurrentFromSensorVoltage(lastSensorOutputVoltageV, runningZeroVoltageV);
    float currentA = smoothCurrentAbs(currentAbsFromSigned(signedCurrentA));

    printCsvLine(
      millis(),
      currentA,
      vibrationRaw,
      vibrationRms,
      tempC,
      "CALIBRATING_REST"
    );

    if (restCalibCount >= REST_CALIB_SAMPLES) {
      restBaselineSensorV = runningZeroVoltageV;
      restBaselineVibrationRaw = restSumVibrationRaw / restCalibCount;
      restBaselineVibrationRms = restSumVibrationRms / restCalibCount;
      filteredCurrentA = 0.0f;
      restConfirmCount = 0;
      runConfirmCount = 0;
      blockConfirmCount = 0;
      unblockConfirmCount = 0;
      liveState = LIVE_STATE_REST;
      phase = PHASE_LIVE;

      Serial.print("# LIVE_STREAM_READY zero_v=");
      Serial.print(restBaselineSensorV, 3);
      Serial.print(" rest_vib_raw=");
      Serial.print(restBaselineVibrationRaw, 4);
      Serial.print(" rest_vib_rms=");
      Serial.println(restBaselineVibrationRms, 4);
    }

    return;
  }

  float signedCurrentA = signedCurrentFromSensorVoltage(lastSensorOutputVoltageV, restBaselineSensorV);
  float currentA = smoothCurrentAbs(currentAbsFromSigned(signedCurrentA));
  const bool quietNow = mechanicsLookQuiet(vibrationRaw, vibrationRms);

  if (machineLooksRestCurrent(currentA)) {
    restConfirmCount++;
  } else {
    restConfirmCount = 0;
  }

  if (machineLooksRunningCurrent(currentA)) {
    runConfirmCount++;
  } else {
    runConfirmCount = 0;
  }

  if (machineLooksBlockedCurrent(currentA)) {
    blockConfirmCount++;
  } else {
    blockConfirmCount = 0;
  }

  if (machineLooksUnblockedCurrent(currentA)) {
    unblockConfirmCount++;
  } else {
    unblockConfirmCount = 0;
  }

  if (liveState == LIVE_STATE_REST) {
    if (runConfirmCount >= RUN_CONFIRM_COUNT) {
      liveState = LIVE_STATE_RUNNING;
    }
  } else if (liveState == LIVE_STATE_RUNNING) {
    if (blockConfirmCount >= BLOCK_CONFIRM_COUNT) {
      liveState = LIVE_STATE_BLOCKED;
    } else if (restConfirmCount >= REST_CONFIRM_COUNT) {
      liveState = LIVE_STATE_REST;
    }
  } else if (liveState == LIVE_STATE_BLOCKED) {
    if (restConfirmCount >= REST_CONFIRM_COUNT) {
      liveState = LIVE_STATE_REST;
    } else if (unblockConfirmCount >= RUN_CONFIRM_COUNT) {
      liveState = LIVE_STATE_RUNNING;
    }
  }

  if (liveState == LIVE_STATE_REST && quietNow && currentA < LIVE_ZERO_TRACK_CURRENT_CAP_A) {
    trackRestZeroReference(lastSensorOutputVoltageV);
    signedCurrentA = signedCurrentFromSensorVoltage(lastSensorOutputVoltageV, restBaselineSensorV);
    currentA = smoothCurrentAbs(currentAbsFromSigned(signedCurrentA));
  }

  if (liveState == LIVE_STATE_REST) {
    filteredCurrentA = 0.0f;
    currentA = 0.0f;
  }

  const char *status = liveStatusText(liveState);

  printDebugNote(
    millis(),
    signedCurrentA,
    currentA,
    vibrationRaw,
    vibrationRms,
    quietNow,
    liveState
  );

  printCsvLine(
    millis(),
    currentA,
    vibrationRaw,
    vibrationRms,
    tempC,
    status
  );
}
