# LabVIEW / PLC Real Data Integration

This note is the practical handoff for connecting a boss-side LabVIEW/PLC setup
to the current PrediTeq backend.

## Goal

Send real telemetry from the boss laptop into PrediTeq so the backend can
compute:

- live HI
- live health zone
- diagnosis / stress
- calibrated RUL
- alerts and history persistence

## Current reality of this codebase

The current live ingestion path is:

`LabVIEW / PLC -> boss laptop bridge -> MQTT broker or HTTPS -> PrediTeq backend -> frontend`

Important:

- the backend already supports live ingestion through MQTT
- the backend also exposes `POST /ingest/live` for a direct HTTP bridge path
- the backend ignores messages for unknown machine codes
- the runtime ML engine expects a specific payload shape

Useful existing files:

- `prediteq_api/LIVE_MQTT_BRIDGE.md`
- `prediteq_api/scripts/mqtt_bridge_sender.py`
- `prediteq_api/scripts/register_machine.py`
- `prediteq_api/routers/mqtt.py`
- `prediteq_api/ml/engine_manager.py`

## What the backend needs from the real source

### Required fields

These are required by the current runtime feature pipeline:

- `machine_id`
- `observed_at` or `timestamp`
- `rms_mms`
- `power_kw`
- `temp_c`
- `humidity_rh`

### Optional but recommended fields

- `current_a`
- `load_kg`
- `vibration_raw`
- `vibration_rms`
- `status`
- `source`

### Units expected

- `rms_mms`: vibration RMS in `mm/s`
- `power_kw`: active motor power in `kW`
- `temp_c`: temperature in `degC`
- `humidity_rh`: relative humidity in `%`
- `current_a`: current in `A`

## Important constraint

The current backend does not run from only `current_a + vibration + temp`.

Right now, the live feature builder in `ml/engine_manager.py` uses:

- vibration RMS
- power
- temperature
- humidity

So if the boss setup cannot provide `power_kw` or `humidity_rh`, we have a real
integration gap to solve before production use.

## Recommended integration path

### Fastest path

Use the boss laptop as the bridge machine:

1. LabVIEW or PLC writes the latest measurements locally
2. `mqtt_bridge_sender.py` reads them
3. the script publishes to MQTT or HTTP once per second
4. the backend ingests and computes live results

This is the least risky path because the bridge script already exists.

### Source options already supported by the bridge

The sender already supports:

- `mock`
- `json-file`
- `csv-last-row`
- `custom`

For a real site, the easiest options are:

1. LabVIEW writes one JSON file repeatedly
2. LabVIEW appends to a CSV file and we read the last row
3. we edit `read_from_custom_source()` for OPC UA, Modbus, SQL, or a LabVIEW local API

## Recommended meeting decision

Ask the boss to choose one of these three source shapes:

1. `JSON file every second`
   Best if LabVIEW can overwrite one file with the latest values.

2. `CSV last row`
   Best if LabVIEW naturally logs rows to disk.

3. `Custom bridge read`
   Best if the laptop exposes PLC values through OPC UA, Modbus TCP, SQL, or another local API.

For a first real test, `JSON file every second` is usually the fastest.

## What must be done on our side

### 1. Register the real machine in Supabase

The MQTT listener ignores unknown machine codes.

Example:

```powershell
cd prediteq_api
python scripts/register_machine.py ARO-01 --name "ARO Real Machine" --region "Boss Site"
```

Rules:

- use a real code such as `ARO-01`
- do not reuse demo codes
- if the backend is already running, the first live MQTT payload can refresh this machine code automatically

### 2. Configure the backend MQTT connection

In `prediteq_api/.env`:

```env
MQTT_BROKER=your-private-broker
MQTT_PORT=8883
MQTT_USER=your-user
MQTT_PASSWORD=your-password
MQTT_USE_SSL=true
LIVE_INGEST_TOKEN=choose-a-long-random-token
```

Important:

- use a private broker
- do not leave the public demo broker setting
- both laptops must be able to reach the same broker
- firewall and network policy must allow this

### 3. Start or restart the backend

```powershell
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### 4. Verify backend live connectivity

Check:

- `/health/detail`
- `/machines`
- `/machines/ARO-01`
- `/machines/ARO-01/sensors`
- `/diagnostics/ARO-01/calibrated-rul`

## What must be done on the boss laptop

### 1. Install bridge dependencies

```powershell
cd prediteq_api
pip install -r scripts/requirements_bridge.txt
```

### 2. Create bridge config

Copy `scripts/.env.bridge.example` to `scripts/.env.bridge` and fill it.

Minimum example:

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
SOURCE_LABEL=boss_pc_bridge
SOURCE_JSON_PATH=C:\\labview\\prediteq_latest.json
```

HTTP alternative:

```env
MACHINE_ID=ARO-01
PUBLISH_TRANSPORT=http
HTTP_INGEST_URL=https://your-backend/ingest/live
HTTP_INGEST_TOKEN=choose-a-long-random-token
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=json-file
SOURCE_LABEL=boss_pc_bridge
SOURCE_JSON_PATH=C:\\labview\\prediteq_latest.json
```

### 3. First test in mock mode

Before touching LabVIEW or PLC, validate the whole PrediTeq path:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --mode mock --machine-id ARO-01
```

Only after that works should you switch to the real source.

HTTP mock alternative:

```powershell
python scripts/mqtt_bridge_sender.py --transport http --http-url https://your-backend/ingest/live --http-token choose-a-long-random-token --mode mock --machine-id ARO-01
```

### 4. Switch to the real source

Examples:

```powershell
python scripts/mqtt_bridge_sender.py --mode json-file --machine-id ARO-01 --json-path C:\\labview\\prediteq_latest.json
```

```powershell
python scripts/mqtt_bridge_sender.py --mode csv-last-row --machine-id ARO-01 --csv-path C:\\labview\\prediteq_log.csv
```

If neither fits:

- edit `read_from_custom_source()` in `scripts/mqtt_bridge_sender.py`

## Example payload

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

## What appears immediately and what does not

### Appears quickly once data starts flowing

- last live sensors
- HI
- live zone
- diagnosis
- stress index
- charts / sensor history

### Takes longer

- persisted machine snapshot updates every `60 seconds`
- `historique_hi` persistence runs every `60 seconds`
- live sensor history keeps one chart point roughly every `60 ticks`
- calibrated RUL needs about `60 HI points`, which is approximately `60 minutes`

So you should not promise:

- "RUL appears after 1 minute"

Current code behavior is closer to:

- "HI and diagnostics appear quickly"
- "numerical RUL appears after enough live history is accumulated"

## Questions to ask the boss clearly

These are the most important questions.

### Data-source questions

- Can LabVIEW export the latest values to one JSON file every second?
- If not, can it append to a CSV file?
- If not, what local interface is available: OPC UA, Modbus TCP, SQL, REST, shared memory?

### Signal-availability questions

- Do they have vibration RMS already in `mm/s`?
- Do they have active power already in `kW`?
- Do they have temperature in `degC`?
- Do they have humidity in `%RH`?
- Do they have current in `A`?
- Do they have load or cycle tags?

### Timestamp questions

- Do they provide a real event timestamp?
- Is it UTC or local time?
- Is the update rate really `1 Hz`?

### Network questions

- Can the boss laptop reach the MQTT broker?
- Can your backend laptop reach the same broker?
- Are ports like `8883` allowed by firewall or company IT?

## Real blockers you should mention early

### Blocker 1: missing `power_kw`

The current runtime pipeline requires `power_kw`.

If the source only gives current:

- LabVIEW should compute `power_kw` if voltage and power factor are available
- otherwise we need a backend change

### Blocker 2: missing `humidity_rh`

The current runtime pipeline also requires `humidity_rh`.

If the PLC/LabVIEW chain does not provide humidity:

- either add a humidity source
- or change the backend feature pipeline to support a reduced payload path

This is not just a UI issue. It affects live feature computation.

### Blocker 3: unknown machine code

If the machine code does not exist in Supabase before live sending starts,
the backend ignores the messages.

### Blocker 4: expectation mismatch on RUL timing

The backend can show live HI quickly, but calibrated live RUL is not instant.
It needs enough HI history first.

## Minimum success criteria for the first on-site test

The first real test is successful if all of these are true:

1. `/health/detail` shows MQTT connected
2. `/machines/ARO-01` shows non-null `last_sensors`
3. `hi_courant` starts updating
4. `zone_live` starts updating
5. `/machines/ARO-01/sensors` starts filling with history
6. `/diagnostics/ARO-01/all` returns diagnosis and stress
7. after enough history, `/diagnostics/ARO-01/calibrated-rul` switches to `mode=prediction`

## Practical recommendation

For the boss discussion, propose this exact sequence:

1. agree on one real machine code
2. agree on one bridge format: JSON file is preferred
3. confirm the 4 required runtime fields exist: `rms_mms`, `power_kw`, `temp_c`, `humidity_rh`
4. validate with `mock` mode first
5. switch the sender to the real source
6. only after live HI is stable, discuss any backend adaptation still needed

## If the boss only has PLC tags and no easy export

Then the next coding task should be:

- implement `read_from_custom_source()` in `scripts/mqtt_bridge_sender.py`

and wire it to whichever local interface they actually expose:

- OPC UA
- Modbus TCP
- SQL table
- local REST endpoint
- LabVIEW shared file

That is the right place to adapt to the boss environment without changing the
core backend prediction path.
