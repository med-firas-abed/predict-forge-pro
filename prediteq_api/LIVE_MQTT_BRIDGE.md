# Live MQTT Bridge

This guide is the practical split between your work and the client-site relay
PC work for real sensor ingestion into PrediTeq.

## Goal

Send real sensor data from a client-side relay PC to the PrediTeq backend so the backend
computes live HI, diagnosis, stress, and RUL.

Target flow:

`relay PC -> MQTT broker or HTTPS -> PrediTeq backend -> frontend`

## Files added for this

- `scripts/register_machine.py`
- `scripts/mqtt_bridge_sender.py`
- `scripts/requirements_bridge.txt`
- `scripts/.env.bridge.example`

## Your part

### 1. Register the real machine code

The backend ignores MQTT messages for unknown machine codes. Create the real
machine first.

Example:

```powershell
cd prediteq_api
python scripts/register_machine.py ARO-01 --name "ARO Real Machine" --region "Bridge Site"
```

Use a real code such as `ARO-01`. Do not reuse the demo codes.

### 2. Configure MQTT in the backend

In `prediteq_api/.env`, set:

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
- do not leave `MQTT_BROKER=broker.emqx.io`
- restart the backend after changing `.env`
- a new machine code can now be picked up automatically on the first live MQTT payload

### 3. Start the backend

```powershell
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### 4. Verify the backend sees MQTT

Check:

- `/health/detail` for MQTT connection status
- `/machines` or `/machines/ARO-01` for `last_sensors`, `hi_courant`, and `rul_live`
- `/machines/ARO-01/sensors` for sensor history

## Relay-PC part

### 1. Install the sender dependencies

```powershell
cd prediteq_api
pip install -r scripts/requirements_bridge.txt
```

### 2. Create the bridge config

Copy `scripts/.env.bridge.example` to `scripts/.env.bridge` and fill:

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
SOURCE_MODE=mock
SOURCE_LABEL=site_bridge_pc
```

If the relay PC should post directly to the backend instead of MQTT:

```env
MACHINE_ID=ARO-01
PUBLISH_TRANSPORT=http
HTTP_INGEST_URL=https://your-backend/ingest/live
HTTP_INGEST_TOKEN=choose-a-long-random-token
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=mock
SOURCE_LABEL=site_bridge_pc
```

### 3. First test without the real source

Run the sender in `mock` mode:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --mode mock --machine-id ARO-01
```

This sends one message every second with test values so you can verify the full
PrediTeq live path first.

If you want a LabVIEW-demo stage that is already closer to the future LabVIEW / PLC
architecture, use:

- `prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md`

That path keeps the real bridge shape:

`template CSV -> LabVIEW demo writer -> csv-last-row sender -> MQTT / HTTP -> PrediTeq`

HTTP version:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport http --http-url https://your-backend/ingest/live --http-token choose-a-long-random-token --mode mock --machine-id ARO-01
```

### 4. Replace mock with the real source

There are 3 simple options:

1. `json-file`
   Another local program writes one JSON object to a file, and the sender reads
   it every second.

2. `csv-last-row`
   Another local program appends rows to a CSV file, and the sender reads the
   last row every second.

3. `custom`
   Edit `read_from_custom_source()` in `scripts/mqtt_bridge_sender.py` for
   OPC UA, Modbus, SQL, or another local API.

For the current LabVIEW demo path, the repo now also includes:

- `scripts/generate_labview_demo_csv.py`
- `scripts/replay_labview_demo_csv.py`
- `scripts/sample_data/ARO-01_labview_demo_template.csv`

These files let you rehearse the future relay-PC CSV path before the real
LabVIEW / PLC writer is available.

## Expected payload

Required fields:

- `machine_id`
- `observed_at` or `timestamp`
- `rms_mms`
- `power_kw`
- `temp_c`
- `humidity_rh`

Optional but useful:

- `current_a`
- `load_kg`
- `status`
- `source`

## Fast test sequence

1. You create `ARO-01`
2. You configure backend MQTT
3. You restart the backend only if the MQTT config changed
4. The relay PC runs the sender in `mock` mode
5. You check `/health/detail`
6. You check `/machines/ARO-01`
7. You confirm `last_sensors` and live HI appear
8. Only after that do you connect the real source

## Real-source integration point

If the relay PC already receives the real values in another app, the easiest
integration is:

- that app writes a JSON file or CSV file once per second
- `mqtt_bridge_sender.py` publishes it to MQTT

If that is not possible, edit `read_from_custom_source()` directly and put the
real source read logic there.
