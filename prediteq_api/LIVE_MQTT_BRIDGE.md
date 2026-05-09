# Live MQTT Bridge

This guide is the practical split between your work and your boss's work for
real sensor ingestion into PrediTeq.

## Goal

Send real sensor data from the boss PC to the PrediTeq backend so the backend
computes live HI, diagnosis, stress, and RUL.

Target flow:

`boss PC -> MQTT broker -> PrediTeq backend -> frontend`

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
python scripts/register_machine.py ARO-01 --name "ARO Real Machine" --region "Boss Site"
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
```

Important:

- use a private broker
- do not leave `MQTT_BROKER=broker.emqx.io`
- restart the backend after changing `.env`
- restart the backend after creating a new machine code

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

## Boss part

### 1. Install the sender dependencies

```powershell
cd prediteq_api
pip install -r scripts/requirements_bridge.txt
```

### 2. Create the bridge config

Copy `scripts/.env.bridge.example` to `scripts/.env.bridge` and fill:

```env
MACHINE_ID=ARO-01
MQTT_HOST=your-private-broker
MQTT_PORT=8883
MQTT_USER=your-user
MQTT_PASSWORD=your-password
MQTT_USE_SSL=true
MQTT_TOPIC=prediteq/{machine_id}/sensors
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=mock
SOURCE_LABEL=boss_pc_bridge
```

### 3. First test without the real source

Run the sender in `mock` mode:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --mode mock --machine-id ARO-01
```

This sends one message every second with test values so you can verify the full
PrediTeq live path first.

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
3. You restart the backend
4. Your boss runs the sender in `mock` mode
5. You check `/health/detail`
6. You check `/machines/ARO-01`
7. You confirm `last_sensors` and live HI appear
8. Only after that do you connect the real source

## Real-source integration point

If the boss PC already receives the real values in another app, the easiest
integration is:

- that app writes a JSON file or CSV file once per second
- `mqtt_bridge_sender.py` publishes it to MQTT

If that is not possible, edit `read_from_custom_source()` directly and put the
real source read logic there.
