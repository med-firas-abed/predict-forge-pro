# Workspace Map: USE THESE FILES / DO NOT USE THESE FILES

This is the root map for the whole workspace.

If two documents disagree, trust:

1. executable code
2. generated outputs and metrics
3. the canonical jury pack in `guides_soutenance/`
4. older prose only if it matches the code above

## Use These First

Open these first if you want the clean current picture:

- [guides_soutenance/README.md](guides_soutenance/README.md)
- [prediteq_ml/steps/README.md](prediteq_ml/steps/README.md)
- [docs/JURY_CODE_TOUR.md](docs/JURY_CODE_TOUR.md)
- [PrediTeq-Jury.code-workspace](PrediTeq-Jury.code-workspace)

## Current Source Of Truth

### Simulation And Offline ML

These files define the current simulation and training pipeline:

- [prediteq_ml/config.py](prediteq_ml/config.py)
- [prediteq_ml/steps/step1_simulate.py](prediteq_ml/steps/step1_simulate.py)
- [prediteq_ml/steps/step2_preprocess.py](prediteq_ml/steps/step2_preprocess.py)
- [prediteq_ml/steps/step3_isolation_forest.py](prediteq_ml/steps/step3_isolation_forest.py)
- [prediteq_ml/steps/step4_health_index.py](prediteq_ml/steps/step4_health_index.py)
- [prediteq_ml/steps/step5_rul_model.py](prediteq_ml/steps/step5_rul_model.py)
- [prediteq_ml/steps/step6_evaluate.py](prediteq_ml/steps/step6_evaluate.py)
- [prediteq_ml/steps/step6b_cmapss.py](prediteq_ml/steps/step6b_cmapss.py)
- [prediteq_ml/steps/step6c_calibration.py](prediteq_ml/steps/step6c_calibration.py)
- [prediteq_ml/steps/step7_export.py](prediteq_ml/steps/step7_export.py)
- [prediteq_ml/PIPELINE_EXPLAINED.txt](prediteq_ml/PIPELINE_EXPLAINED.txt)

### Verified Metrics And Generated Outputs

Use these when you need the exact current numbers:

- [prediteq_ml/steps/README.md](prediteq_ml/steps/README.md)
- [prediteq_ml/outputs/metrics.json](prediteq_ml/outputs/metrics.json)
- [prediteq_ml/outputs/rul_cv_scores.json](prediteq_ml/outputs/rul_cv_scores.json)
- [prediteq_ml/outputs/cmapss_metrics.json](prediteq_ml/outputs/cmapss_metrics.json)

### Runtime And Live Behavior

These files define what the backend actually does at runtime:

- [prediteq_api/demo_scenarios.py](prediteq_api/demo_scenarios.py)
- [prediteq_api/ml/engine_manager.py](prediteq_api/ml/engine_manager.py)
- [prediteq_api/routers/simulator.py](prediteq_api/routers/simulator.py)
- [prediteq_api/routers/live_ingest.py](prediteq_api/routers/live_ingest.py)
- [prediteq_api/routers/diagnostics_rul.py](prediteq_api/routers/diagnostics_rul.py)

### Frontend Demo And Jury Screens

These files define the main screens you present live:

- [prediteq_frontend/src/components/pages/DashboardPage.tsx](prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [prediteq_frontend/src/components/pages/DiagnosticsPage.tsx](prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [prediteq_frontend/src/components/pages/PlannerPage.tsx](prediteq_frontend/src/components/pages/PlannerPage.tsx)

### Jury Docs To Use Now

These are the canonical presentation files to use now:

- [guides_soutenance/README.md](guides_soutenance/README.md)
- [guides_soutenance/jury_demo_cheat_sheet.md](guides_soutenance/jury_demo_cheat_sheet.md)
- [guides_soutenance/01_GUIDE_DETAILLE_PERSO.md](guides_soutenance/01_GUIDE_DETAILLE_PERSO.md)
- [guides_soutenance/02_GUIDE_LIVE_JURY.md](guides_soutenance/02_GUIDE_LIVE_JURY.md)
- [guides_soutenance/07_OUVERTURES_ORALES_30S_1MIN_2MIN.md](guides_soutenance/07_OUVERTURES_ORALES_30S_1MIN_2MIN.md)
- [guides_soutenance/slides/PrediTeq_Soutenance_Jury_Generated.pptx](guides_soutenance/slides/PrediTeq_Soutenance_Jury_Generated.pptx)
- [guides_soutenance/slides/PrediTeq_Soutenance_Jury_Generated.pdf](guides_soutenance/slides/PrediTeq_Soutenance_Jury_Generated.pdf)
- [guides_soutenance/rapports/PrediTeq_Dossier_Ultime_Soutenance.pdf](guides_soutenance/rapports/PrediTeq_Dossier_Ultime_Soutenance.pdf)

### Report Source Files

Use these if you need to update the jury report source:

- [final_report/report.md](final_report/report.md)
- [final_report/prediteq_overleaf_report/10_dossier_ultime_soutenance.tex](final_report/prediteq_overleaf_report/10_dossier_ultime_soutenance.tex)
- [guides_soutenance/tools/create_soutenance_pptx.py](guides_soutenance/tools/create_soutenance_pptx.py)

## Safe Facts To Repeat

These points are aligned with the current code:

- the current offline pipeline uses `200` trajectories, not `100`
- the machine cycle is `44 s`
- the current max load in the simulation is `285 kg`
- the simulated training set combines `4` degradation profiles and `20` load cases
- the final RUL target is built from observable `hi_smooth`, not trained directly on hidden `simulated_hi`
- the simulator is demo-oriented and can clamp or override displayed `hi_smooth`, `zone`, and RUL in the runtime demo flow
- the backend loads exported models from `prediteq_ml/models/`; it does not retrain models live
- live thresholds can differ from offline defaults because runtime values can come from Supabase

## Use These If You Need To Run Things

- backend local run: [README.md](README.md) and [guides_soutenance/02_GUIDE_LIVE_JURY.md](guides_soutenance/02_GUIDE_LIVE_JURY.md)
- frontend local run: [README.md](README.md) and [guides_soutenance/02_GUIDE_LIVE_JURY.md](guides_soutenance/02_GUIDE_LIVE_JURY.md)
- full ML rerun: [guides_soutenance/GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md](guides_soutenance/GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md)
- LabVIEW / relay-PC live demo path: [guides_soutenance/02_GUIDE_LIVE_JURY.md](guides_soutenance/02_GUIDE_LIVE_JURY.md)

## Do Not Use For Current Facts

These are useful archives, references, or formatting sources, but not the current truth if they disagree with the code:

- [references/](references/)
- [prediteq_pipeline_docs/](prediteq_pipeline_docs/)
- [PrediTeq_Rapport_Final/](PrediTeq_Rapport_Final/)
- [rapport_firas/](rapport_firas/)
- [rapport_firas_v2/](rapport_firas_v2/)
- [docs/reference_materials/](docs/reference_materials/)

## Also Do Not Use These As The Main Jury Entry Point

These exist for compatibility or archive reasons, but they are not the canonical jury pack:

- [final_report/jury_demo_cheat_sheet.md](final_report/jury_demo_cheat_sheet.md)
- [final_report/guides_soutenance/README.md](final_report/guides_soutenance/README.md)
- [final_report/guides_soutenance/jury_demo_cheat_sheet.md](final_report/guides_soutenance/jury_demo_cheat_sheet.md)

## Short Rule

If you are in doubt, stay inside:

- [guides_soutenance/](guides_soutenance/)
- [prediteq_ml/](prediteq_ml/)
- [prediteq_api/](prediteq_api/)
- [prediteq_frontend/](prediteq_frontend/)
- [prediteq_ml/steps/README.md](prediteq_ml/steps/README.md)

That is the cleanest current workspace path.
