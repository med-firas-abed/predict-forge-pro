# DEPLOYMENT MAP

This file explains what should be deployed where.

## Frontend

- package: `prediteq_frontend/`
- deploy target: Vercel
- config file: `prediteq_frontend/vercel.json`
- package entry: `prediteq_frontend/package.json`

Expected Vercel root directory:

- `prediteq_frontend`

Expected build behavior:

- install: `npm install`
- build: `npm run build`
- output: `dist`
- required production env: `VITE_API_URL=https://prediteq-saas.onrender.com`
- public frontend preferred: `https://prediteq.aro-teq.com`
- public frontend fallback: `https://prediteq-saas.vercel.app`

## Backend

- package: `prediteq_api/`
- deploy target: Render
- deploy config: `render.yaml`
- runtime entry: `prediteq_api/main.py`

Expected Render behavior from `render.yaml`:

- build: `pip install -r prediteq_api/requirements.txt`
- start: `cd prediteq_api && uvicorn main:app --host 0.0.0.0 --port $PORT`
- required live alignment: `CORS_ORIGINS=https://prediteq.aro-teq.com,https://prediteq-saas.vercel.app`
- required live alignment: `DASHBOARD_URL=https://prediteq.aro-teq.com`

Important detail:

- the backend is not standalone
- it loads models from sibling folder `prediteq_ml/models/`

## ML artifacts

- training and evaluation live in `prediteq_ml/`
- runtime models consumed by the backend live in `prediteq_ml/models/`

## Quick deploy checks

### Vercel

The frontend deploy is probably correct if:

- the app loads
- routes work directly in the browser
- API calls point to the Render backend URL

### Render

The backend deploy is probably correct if:

- `/health` returns `{"status":"ok"}`
- the simulator starts
- dashboard data loads
- alerts and emails work

## Files to inspect if deployment looks broken

Frontend:

- `prediteq_frontend/vercel.json`
- `prediteq_frontend/package.json`
- `prediteq_frontend/.env.example`

Backend:

- `render.yaml`
- `prediteq_api/requirements.txt`
- `prediteq_api/.env.example`
- `prediteq_api/main.py`

## Email path

Current email transport priority is EmailJS, then Brevo, then SMTP:

- config source: `prediteq_api/.env.example`
- sender logic: `prediteq_api/core/email_client.py`
- recipient logic: `prediteq_api/routers/seuils.py`
- live runtime trigger: `prediteq_api/scheduler.py`
- demo replay trigger: `prediteq_api/routers/simulator.py`
