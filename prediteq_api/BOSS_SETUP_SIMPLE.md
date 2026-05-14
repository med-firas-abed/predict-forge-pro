# Simple Boss Setup

This is the simple version of the real-data connection plan.

Goal:

- your boss laptop receives real values from LabVIEW / PLC
- those values are sent to PrediTeq
- PrediTeq calculates HI, machine state, diagnosis, alerts, and later RUL

The path is:

`LabVIEW / PLC -> boss laptop -> MQTT or HTTP -> PrediTeq backend -> frontend`

---

## 1. What your boss must provide

PrediTeq needs these 4 live values at minimum:

- vibration RMS
- power
- temperature
- humidity

In the backend names, they are:

- `rms_mms`
- `power_kw`
- `temp_c`
- `humidity_rh`

Optional but useful:

- `current_a`
- `load_kg`
- `status`

Important:

- if there is no `power_kw`, the current backend will not work correctly
- if there is no `humidity_rh`, the current backend will not work correctly

So the first question for your boss is:

Can LabVIEW or the PLC export these 4 values every second?

---

## 2. Easiest real-life method

The easiest method is this:

1. LabVIEW writes the latest values into one file on the boss laptop
2. a small PrediTeq sender script reads that file
3. the sender script sends the values to MQTT
4. your backend receives them and calculates everything

The file can be:

- one JSON file updated every second
- or one CSV file where the last row is the newest value

Best choice:

- JSON file updated every second

---

## 3. What you do first

### Step 1: create the real machine in PrediTeq

Open terminal:

```powershell
cd prediteq_api
python scripts/register_machine.py ARO-01 --name "ARO Real Machine" --region "Boss Site"
```

You can replace `ARO-01` with the real machine code you want.

Important:

- do not use the demo machine codes
- if the backend is already running, the first live MQTT payload will now load this machine automatically

---

### Step 2: put the MQTT settings in the backend

Open:

- `prediteq_api/.env`

Add or update:

```env
MQTT_BROKER=your-private-broker
MQTT_PORT=8883
MQTT_USER=your-user
MQTT_PASSWORD=your-password
MQTT_USE_SSL=true
LIVE_INGEST_TOKEN=choose-a-long-random-token
```

Important:

- use a private MQTT broker
- both laptops must be able to reach this broker
- if you prefer HTTP instead of MQTT from the boss laptop, keep `LIVE_INGEST_TOKEN` and use `POST /ingest/live`

---

### Step 3: start the backend

```powershell
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

---

## 4. What your boss does on his laptop

### Step 1: install the small sender dependencies

```powershell
cd prediteq_api
pip install -r scripts/requirements_bridge.txt
```

---

### Step 2: create the sender config file

Create this file:

- `prediteq_api/scripts/.env.bridge`

Put this inside:

```env
MACHINE_ID=ARO-01
PUBLISH_TRANSPORT=mqtt
MQTT_HOST=your-private-broker
MQTT_PORT=8883
MQTT_USER=your-user
MQTT_PASSWORD=your-password
MQTT_USE_SSL=true
MQTT_TOPIC=prediteq/{machine_id}/sensors
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=json-file
SOURCE_LABEL=labview_bridge
SOURCE_JSON_PATH=C:\labview\prediteq_latest.json
```

If LabVIEW writes CSV instead of JSON:

```env
MACHINE_ID=ARO-01
PUBLISH_TRANSPORT=mqtt
MQTT_HOST=your-private-broker
MQTT_PORT=8883
MQTT_USER=your-user
MQTT_PASSWORD=your-password
MQTT_USE_SSL=true
MQTT_TOPIC=prediteq/{machine_id}/sensors
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=csv-last-row
SOURCE_LABEL=labview_bridge
SOURCE_CSV_PATH=C:\labview\prediteq_log.csv
```

If you want HTTP instead of MQTT:

```env
MACHINE_ID=ARO-01
PUBLISH_TRANSPORT=http
HTTP_INGEST_URL=https://your-backend/ingest/live
HTTP_INGEST_TOKEN=choose-a-long-random-token
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=json-file
SOURCE_LABEL=labview_bridge
SOURCE_JSON_PATH=C:\labview\prediteq_latest.json
```

---

### Step 3: first test without real PLC or LabVIEW

Before using the real data, test the full path with fake data:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --mode mock --machine-id ARO-01
```

If this works, the network and MQTT path are okay.

Only then switch to real data.

HTTP test version:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport http --http-url https://your-backend/ingest/live --http-token choose-a-long-random-token --mode mock --machine-id ARO-01
```

---

### Step 4: run with the real file

If LabVIEW writes JSON:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --mode json-file --machine-id ARO-01 --json-path C:\labview\prediteq_latest.json
```

If LabVIEW writes CSV:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

HTTP real-file version:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport http --http-url https://your-backend/ingest/live --http-token choose-a-long-random-token --mode json-file --machine-id ARO-01 --json-path C:\labview\prediteq_latest.json
```

---

## 5. What the JSON file should look like

Example:

```json
{
  "machine_id": "ARO-01",
  "observed_at": "2026-05-11T18:00:00Z",
  "rms_mms": 1.24,
  "power_kw": 0.88,
  "temp_c": 26.5,
  "humidity_rh": 57.0,
  "current_a": 1.62,
  "load_kg": 180.0,
  "status": "running",
  "source": "labview_plc_bridge"
}
```

Minimum required JSON:

```json
{
  "machine_id": "ARO-01",
  "observed_at": "2026-05-11T18:00:00Z",
  "rms_mms": 1.24,
  "power_kw": 0.88,
  "temp_c": 26.5,
  "humidity_rh": 57.0
}
```

---

## 6. What the CSV file should look like

Header:

```csv
machine_id,observed_at,rms_mms,power_kw,temp_c,humidity_rh,current_a,load_kg,status
```

Example row:

```csv
ARO-01,2026-05-11T18:00:00Z,1.24,0.88,26.5,57.0,1.62,180.0,running
```

Important:

- if using CSV mode, the script reads the last row

---

## 7. How you verify that it works

After the sender starts, check these:

### Check 1: backend health

Open:

- `/health/detail`

You want to see MQTT connected.

### Check 2: machine live data

Open:

- `/machines/ARO-01`

You want to see:

- `last_sensors`
- `hi_courant`
- `zone_live`

### Check 3: sensor history

Open:

- `/machines/ARO-01/sensors`

You want to see history points appearing.

### Check 4: calibrated RUL endpoint

Open:

- `/diagnostics/ARO-01/calibrated-rul`

At first, it may show initialization.

That is normal.

---

## 8. Very important point about RUL

Do not tell your boss:

- "RUL appears immediately"

That is not how the current backend works.

Better wording:

- live HI and machine state appear quickly
- diagnosis and stress appear quickly
- numerical RUL needs enough history first

For the current backend, that means about:

- 60 minutes of HI history

So for the first real test, success means:

- live values arrive
- HI starts changing
- zone starts updating

If RUL is not shown in the first minutes, that is not a failure.

---

## 9. The exact simple discussion to have with your boss

You can say:

"We already have the backend side ready for live ingestion. The easiest way is:
your laptop receives the real PLC/LabVIEW values, writes them to a JSON file
every second, and our small sender script sends them to PrediTeq through MQTT.
For the current backend, I need these minimum live values: vibration RMS,
power, temperature, and humidity. If you also have current, load, and status,
that is even better."

Then ask:

1. Can LabVIEW write one JSON file every second?
2. If not, can it write a CSV row every second?
3. Do you have these values:
   vibration RMS, power, temperature, humidity?
4. Can your laptop connect to a private MQTT broker?

---

## 10. If your boss says "we only have PLC tags"

That is okay.

Then the next question is:

- how can the boss laptop read those PLC tags?

Possible answers:

- OPC UA
- Modbus TCP
- local database
- local API
- LabVIEW-exported file

If it is not JSON or CSV, then later we edit:

- `prediteq_api/scripts/mqtt_bridge_sender.py`

inside:

- `read_from_custom_source()`

That is the correct place to connect the real PLC/LabVIEW source.

---

## 11. Simplest recommended sequence

This is the safest order:

1. choose one real machine code
2. create that machine in PrediTeq
3. configure backend MQTT
4. restart backend
5. test sender in mock mode
6. confirm machine live values appear
7. connect the real LabVIEW/PLC source
8. confirm HI updates
9. wait for enough history for numerical RUL

---

## 12. Most likely blockers

These are the big ones:

### Blocker A

No `power_kw`

### Blocker B

No `humidity_rh`

### Blocker C

Machine not created first in PrediTeq

### Blocker D

MQTT broker not reachable from one of the laptops

### Blocker E

Expectation that RUL should appear instantly

---

## 13. Best practical recommendation

For the first real meeting, aim for this:

- do not start with PLC complexity
- do not start with direct custom code
- first prove the path with `mock`
- then use one JSON file from LabVIEW

That is the simplest and safest first success.
