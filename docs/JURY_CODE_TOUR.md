# JURY CODE TOUR

This file is the shortest clean path to explain the code to a jury.

## Product story in one line

PrediTeq is a prediction-first maintenance product:

1. read machine signals
2. estimate HI / stress / RUL
3. explain the risk
4. decide the action
5. execute through alerts, planner, calendar and budget views

## Open these files first

If you only have 5 minutes to show the code, open these files in this order:

1. `prediteq_api/demo_scenarios.py`
2. `prediteq_api/routers/simulator.py`
3. `prediteq_api/ml/engine_manager.py`
4. `prediteq_api/routers/diagnostics_rul.py`
5. `prediteq_frontend/src/components/pages/DashboardPage.tsx`
6. `prediteq_frontend/src/components/pages/DiagnosticsPage.tsx`
7. `prediteq_frontend/src/components/pages/PlannerPage.tsx`

That sequence tells the whole story:

`scenario -> telemetry -> runtime engine -> prognosis -> dashboard -> diagnosis -> action planning`

## If the jury asks "where is the real value?"

Open:

- `prediteq_api/ml/engine_manager.py`
- `prediteq_api/routers/diagnostics_rul.py`
- `prediteq_ml/config.py`
- `prediteq_ml/steps/step5_rul_model.py`

Why:

- this is where prediction is produced
- this is what differentiates the product from plain GMAO tools

## If the jury asks "how do the 3 demo machines differ?"

Open:

- `prediteq_api/demo_scenarios.py`
- `prediteq_api/routers/simulator.py`

Why:

- `demo_scenarios.py` defines the machine stories
- `simulator.py` turns those stories into coherent telemetry and replay behavior

## If the jury asks "where do alerts, emails and admin rules live?"

Open:

- `prediteq_api/routers/seuils.py`
- `prediteq_api/scheduler.py`
- `prediteq_api/core/email_client.py`
- `prediteq_frontend/src/components/pages/AdminPage.tsx`
- `prediteq_frontend/src/components/pages/AlertsPage.tsx`

## If the jury asks "where is the frontend routing and page structure?"

Open:

- `prediteq_frontend/src/pages/Index.tsx`
- `prediteq_frontend/src/components/pages/README.md`

## If the jury asks "where is the offline ML pipeline?"

Open:

- `prediteq_ml/README.md`
- `INDEX_RESULTATS.md`
- `prediteq_ml/steps/README.md`

## Best code walkthrough for a technical jury

1. `prediteq_ml/config.py`
2. `prediteq_ml/steps/step1_simulate.py`
3. `prediteq_ml/steps/step2_preprocess.py`
4. `prediteq_ml/steps/step3_isolation_forest.py`
5. `prediteq_ml/steps/step4_health_index.py`
6. `prediteq_ml/steps/step5_rul_model.py`
7. `prediteq_api/ml/engine_manager.py`
8. `prediteq_api/routers/diagnostics_rul.py`
9. `prediteq_frontend/src/hooks/useMachines.ts`
10. `prediteq_frontend/src/components/pages/DashboardPage.tsx`

## Best code walkthrough for a mixed jury

1. `prediteq_api/demo_scenarios.py`
2. `prediteq_frontend/src/components/pages/DashboardPage.tsx`
3. `prediteq_frontend/src/components/pages/DiagnosticsPage.tsx`
4. `prediteq_frontend/src/components/pages/PlannerPage.tsx`
5. `prediteq_frontend/src/components/pages/MaintenancePage.tsx`
6. `prediteq_frontend/src/components/pages/CostsPage.tsx`
7. `prediteq_frontend/src/components/pages/AlertsPage.tsx`

## Questions to files map

| Question | Open this |
| --- | --- |
| Where do the machine stories start? | `prediteq_api/demo_scenarios.py` |
| Where does replay happen? | `prediteq_api/routers/simulator.py` |
| Where is runtime feature building? | `prediteq_api/ml/engine_manager.py` |
| Where is live RUL response built? | `prediteq_api/routers/diagnostics_rul.py` |
| Where is alert recipient logic? | `prediteq_api/routers/seuils.py` |
| Where is email sending? | `prediteq_api/core/email_client.py` |
| Where is the dashboard? | `prediteq_frontend/src/components/pages/DashboardPage.tsx` |
| Where is advanced diagnosis? | `prediteq_frontend/src/components/pages/DiagnosticsPage.tsx` |
| Where is AI planning? | `prediteq_frontend/src/components/pages/PlannerPage.tsx` |
| Where is calendar execution? | `prediteq_frontend/src/components/pages/MaintenancePage.tsx` |
| Where is budget impact? | `prediteq_frontend/src/components/pages/CostsPage.tsx` |
| Where is the exact ML pipeline order? | `INDEX_RESULTATS.md` |

## What to ignore during a jury code demo

Do not start with these folders if the goal is product understanding:

- `rapport_firas/`
- `rapport_firas_v2/`
- `final_report/`
- `references/` archival wording/deploy/report guides
- `external-skills/`
- `project context/`
- `prediteq_pipeline_docs/` oral notes and helper path maps
- `hardware/`
- `logs/`

These are useful project assets, but not the fastest path to explain the running product.
