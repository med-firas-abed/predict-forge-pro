# PrediTeq

Prediction-first maintenance platform for the ISAMM PFE and the Aroteq demo context.

## Start here

If you want to understand the project quickly, open these files first:

- `docs/JURY_CODE_TOUR.md`
- `docs/DEPLOYMENT_MAP.md`
- `docs/HANDOFF_RUNBOOK.md`
- `docs/FINAL_RELEASE_CHECKLIST.md`
- `INDEX_RESULTATS.md`

## Product code only

The real product code lives in:

- `prediteq_ml/`
- `prediteq_api/`
- `prediteq_frontend/`

## Folders you can ignore for product navigation

These folders are useful project assets, but not where the running product logic lives:

- `rapport_firas/`
- `rapport_firas_v2/`
- `final_report/`
- `references/` archival phrasing, deploy, and report-writing guides
- `external-skills/`
- `project context/`
- `prediteq_pipeline_docs/` oral-support notes and code-tour helper documents
- `hardware/`
- `logs/`

## Repo map

```text
docs/               Navigation guides for jury, maintenance and grouped reference material
hardware/           Standalone ESP bench sketches and wiring/debug notes
prediteq_ml/        Offline pipeline, diagnostics, exported models and outputs
prediteq_api/       Runtime backend, scheduler, simulator, alerts and auth
prediteq_frontend/  React UI, pages, hooks and presentation logic
logs/               Local run logs and smoke-test traces (ignored by git)
render.yaml         Render deployment config for the backend
INDEX_RESULTATS.md  Exact pipeline order, generated artifacts and the human-readable metric summary
```

Archived and reference-only files that do not affect runtime behavior now live under:

- `docs/reference_materials/`

Reference-only folders kept at the repo root for link stability:

- `references/`
- `prediteq_pipeline_docs/`

## Best first files to open

If you want the shortest clean code tour:

1. `prediteq_api/demo_scenarios.py`
2. `prediteq_api/routers/simulator.py`
3. `prediteq_api/ml/engine_manager.py`
4. `prediteq_api/routers/diagnostics_rul.py`
5. `prediteq_frontend/src/components/pages/DashboardPage.tsx`
6. `prediteq_frontend/src/components/pages/DiagnosticsPage.tsx`
7. `prediteq_frontend/src/components/pages/PlannerPage.tsx`

## Current product story

PrediTeq is organized around this sequence:

1. read signals
2. estimate HI / stress / RUL
3. explain the risk
4. decide the action
5. execute through alerts, planning, calendar and budget views

## Local development

### Backend

```bash
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd prediteq_frontend
npm install
npm run dev
```

Frontend local dev runs on:

- `http://127.0.0.1:8080`

## Deployment summary

- frontend package: `prediteq_frontend/`
- frontend config: `prediteq_frontend/vercel.json`
- backend package: `prediteq_api/`
- backend deploy config: `render.yaml`

See `docs/DEPLOYMENT_MAP.md` for the full deploy picture.

## Finish-line docs

For the final delivery and demo package, use:

- `docs/HANDOFF_RUNBOOK.md`
- `docs/FINAL_RELEASE_CHECKLIST.md`
- `DEPLOYMENT_FREEZE.md`
- `final_report/jury_demo_cheat_sheet.md`

## Source of truth

Use these files when you need the current truth:

- `INDEX_RESULTATS.md` for pipeline order, outputs, timings and the human-readable metric summary
- `prediteq_ml/outputs/*.json` for the exported metric values used by the report and jury package
- `prediteq_ml/config.py` for ML/runtime defaults
- `prediteq_api/` for live behavior

## Useful editor shortcut

Open the workspace file below in VS Code if you want a cleaner jury-friendly view:

- `PrediTeq-Jury.code-workspace`
