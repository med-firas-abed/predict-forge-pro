# Two-PC MQTT Functional Test

This is the clean end-to-end functional test for PrediTeq using:

- `PC1` = PrediTeq backend + frontend
- `PC2` = external sender / future client-side relay PC

Use this test when you want a proper proof that:

`external PC -> MQTT -> PrediTeq backend -> PrediTeq app`

works correctly.

This test is intentionally simple and uses fake data only.
In the real deployment path, the `PC2` role can be played by any relay PC chosen by the client site team.

## What this test proves

- an external computer can send telemetry to PrediTeq
- the backend can ingest live MQTT messages
- the app can display the target machine with live values
- the MQTT architecture works before moving to the client relay PC

## What this test does NOT prove

- real factory acquisition from LabVIEW / PLC
- industrial reliability over long periods
- final production deployment
- full real-world RUL maturity

So this is a **functional validation**, not yet an industrial validation.

## Recommended machine code

Use:

- `ARO-01`

This remains the internal machine code for MQTT and backend routing.

In the app, this machine is now shown publicly as:

- `Machine AroTeq`

## Preconditions

Before starting, make sure:

- `PC1` has the backend working
- `PC1` has the frontend working
- `ARO-01` exists in the database
- `PC2` has the safe transfer bundle:
  - `prediteq_api/TRANSFER_TO_PC2`
- fake data only is used with the public broker

## PC1 setup

### 1. Backend configuration

In `prediteq_api/.env`, make sure:

```env
MQTT_BROKER=broker.emqx.io
MQTT_PORT=8883
MQTT_USER=
MQTT_PASSWORD=
MQTT_USE_SSL=true
MQTT_ALLOW_PUBLIC_TEST_BROKER=true
```

### 2. Start the backend

Use the local virtual environment:

```powershell
cd prediteq_api
.\.venv\Scripts\python -m uvicorn main:app --reload
```

Expected signs:

- `PrediTeq API ready`
- `MQTT connected - subscribed to prediteq/+/sensors`

### 3. Start the frontend

```powershell
cd prediteq_frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:8080/machines
```

Leave both PC1 terminals open.

## PC2 setup

### 1. Copy the safe transfer folder

Copy only:

```text
prediteq_api/TRANSFER_TO_PC2
```

Do NOT copy:

- `prediteq_api/.env`
- backend secrets

### 2. Run the sender

On PC2, open PowerShell in `TRANSFER_TO_PC2` and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\RUN_FAKE_MQTT_TEST.ps1
```

Expected signs:

- Python is detected
- sender packages install
- `scripts/.env.bridge` is created if needed
- fake MQTT messages start sending

The terminal should then show lines like:

```text
MQTT connected to broker.emqx.io:8883
Source mode: mock
Transport: mqtt
Machine id: ARO-01
[timestamp] sent prediteq/ARO-01/sensors ...
```

## Proper test execution

### Reset before starting

Before rerunning the test:

- stop the old sender on `PC2` with `Ctrl + C`
- keep only the required terminals open
- refresh the app page on `PC1`
- make sure you will watch `Machine AroTeq` in the UI, not the raw code

### Step 1

Start PC1 backend first.

### Step 2

Start PC1 frontend second.

### Step 3

Open the Machines page on PC1:

```text
http://127.0.0.1:8080/machines
```

### Step 4

Start the fake sender on PC2.

### Step 5

On PC1, open machine `Machine AroTeq`.

### Step 6

Observe the machine for at least `20 to 30 seconds`.

Watch for:

- live values changing
- HI visible
- machine present in the fleet

## Pass criteria

The test is considered successful if all of these are true:

1. PC2 is sending messages continuously
2. PC1 backend stays connected to MQTT
3. `Machine AroTeq` is visible in the app
4. live values change in the app
5. HI is displayed in the app

RUL does not need to be the main success criterion for this test.

## Evidence to capture

For a clean demonstration, capture:

### 1. Screenshot

PC2 terminal showing fake MQTT messages being sent

Important:

- keep the full PowerShell or VSCode window visible
- do not crop tightly
- do not leave unrelated apps like Gmail around it

### 2. Screenshot

PC1 backend terminal showing:

- `PrediTeq API ready`
- `MQTT connected - subscribed to prediteq/+/sensors`

Important:

- keep the full terminal window visible
- include the title bar if possible
- avoid tiny cropped fragments of logs

### 3. Screenshot

PC1 app showing `Machine AroTeq` with live values and HI

Important:

- keep the full browser window visible
- keep the address bar visible if possible
- show the machine title, gauges, and HI in the same capture

### 4. Optional photo or video

One photo or short video showing both PCs at the same time

## Recommended file names for the report

- `validation_pc2_sender.png`
- `validation_pc1_backend_mqtt.png`
- `validation_pc1_app_aro01.png`
- `validation_two_pc_setup.jpg`

## Suggested report wording

You can describe the test like this:

> Une validation fonctionnelle de bout en bout a ete realisee a l'aide de deux postes. Le premier poste hebergeait le backend PrediTeq et le frontend web. Le second poste jouait le role d'une source externe et publiait, via MQTT, des mesures simulees pour la machine de code interne ARO-01, affichee publiquement dans l'application sous le nom Machine AroTeq. Ce test n'avait pas pour objectif de valider une acquisition industrielle reelle, mais de verifier la chaine complete d'ingestion live. Les messages publies par le second poste ont ete recus par le backend, puis repercutes dans l'interface web, ou Machine AroTeq affichait des valeurs capteurs et un indice de sante mis a jour. Cette etape confirme donc la faisabilite du schema source externe -> MQTT -> backend -> application.

Add this honest limit:

> Ce test reste une validation fonctionnelle sur donnees simulees ; il ne remplace pas encore l'integration industrielle reelle avec LabVIEW / PLC.

## What comes next after this test

The next clean order is:

1. repeat the same test on the client relay PC in `mock` mode
2. confirm the client relay PC can reach the same path
3. replace mock mode with the real CSV source
4. validate:

   `LabVIEW / PLC -> CSV -> bridge -> MQTT -> backend -> app`

That is the correct transition from demo validation to real-site integration.
