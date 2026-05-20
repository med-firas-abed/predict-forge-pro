# Simple Boss Setup

Even if this filename says `BOSS`, the real architecture target is broader:
this role can be played by any client-side relay PC chosen on site.

This is the simple version of the real-data connection plan.

Goal:

- a client-side relay PC receives real values from LabVIEW / PLC
- those values are sent to PrediTeq
- PrediTeq calculates HI, machine state, diagnosis, alerts, and later RUL

The path is:

`LabVIEW / PLC -> relay PC -> MQTT or HTTP -> PrediTeq backend -> frontend`

---

## 1. What the site team must provide

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

So the first question for the site team is:

Can LabVIEW or the PLC export these 4 values every second?

---

## 2. Easiest real-life method

The easiest method is this:

1. LabVIEW writes the latest values into one file on the relay PC
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
python scripts/register_machine.py ARO-01 --name "ARO Real Machine" --region "Bridge Site"
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
- the backend host and the relay PC must both be able to reach this broker
- if you prefer HTTP instead of MQTT from the relay PC, keep `LIVE_INGEST_TOKEN` and use `POST /ingest/live`

---

### Step 3: start the backend

```powershell
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### Step 4: prepare the real machine in the app before the live relay starts

This is the smooth path for demos and first site tests:

```powershell
cd prediteq_api
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
```

This helper:

- creates or updates `ARO-01`
- seeds one recent hour of realistic runtime history
- makes HI, zone, calendar context and often RUL available sooner

Important:

- `ARO-01` still remains a real live-runtime machine
- this bootstrap does not turn it into a simulator machine

---

## 4. What the site relay PC does

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

Before using the real data, test the full path with demo data:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --mode mock --machine-id ARO-01
```

If this works, the network and MQTT path are okay.

Only then switch to real data.

If you want an intermediate LabVIEW-demo stage that already looks like the future
LabVIEW / PLC CSV path, use the dedicated plan here:

- `prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md`

That staged demo path is:

`template CSV -> LabVIEW demo writer -> mqtt_bridge_sender.py --mode csv-last-row -> PrediTeq`

This is more realistic than plain `mock` mode because it already exercises the
relay-PC CSV bridge.

HTTP test version:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport http --http-url https://your-backend/ingest/live --http-token choose-a-long-random-token --mode mock --machine-id ARO-01
```

---

### Step 4: run with the real file

Temporary LabVIEW-demo option before the real file exists:

```powershell
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
python scripts/mqtt_bridge_sender.py --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

This uses a realistic LabVIEW demo CSV template, then replays it row by row into the
same `csv-last-row` bridge path that the future real LabVIEW / PLC setup will
use.

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

Do not tell the site team:

- "RUL appears immediately"

That is not how the current backend works.

Better wording:

- live HI and machine state appear quickly
- diagnosis and stress appear quickly
- raw live ingestion still needs history for a stable numerical RUL

For a raw first connection, that means about:

- 60 minutes of HI history

For demos and rehearsals, [scripts/setup_real_machine_demo.py](./scripts/setup_real_machine_demo.py) preloads that recent history first.

So for the smooth demo path, success means:

- `ARO-01` exists in the app
- HI and zone are already visible
- the CSV relay continues on the same machine
- calendar and RUL can appear much faster than with a cold start

---

## 9. The exact simple discussion to have with the site team

You can say:

"We already have the backend side ready for live ingestion. The easiest way is:
one relay PC on your site receives the real PLC/LabVIEW values, writes them to a JSON file
every second, and our small sender script sends them to PrediTeq through MQTT.
For the current backend, I need these minimum live values: vibration RMS,
power, temperature, and humidity. If you also have current, load, and status,
that is even better."

Then ask:

1. Can LabVIEW write one JSON file every second?
2. If not, can it write a CSV row every second?
3. Do you have these values:
   vibration RMS, power, temperature, humidity?
4. Can the relay PC connect to a private MQTT broker?

---

## 10. If the site says "we only have PLC tags"

That is okay.

Then the next question is:

- how can the relay PC read those PLC tags?

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

MQTT broker not reachable from the backend host or from the relay PC

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
