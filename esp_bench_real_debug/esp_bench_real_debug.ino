#include <Wire.h>
#include <Adafruit_INA219.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>
#include <stdio.h>

Adafruit_INA219 ina219;
Adafruit_MPU6050 mpu;

// --------------------------------------------------
// Hardware
// --------------------------------------------------
const int LED_GREEN_PIN = 19;
const int LED_WHITE_PIN = 18;
const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;

// If current is reversed with your wiring, set this to true.
const bool CURRENT_INVERT = false;

// Better default for a small motor.
// Change to true only if startup peaks saturate.
const bool INA_USE_32V_2A = false;

// Debug options
const bool CURRENT_DEBUG_NOTES = true;

// false = keep your normal demo behavior (delta above baseline on the chart)
// true  = send absolute current to the page for debugging
const bool CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI = false;

// --------------------------------------------------
// Timing
// --------------------------------------------------
const unsigned long LOOP_MS = 250;
unsigned long lastLoopMs = 0;

// --------------------------------------------------
// Sensor availability
// --------------------------------------------------
bool inaAvailable = false;
bool mpuAvailable = false;

// --------------------------------------------------
// Current filtering (INA219)
// current_a sent to UI = delta above rest baseline
// unless CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI = true
// --------------------------------------------------
const int CURRENT_WINDOW = 5;
float currentWindow[CURRENT_WINDOW];
int currentWindowCount = 0;
int currentWindowIndex = 0;

float filteredCurrentAbs = 0.0f;
float displayedCurrent = 0.0f;

const float CURRENT_ZERO_CLAMP = 0.003f;
const float CURRENT_UI_ZERO_CLAMP = 0.003f;
const float CURRENT_RISE_ALPHA = 0.25f;
const float CURRENT_FALL_ALPHA = 0.55f;
const float CURRENT_FAST_ALPHA = 0.50f;
const float CURRENT_SLOW_ALPHA = 0.18f;
const float CURRENT_STATE_CHANGE_THRESHOLD = 0.020f;
const float CURRENT_QUANT_STEP = 0.002f;

// Raw current debug values
float lastCurrentSignedRaw = 0.0f;
float lastCurrentAbsForFilter = 0.0f;
float lastCurrentMedian = 0.0f;
float lastCurrentDelta = 0.0f;
float lastCurrentUi = 0.0f;
float lastBusVoltage = 0.0f;
float lastShuntMv = 0.0f;
float lastLoadVoltage = 0.0f;

// --------------------------------------------------
// Current-based operating cases
// Deltas above baseline current
// --------------------------------------------------
const float CASE_REST_DELTA_MAX = 0.008f;
const float CASE_NO_LOAD_DELTA_MAX = 0.050f;
const float CASE_ONE_WHEEL_DELTA_MAX = 0.100f;
const float CASE_TWO_WHEELS_DELTA_MAX = 0.180f;
const float CASE_FINGER_DELTA_MIN = 0.300f;

const float CURRENT_WARN_DELTA = 0.180f;
const float CURRENT_DANGER_DELTA = 0.300f;
const float CASE_HYST_A = 0.010f;

// --------------------------------------------------
// Vibration / MPU6050
// --------------------------------------------------
const int RMS_WINDOW = 20;
float vibBuffer[RMS_WINDOW];
int vibIdx = 0;
int vibCount = 0;

const float GRAVITY_MS2 = 9.81f;
const float VIB_ALPHA = 0.20f;
float filteredVibRms = 0.0f;

const float VIB_WARN_FACTOR = 2.50f;
const float VIB_WARN_MIN_OFFSET = 0.25f;
const float VIB_DANGER_FACTOR = 4.00f;
const float VIB_DANGER_MIN_OFFSET = 0.60f;

// --------------------------------------------------
// Calibration
// --------------------------------------------------
bool calibrated = false;
int calibCount = 0;
const int CALIB_SAMPLES = 30;

float calibSumVib = 0.0f;
float calibSumCurrent = 0.0f;

float baseline_vib = 0.0f;
float baseline_current = 0.0f;

float THRESH_VIB = 0.0f;
float THRESH_VIB_DANGER = 0.0f;
float THRESH_CURRENT = 0.0f;
float THRESH_CURRENT_DANGER = 0.0f;

// --------------------------------------------------
// Hysteresis latches
// --------------------------------------------------
const float HYSTERESIS_RATIO = 0.10f;
bool currentWarnLatched = false;
bool currentDangerLatched = false;
bool vibWarnLatched = false;
bool vibDangerLatched = false;

// --------------------------------------------------
// Operating cases
// --------------------------------------------------
enum OperatingCase {
  OP_REST,
  OP_NO_LOAD,
  OP_ONE_WHEEL,
  OP_TWO_WHEELS,
  OP_OVERLOAD,
  OP_FINGER
};

OperatingCase operatingCase = OP_REST;

// --------------------------------------------------
// LED modes
// --------------------------------------------------
enum LedMode {
  LED_MODE_NORMAL,
  LED_MODE_WARNING,
  LED_MODE_DANGER
};

LedMode ledMode = LED_MODE_WARNING;
bool whiteBlinkState = false;
unsigned long lastBlinkMs = 0;
const unsigned long DANGER_BLINK_MS = 120;

// --------------------------------------------------
// Helpers
// --------------------------------------------------
float quantizeValue(float value, float step) {
  if (step <= 0.0f) return value;
  return roundf(value / step) * step;
}

void sortSmallArray(float *arr, int n) {
  for (int i = 1; i < n; i++) {
    float key = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
}

void pushCurrentWindow(float value) {
  currentWindow[currentWindowIndex] = value;
  currentWindowIndex = (currentWindowIndex + 1) % CURRENT_WINDOW;
  if (currentWindowCount < CURRENT_WINDOW) currentWindowCount++;
}

float getCurrentMedian() {
  if (currentWindowCount <= 0) return 0.0f;

  float temp[CURRENT_WINDOW];
  for (int i = 0; i < currentWindowCount; i++) {
    temp[i] = currentWindow[i];
  }

  sortSmallArray(temp, currentWindowCount);

  if (currentWindowCount % 2 == 1) {
    return temp[currentWindowCount / 2];
  }

  int mid = currentWindowCount / 2;
  return 0.5f * (temp[mid - 1] + temp[mid]);
}

float readCurrentSignedRaw() {
  if (!inaAvailable) {
    lastBusVoltage = 0.0f;
    lastShuntMv = 0.0f;
    lastLoadVoltage = 0.0f;
    lastCurrentSignedRaw = 0.0f;
    return 0.0f;
  }

  lastBusVoltage = ina219.getBusVoltage_V();
  lastShuntMv = ina219.getShuntVoltage_mV();
  lastLoadVoltage = lastBusVoltage + (lastShuntMv / 1000.0f);

  float current = ina219.getCurrent_mA() / 1000.0f;
  if (CURRENT_INVERT) {
    current = -current;
  }

  lastCurrentSignedRaw = current;
  return current;
}

float readCurrentStableAbsolute() {
  float signedRaw = readCurrentSignedRaw();

  float currentForFilter = signedRaw;
  if (currentForFilter < 0.0f) {
    currentForFilter = 0.0f;
  }
  if (currentForFilter < CURRENT_ZERO_CLAMP) {
    currentForFilter = 0.0f;
  }

  lastCurrentAbsForFilter = currentForFilter;

  pushCurrentWindow(currentForFilter);
  float medianCurrent = getCurrentMedian();
  lastCurrentMedian = medianCurrent;

  float alpha = (medianCurrent >= filteredCurrentAbs) ? CURRENT_RISE_ALPHA : CURRENT_FALL_ALPHA;
  filteredCurrentAbs = alpha * medianCurrent + (1.0f - alpha) * filteredCurrentAbs;

  if (filteredCurrentAbs < CURRENT_ZERO_CLAMP) {
    filteredCurrentAbs = 0.0f;
  }

  return filteredCurrentAbs;
}

float shapeCurrentForUi(float currentDelta) {
  if (currentDelta < CURRENT_UI_ZERO_CLAMP) {
    displayedCurrent = 0.0f;
    return 0.0f;
  }

  float diff = currentDelta - displayedCurrent;
  float alpha = (fabsf(diff) > CURRENT_STATE_CHANGE_THRESHOLD)
    ? CURRENT_FAST_ALPHA
    : CURRENT_SLOW_ALPHA;

  displayedCurrent += alpha * diff;
  displayedCurrent = quantizeValue(displayedCurrent, CURRENT_QUANT_STEP);

  if (displayedCurrent < CURRENT_UI_ZERO_CLAMP) {
    displayedCurrent = 0.0f;
  }

  return displayedCurrent;
}

float computeRMS(float newVal) {
  vibBuffer[vibIdx] = newVal * newVal;
  vibIdx = (vibIdx + 1) % RMS_WINDOW;
  if (vibCount < RMS_WINDOW) vibCount++;

  float sum = 0.0f;
  for (int i = 0; i < vibCount; i++) {
    sum += vibBuffer[i];
  }

  return sqrtf(sum / vibCount);
}

float smoothValue(float raw, float prev, float alpha) {
  return alpha * raw + (1.0f - alpha) * prev;
}

bool applyHysteresis(bool latched, float value, float threshold) {
  float enterThreshold = threshold;
  float exitThreshold = threshold * (1.0f - HYSTERESIS_RATIO);

  if (!latched && value > enterThreshold) return true;
  if (latched && value < exitThreshold) return false;
  return latched;
}

void printCurrentDebugNote(float baselineCurrentValue, float currentDelta, float currentUi) {
  if (!CURRENT_DEBUG_NOTES) return;

  lastCurrentDelta = currentDelta;
  lastCurrentUi = currentUi;

  Serial.print("# DEBUG current_signed_raw_a=");
  Serial.print(lastCurrentSignedRaw, 4);
  Serial.print(" abs_for_filter_a=");
  Serial.print(lastCurrentAbsForFilter, 4);
  Serial.print(" median_a=");
  Serial.print(lastCurrentMedian, 4);
  Serial.print(" baseline_a=");
  Serial.print(baselineCurrentValue, 4);
  Serial.print(" delta_a=");
  Serial.print(currentDelta, 4);
  Serial.print(" ui_a=");
  Serial.print(currentUi, 4);
  Serial.print(" bus_v=");
  Serial.print(lastBusVoltage, 3);
  Serial.print(" shunt_mv=");
  Serial.print(lastShuntMv, 3);
  Serial.print(" load_v=");
  Serial.println(lastLoadVoltage, 3);
}

// --------------------------------------------------
// Operating case logic
// --------------------------------------------------
const char *operatingCaseTag(OperatingCase op) {
  switch (op) {
    case OP_REST: return "REST";
    case OP_NO_LOAD: return "NO_LOAD";
    case OP_ONE_WHEEL: return "ONE_WHEEL";
    case OP_TWO_WHEELS: return "TWO_WHEELS";
    case OP_OVERLOAD: return "OVERLOAD";
    case OP_FINGER: return "FINGER";
    default: return "UNKNOWN";
  }
}

void updateOperatingCase(float currentDelta) {
  switch (operatingCase) {
    case OP_REST:
      if (currentDelta > CASE_REST_DELTA_MAX + CASE_HYST_A) operatingCase = OP_NO_LOAD;
      break;

    case OP_NO_LOAD:
      if (currentDelta < CASE_REST_DELTA_MAX - CASE_HYST_A) operatingCase = OP_REST;
      else if (currentDelta > CASE_NO_LOAD_DELTA_MAX + CASE_HYST_A) operatingCase = OP_ONE_WHEEL;
      break;

    case OP_ONE_WHEEL:
      if (currentDelta < CASE_NO_LOAD_DELTA_MAX - CASE_HYST_A) operatingCase = OP_NO_LOAD;
      else if (currentDelta > CASE_ONE_WHEEL_DELTA_MAX + CASE_HYST_A) operatingCase = OP_TWO_WHEELS;
      break;

    case OP_TWO_WHEELS:
      if (currentDelta < CASE_ONE_WHEEL_DELTA_MAX - CASE_HYST_A) operatingCase = OP_ONE_WHEEL;
      else if (currentDelta > CASE_TWO_WHEELS_DELTA_MAX + CASE_HYST_A) operatingCase = OP_OVERLOAD;
      break;

    case OP_OVERLOAD:
      if (currentDelta < CASE_TWO_WHEELS_DELTA_MAX - CASE_HYST_A) operatingCase = OP_TWO_WHEELS;
      else if (currentDelta > CASE_FINGER_DELTA_MIN + CASE_HYST_A) operatingCase = OP_FINGER;
      break;

    case OP_FINGER:
      if (currentDelta < CASE_FINGER_DELTA_MIN - CASE_HYST_A) operatingCase = OP_OVERLOAD;
      break;
  }
}

// --------------------------------------------------
// LEDs
// --------------------------------------------------
void setLedMode(LedMode newMode) {
  if (ledMode != newMode) {
    ledMode = newMode;
    if (ledMode != LED_MODE_DANGER) {
      whiteBlinkState = false;
    }
  }
}

void updateLeds() {
  if (ledMode == LED_MODE_NORMAL) {
    digitalWrite(LED_GREEN_PIN, HIGH);
    digitalWrite(LED_WHITE_PIN, LOW);
    return;
  }

  if (ledMode == LED_MODE_WARNING) {
    digitalWrite(LED_GREEN_PIN, LOW);
    digitalWrite(LED_WHITE_PIN, HIGH);
    return;
  }

  digitalWrite(LED_GREEN_PIN, LOW);
  if (millis() - lastBlinkMs >= DANGER_BLINK_MS) {
    lastBlinkMs = millis();
    whiteBlinkState = !whiteBlinkState;
  }
  digitalWrite(LED_WHITE_PIN, whiteBlinkState ? HIGH : LOW);
}

// --------------------------------------------------
// Status for app
// --------------------------------------------------
void buildStatusString(
  char *out,
  size_t outSize,
  bool isDanger,
  bool currentWarn,
  bool vibWarn,
  OperatingCase op
) {
  const char *caseTag = operatingCaseTag(op);

  if (isDanger) {
    snprintf(out, outSize, "ANOMALY_DANGER_%s", caseTag);
    return;
  }

  if (currentWarn && vibWarn) {
    snprintf(out, outSize, "ANOMALY_BOTH_%s", caseTag);
    return;
  }

  if (currentWarn) {
    snprintf(out, outSize, "ANOMALY_CURRENT_%s", caseTag);
    return;
  }

  if (vibWarn) {
    snprintf(out, outSize, "ANOMALY_VIB_%s", caseTag);
    return;
  }

  snprintf(out, outSize, "NORMAL_%s", caseTag);
}

// --------------------------------------------------
// CSV output for ExperimentPage
// --------------------------------------------------
void printCsvLine(
  unsigned long timestampMs,
  float current,
  float vibRaw,
  float vibRms,
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
  Serial.print(current, 4);
  Serial.print(",");
  Serial.print(vibRaw, 4);
  Serial.print(",");
  Serial.print(vibRms, 4);
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

// --------------------------------------------------
// Setup
// --------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_WHITE_PIN, OUTPUT);
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_WHITE_PIN, LOW);

  for (int i = 0; i < CURRENT_WINDOW; i++) {
    currentWindow[i] = 0.0f;
  }

  for (int i = 0; i < RMS_WINDOW; i++) {
    vibBuffer[i] = 0.0f;
  }

  setLedMode(LED_MODE_WARNING);
  updateLeds();

  Serial.println("# BOOT_OK");

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

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
    Serial.println("# INA219_FAIL_CURRENT_OFF_MODE");
  }

  if (mpu.begin()) {
    mpuAvailable = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("# MPU_OK");
  } else {
    mpuAvailable = false;
    Serial.println("# MPU_FAIL_VIB_OFF_MODE");
  }

  Serial.println("# Startup calibration: keep motor OFF / at rest");
  Serial.println("timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status,calib_count,calib_total,baseline_vib,baseline_current,thresh_vib,thresh_current");
}

// --------------------------------------------------
// Loop
// --------------------------------------------------
void loop() {
  updateLeds();

  if (millis() - lastLoopMs < LOOP_MS) return;
  lastLoopMs = millis();

  float currentAbs = readCurrentStableAbsolute();

  float vibRaw = 0.0f;
  float tempC = 0.0f;

  if (mpuAvailable) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    float ax = a.acceleration.x;
    float ay = a.acceleration.y;
    float az = a.acceleration.z;
    float totalAcc = sqrtf(ax * ax + ay * ay + az * az);

    vibRaw = fabsf(totalAcc - GRAVITY_MS2);
    filteredVibRms = smoothValue(computeRMS(vibRaw), filteredVibRms, VIB_ALPHA);
    tempC = temp.temperature;
  } else {
    vibRaw = 0.0f;
    filteredVibRms = 0.0f;
    tempC = 0.0f;
  }

  if (!calibrated) {
    setLedMode(LED_MODE_WARNING);

    calibCount++;
    calibSumVib += filteredVibRms;
    calibSumCurrent += currentAbs;

    float runningBaselineVib = calibSumVib / calibCount;
    float runningBaselineCurrent = calibSumCurrent / calibCount;
    float runningThreshVib = fmaxf(
      runningBaselineVib * VIB_WARN_FACTOR,
      runningBaselineVib + VIB_WARN_MIN_OFFSET
    );

    printCsvLine(
      millis(),
      currentAbs,
      vibRaw,
      filteredVibRms,
      tempC,
      "CALIBRATING",
      calibCount,
      CALIB_SAMPLES,
      runningBaselineVib,
      runningBaselineCurrent,
      runningThreshVib,
      CURRENT_WARN_DELTA
    );

    if (calibCount >= CALIB_SAMPLES) {
      baseline_vib = runningBaselineVib;
      baseline_current = runningBaselineCurrent;

      THRESH_VIB = fmaxf(
        baseline_vib * VIB_WARN_FACTOR,
        baseline_vib + VIB_WARN_MIN_OFFSET
      );
      THRESH_VIB_DANGER = fmaxf(
        baseline_vib * VIB_DANGER_FACTOR,
        baseline_vib + VIB_DANGER_MIN_OFFSET
      );
      THRESH_CURRENT = CURRENT_WARN_DELTA;
      THRESH_CURRENT_DANGER = CURRENT_DANGER_DELTA;

      calibrated = true;
      operatingCase = OP_REST;

      Serial.print("# READY | baseline_current_abs=");
      Serial.print(baseline_current, 4);
      Serial.print(" | baseline_vibration=");
      Serial.print(baseline_vib, 4);
      Serial.print(" | current_warn_delta=");
      Serial.print(THRESH_CURRENT, 4);
      Serial.print(" | current_danger_delta=");
      Serial.print(THRESH_CURRENT_DANGER, 4);
      Serial.print(" | vib_warn=");
      Serial.print(THRESH_VIB, 4);
      Serial.print(" | vib_danger=");
      Serial.println(THRESH_VIB_DANGER, 4);
    }

    return;
  }

  float currentDelta = currentAbs - baseline_current;
  if (currentDelta < 0.0f) {
    currentDelta = 0.0f;
  }

  float currentForUi = shapeCurrentForUi(currentDelta);
  printCurrentDebugNote(baseline_current, currentDelta, currentForUi);

  if (currentForUi < CURRENT_UI_ZERO_CLAMP) {
    operatingCase = OP_REST;
  } else {
    updateOperatingCase(currentForUi);
  }

  currentWarnLatched = applyHysteresis(currentWarnLatched, currentForUi, THRESH_CURRENT);
  currentDangerLatched = applyHysteresis(currentDangerLatched, currentForUi, THRESH_CURRENT_DANGER);

  if (mpuAvailable) {
    vibWarnLatched = applyHysteresis(vibWarnLatched, filteredVibRms, THRESH_VIB);
    vibDangerLatched = applyHysteresis(vibDangerLatched, filteredVibRms, THRESH_VIB_DANGER);
  } else {
    vibWarnLatched = false;
    vibDangerLatched = false;
  }

  bool currentWarn = currentWarnLatched || (operatingCase == OP_OVERLOAD);
  bool currentDanger = currentDangerLatched || (operatingCase == OP_FINGER);
  bool vibWarn = vibWarnLatched;
  bool vibDanger = vibDangerLatched;
  bool isDanger = currentDanger || vibDanger;
  bool isWarning = (!isDanger) && (currentWarn || vibWarn);

  if (isDanger) {
    setLedMode(LED_MODE_DANGER);
  } else if (isWarning) {
    setLedMode(LED_MODE_WARNING);
  } else {
    setLedMode(LED_MODE_NORMAL);
  }

  char status[48];
  buildStatusString(status, sizeof(status), isDanger, currentWarn, vibWarn, operatingCase);

  float currentCsv = CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI ? currentAbs : currentForUi;
  float currentThresholdCsv = CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI
    ? (baseline_current + THRESH_CURRENT)
    : THRESH_CURRENT;

  printCsvLine(
    millis(),
    currentCsv,
    vibRaw,
    filteredVibRms,
    tempC,
    status,
    CALIB_SAMPLES,
    CALIB_SAMPLES,
    baseline_vib,
    baseline_current,
    THRESH_VIB,
    currentThresholdCsv
  );
}
