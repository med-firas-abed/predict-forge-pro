# INA219 Current Debug Patch

This patch helps when:

- vibration moves correctly in `Experience ESP32`
- but `Courbe courant` stays at `0.000 A`

The goal is to debug the INA219 path **without breaking the existing 12-column CSV format** already expected by `ExperimentPage.tsx`.

The page already ignores serial lines starting with `#`, so we can add live debug notes safely.

## What this patch gives you

- keeps the normal CSV line:

```text
timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status,calib_count,calib_total,baseline_vib,baseline_current,thresh_vib,thresh_current
```

- adds debug note lines like:

```text
# DEBUG current_signed_raw_a=-0.0830 abs_for_filter_a=0.0000 median_a=0.0000 baseline_a=0.0000 delta_a=0.0000 ui_a=0.0000 bus_v=5.010 shunt_mv=-8.300 load_v=5.002
```

- optionally lets you send **absolute current** to the UI temporarily, to prove the INA219 is measuring something even if your delta logic is flattening the chart

## 1. Add these globals

Put them near your current-filter section:

```cpp
const bool CURRENT_DEBUG_NOTES = true;
const bool CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI = false;

float lastCurrentSignedRaw = 0.0f;
float lastCurrentAbsForFilter = 0.0f;
float lastCurrentMedian = 0.0f;
float lastCurrentDelta = 0.0f;
float lastCurrentUi = 0.0f;
float lastBusVoltage = 0.0f;
float lastShuntMv = 0.0f;
float lastLoadVoltage = 0.0f;
```

## 2. Replace `readCurrentInstantAbsolute()`

Replace your current function with this signed/raw version:

```cpp
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
```

## 3. Replace `readCurrentStableAbsolute()`

This keeps your current behavior, but stores the useful raw values for debugging:

```cpp
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
```

## 4. Add a debug-note printer

Put this near your other helper functions:

```cpp
void printCurrentDebugNote(float baselineCurrent, float currentDelta, float currentUi) {
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
  Serial.print(baselineCurrent, 4);
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
```

## 5. Patch the main `loop()`

After you compute:

```cpp
float currentAbs = readCurrentStableAbsolute();
...
float currentDelta = currentAbs - baseline_current;
...
float currentForUi = shapeCurrentForUi(currentDelta);
```

add:

```cpp
printCurrentDebugNote(baseline_current, currentDelta, currentForUi);
```

Then, before `printCsvLine(...)`, choose what to send to the page:

```cpp
float currentCsv = CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI ? currentAbs : currentForUi;
```

and replace:

```cpp
printCsvLine(
  millis(),
  currentForUi,
  vibRaw,
  filteredVibRms,
  tempC,
  status,
  CALIB_SAMPLES,
  CALIB_SAMPLES,
  baseline_vib,
  0.0f,
  THRESH_VIB,
  THRESH_CURRENT
);
```

with:

```cpp
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
  THRESH_CURRENT
);
```

## 6. How to interpret the debug lines

### Case A: sign reversed

If you see something like:

```text
current_signed_raw_a=-0.1200
abs_for_filter_a=0.0000
ui_a=0.0000
```

then the INA219 is measuring current, but your sign is reversed and your code is clamping it to zero.

Fix:

- set `CURRENT_INVERT = true`
- or swap `VIN+` / `VIN-`

### Case B: INA219 not actually in series

If:

- `bus_v` looks normal
- but `shunt_mv` stays near `0.000`
- and `current_signed_raw_a` stays near `0.000`

even when the motor is blocked, then the current is probably **not flowing through the INA219 shunt**.

Recheck:

- `+ alimentation moteur -> INA219 VIN+`
- `INA219 VIN- -> + moteur`
- `- moteur -> - alimentation moteur`
- common ground with ESP32

### Case C: sensor sees current, but UI delta stays flat

If:

- `current_signed_raw_a` is clearly positive
- `abs_for_filter_a` is positive
- but `delta_a` and `ui_a` remain near zero

then your baseline/filtering path is flattening the signal.

Quick proof:

- set `CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI = true`

If the chart starts moving, the INA219 is fine and the issue is in the **delta-above-baseline logic**, not in the sensor.

### Case D: clipping on startup

If your startup peak saturates or looks obviously clipped, try:

- `INA_USE_32V_2A = true`

Otherwise stay on:

- `INA_USE_32V_1A = false`

because it is the better default for low current.

## 7. Fast test order

1. Keep your current code structure
2. Add the debug patch above
3. Start with:

```cpp
CURRENT_INVERT = false
CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI = false
```

4. Observe the `# DEBUG ...` lines
5. If raw current is negative, switch:

```cpp
CURRENT_INVERT = true
```

6. If raw current is positive but the chart still stays flat, switch temporarily:

```cpp
CURRENT_DEBUG_SEND_ABSOLUTE_TO_UI = true
```

7. Once confirmed, switch it back to `false`

## 8. Important note

This patch is meant for **diagnosis**, not as the permanent final demo behavior.

Permanent demo mode should keep:

- the same 12-column CSV
- the same calibrated threshold logic
- the same UI contract with `ExperimentPage.tsx`
