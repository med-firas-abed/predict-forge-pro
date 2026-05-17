# PrediTeq API

This folder contains the runtime backend.

## What it does

- loads ML artifacts exported from `prediteq_ml/models/`
- receives live or simulated telemetry
- builds runtime features
- produces HI / stress / RUL responses
- drives alerts, emails, reports, planning and admin flows

## Open these files first

1. `main.py`
2. `ml/engine_manager.py`
3. `routers/diagnostics_rul.py`
4. `routers/simulator.py`
5. `routers/seuils.py`
6. `scheduler.py`

## Folder map

```text
core/      auth, config, email, supabase, decision helpers
ml/        runtime loader and engine manager
routers/   FastAPI routes grouped by business topic
scripts/   maintenance or utility scripts
sql/       schema and migration files
```

## Key runtime paths

### Prediction path

`main.py -> ml/loader.py -> ml/engine_manager.py -> routers/diagnostics_rul.py`

### Demo replay path

`demo_scenarios.py -> routers/simulator.py -> ml/engine_manager.py`

### Notification path

`routers/seuils.py -> scheduler.py / routers/simulator.py -> core/email_client.py`

### Admin path

`routers/auth.py -> core/auth.py -> frontend admin pages`

## Jury-friendly explanation

If you need one simple sentence:

This backend takes machine context and sensor signals, computes prognosis, then exposes that prognosis to the UI and the operational features.

## Local run

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

## Smoke checks

Before a demo or delivery, the fastest useful checks are:

```bash
python -m py_compile main.py report_engine.py routers\planner.py routers\report.py routers\simulator.py
```

Then confirm the main runtime imports still load:

```bash
python -c "import main, routers.simulator, routers.report, routers.planner"
```

Run the backend regression tests with the package virtualenv:

```bash
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Run the live authenticated smoke against a running backend:

```bash
.venv\Scripts\python.exe scripts\live_auth_smoke.py --backend-url http://127.0.0.1:8000
```

The live smoke creates disposable admin and operator accounts with the service
role from `.env`, verifies real login and protected routes, then deletes the
temporary users again.

## Delivery notes

- This backend is a runtime layer, not a training workspace.
- The trained artifacts are consumed from sibling `prediteq_ml/models/`.
- The simulator is demo-oriented: it replays a calibrated story through the runtime so the UI can show a stable, watch, and critical machine path reliably.
