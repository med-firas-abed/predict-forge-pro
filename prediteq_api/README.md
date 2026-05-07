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
