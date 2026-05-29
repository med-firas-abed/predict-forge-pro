# LabVIEW CSV Bridge Demo

This is the temporary staged demo for the relay-PC integration while the final
LabVIEW / PLC source is not connected yet.

The idea is:

1. generate a realistic CSV template consistent with the PrediTeq simulation
2. replay it row by row into a live CSV file on the relay-PC side
3. let the existing `mqtt_bridge_sender.py` read the last CSV row
4. publish to MQTT or HTTP exactly like the future real bridge

So the current demo path is:

`template CSV -> LabVIEW demo writer -> live CSV -> mqtt_bridge_sender.py -> MQTT/HTTP -> PrediTeq`

Later, only one block changes:

`real LabVIEW / PLC -> live CSV -> mqtt_bridge_sender.py -> MQTT/HTTP -> PrediTeq`

## Files added for this stage

- `scripts/generate_labview_demo_csv.py`
- `scripts/setup_real_machine_demo.py`
- `scripts/replay_labview_demo_csv.py`
- `scripts/sample_data/ARO-01_labview_demo_template.csv`

## Why this is useful

- it stays realistic to the current simulation assumptions
- it exercises the real bridge path already present in PrediTeq
- it avoids inventing a demo-only transport that would be thrown away later
- it gives the jury a clean migration story from LabVIEW demo source to real source

## What the template contains

The generated CSV follows the same high-level assumptions as the ML simulation:

- 44-second machine cycle: `12 s ascent + 12 s descent + 20 s pause`
- discrete load cases from `0` to `285 kg`
- ascent power rises with load and with degradation
- current is derived from active power using the motor electrical constants
- vibration RMS rises when the health window degrades
- temperature and humidity remain smooth and plausible

The template uses relay-PC / LabVIEW-style column names:

- `machine_code`
- `time` only in the replayed live file
- `vibration_mm_s`
- `motor_power`
- `temperature`
- `humidity`
- `current`
- `charge`
- `state`

These names are already understood by `mqtt_bridge_sender.py` through its alias
normalization layer.

## Recommended current-demo workflow

### 1. Generate or refresh the template CSV

```powershell
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
```

This creates:

- `prediteq_api/scripts/sample_data/ARO-01_labview_demo_template.csv`

### 2. Create or update `ARO-01` and preload its recent history

```powershell
cd prediteq_api
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine AroTeq" --location "Usine Aroteq - Ben Arous" --scenario surveillance
```

Why this matters:

- `ARO-01` stays a real live-runtime machine
- HI, calendar context and RUL no longer start from a cold buffer during the demo
- the CSV relay that follows continues on the same machine and same runtime path

### 3. Replay the template into a live CSV file

This mimics LabVIEW or the PLC writing a local CSV continuously on a relay PC.

```powershell
cd prediteq_api
python scripts/replay_labview_demo_csv.py `
  --input scripts/sample_data/ARO-01_labview_demo_template.csv `
  --output C:\labview\prediteq_log.csv `
  --interval 1.0
```

Optional compressed demo:

```powershell
cd prediteq_api
python scripts/replay_labview_demo_csv.py `
  --input scripts/sample_data/ARO-01_labview_demo_template.csv `
  --output C:\labview\prediteq_log.csv `
  --interval 0.25
```

Important:

- `0.25 s` is only for a compressed demo
- the real target remains `1 Hz`

### 4. Send the live CSV to PrediTeq

MQTT version:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py `
  --mode csv-last-row `
  --machine-id ARO-01 `
  --csv-path C:\labview\prediteq_log.csv `
  --transport mqtt `
  --mqtt-host your-private-broker
```

HTTP version:

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py `
  --mode csv-last-row `
  --machine-id ARO-01 `
  --csv-path C:\labview\prediteq_log.csv `
  --transport http `
  --http-url https://your-backend/ingest/live `
  --http-token choose-a-long-random-token
```

## What this proves

- the relay-PC bridge can read a realistic CSV, not only a synthetic in-memory mock
- the MQTT / HTTP transport path remains the same as the future real deployment
- the frontend can display the machine through the normal live-runtime path
- `ARO-01` can already surface in Machines, Dashboard, Diagnostics, Planner, Calendar, Rapport IA and chatbot

## What this does not prove

- a real industrial LabVIEW or PLC acquisition loop
- hardware clock synchronization
- production robustness over weeks or months

So this is still an honest intermediate demo step.

## Final migration path

When the real source is ready:

1. keep `mqtt_bridge_sender.py`
2. stop `replay_labview_demo_csv.py`
3. let the real LabVIEW / PLC write the CSV instead
4. keep the same MQTT or HTTP configuration

That is why this staged LabVIEW demo plan is valuable: it prepares the final
architecture without wasting work.
