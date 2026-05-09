# HANDOFF RUNBOOK

This runbook is the quickest safe reference for running, checking, demoing, and handing over PrediTeq.

## What PrediTeq is

PrediTeq is a hybrid predictive-maintenance product:

1. ingest machine context and telemetry
2. compute HI, stress, and RUL
3. explain the operational risk
4. guide the maintenance action
5. expose that decision through dashboard, diagnosis, planning, budget, alerts, and AI report export

## Product packages

- frontend: `prediteq_frontend/`
- backend runtime: `prediteq_api/`
- offline ML/training/export: `prediteq_ml/`

## Local startup

### Backend

Run from `prediteq_api/`:

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

Run from `prediteq_frontend/`:

```bash
npm install
npm run dev
```

Local frontend URL:

- `http://127.0.0.1:8080`

## Environment variables

### Frontend

See `prediteq_frontend/.env.example`.

Required values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

### Backend

See `prediteq_api/.env.example`.

Key values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `CORS_ORIGINS`
- `DASHBOARD_URL`
- `ADMIN_EMAIL`
- `GROQ_API_KEY`

## Live deployment

- frontend: Vercel
- backend: Render
- current live frontend: `https://prediteq-saas.vercel.app`
- current live backend: `https://prediteq-saas.onrender.com`

See `docs/DEPLOYMENT_MAP.md` and `DEPLOYMENT_FREEZE.md` for deployment wiring.

## Core QA commands

### Frontend

Run from `prediteq_frontend/`:

```bash
npm run build
npm run test
npx playwright test
npm run smoke:deployed
```

### Backend

Run from `prediteq_api/`:

```bash
python -m py_compile main.py report_engine.py routers\planner.py routers\report.py routers\simulator.py core\cost_model.py core\machine_labels.py
python -c "import main, routers.simulator, routers.report, routers.planner"
```

## Jury/demo flow

### Reset path

1. Open `Simulateur`
2. Click `Pause` if needed
3. Click `Réinitialiser`
4. Click `Démarrer`
5. Return to `Tableau de bord`

### Story to present

- `Machine 1` = healthy / stable
- `Machine 2` = watch / medium risk
- `Machine 3` = critical

### Recommended click path

1. `Simulateur`
2. `Tableau de bord`
3. `Diagnostic avancé`
4. `Coûts & Budget`
5. `Analyse & Rapport IA`

### Business points to keep consistent

- labor cost is `30 DT / heure`
- machine naming is generic and future-proof
- AI PDF export is branded and professional
- the simulator is demo-oriented, while the product story remains honest about ML vs expert rules

## Known truths to preserve

- the current pipeline uses `200 trajectoires`
- the backend consumes artifacts from sibling `prediteq_ml/models/`
- the simulator is a calibrated demo replay, not a pure raw-model mirror
- live thresholds can differ from offline defaults because runtime values may come from Supabase

## Safe rollback mindset

- use the latest verified state as the recovery point
- if something breaks right before a demo, prefer rolling back the last small change rather than editing live under pressure
- do not change DNS, CORS, and frontend API URL independently; treat them as one deployment change

## Recommended handoff files

- `README.md`
- `DEPLOYMENT_FREEZE.md`
- `docs/DEPLOYMENT_MAP.md`
- `docs/JURY_CODE_TOUR.md`
- `docs/FINAL_RELEASE_CHECKLIST.md`
- `final_report/jury_demo_cheat_sheet.md`
