/*
  Fake serial bench test for the PrediTeq ESP32 Experience page.
  Upload this to an ESP32, then connect from the browser page.

  Output format expected by the page:
  timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status
*/

unsigned long sampleCount = 0;

float noise(float amplitude) {
  return random(-1000, 1001) / 1000.0f * amplitude;
}

const char* computeStatus(float currentA, float vibrationRms) {
  if (sampleCount < 8) {
    return "CALIBRATING";
  }

  const bool vibAnomaly = vibrationRms > 8.2f;
  const bool currentAnomaly = currentA > 3.4f;

  if (vibAnomaly && currentAnomaly) return "ANOMALY_BOTH";
  if (vibAnomaly) return "ANOMALY_VIB";
  if (currentAnomaly) return "ANOMALY_CURRENT";
  return "NORMAL";
}

void setup() {
  Serial.begin(115200);
  delay(1200);
  randomSeed(micros());

  Serial.println("# FAKE BENCH TEST MODE - ESP32 USB serial feed active");
  Serial.println("timestamp_ms,current_a,vibration_raw,vibration_rms,temp_c,status");
}

void loop() {
  const unsigned long now = millis();
  const float t = now / 1000.0f;

  float currentA = 2.2f + 0.45f * sin(t * 0.45f) + noise(0.18f);
  float vibrationRaw = 8.6f + 1.10f * sin(t * 0.90f) + noise(0.30f);
  float vibrationRms = 6.7f + 0.75f * sin(t * 0.70f + 0.8f) + noise(0.22f);
  float tempC = 30.0f + 1.40f * sin(t * 0.18f) + noise(0.35f);

  const int cycle = sampleCount % 28;
  if (cycle >= 10 && cycle <= 12) {
    vibrationRms += 2.0f;
    vibrationRaw += 1.8f;
  }
  if (cycle >= 18 && cycle <= 20) {
    currentA += 1.4f;
  }
  if (cycle >= 24 && cycle <= 25) {
    currentA += 1.2f;
    vibrationRms += 1.6f;
    vibrationRaw += 1.4f;
    tempC += 1.1f;
  }

  if (currentA < 0.05f) currentA = 0.05f;
  if (vibrationRaw < 0.05f) vibrationRaw = 0.05f;
  if (vibrationRms < 0.05f) vibrationRms = 0.05f;

  const char* status = computeStatus(currentA, vibrationRms);

  Serial.print(now);
  Serial.print(',');
  Serial.print(currentA, 3);
  Serial.print(',');
  Serial.print(vibrationRaw, 3);
  Serial.print(',');
  Serial.print(vibrationRms, 3);
  Serial.print(',');
  Serial.print(tempC, 2);
  Serial.print(',');
  Serial.println(status);

  sampleCount++;
  delay(1000);
}
