# Matrice idees et couverture

Cette matrice sert a une chose :

- verifier en un coup d'oeil que les idees principales du projet sont couvertes par du code et par des documents

| Idee / besoin | Statut | Fichiers code source de verite | Fichiers de soutenance / preuve |
|---|---|---|---|
| Cas industriel reel au depart | Realise | [config.py](../prediteq_ml/config.py) | [01_GUIDE_DETAILLE_PERSO.md](./01_GUIDE_DETAILLE_PERSO.md), [05_SCRIPT_ORAL_7_MIN.md](./05_SCRIPT_ORAL_7_MIN.md) |
| Demarche progressive et defendable | Realise | [PIPELINE_EXPLAINED.txt](../prediteq_ml/PIPELINE_EXPLAINED.txt), [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py), [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py), [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py) | [GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md](./GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md), [07_OUVERTURES_ORALES_30S_1MIN_2MIN.md](./07_OUVERTURES_ORALES_30S_1MIN_2MIN.md) |
| Simulation realiste du jeu d'entrainement | Realise | [config.py](../prediteq_ml/config.py), [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py) | [01_simulation/README.md](./01_simulation/README.md), [03_GUIDE_MISE_A_JOUR_SLIDES.md](./03_GUIDE_MISE_A_JOUR_SLIDES.md) |
| `200` trajectoires, `4` profils, `20` cas de charge | Realise | [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py), [INDEX_RESULTATS.md](../INDEX_RESULTATS.md) | [01_GUIDE_DETAILLE_PERSO.md](./01_GUIDE_DETAILLE_PERSO.md), [jury_demo_cheat_sheet.md](./jury_demo_cheat_sheet.md) |
| Choix des variables physiques defendables | Realise | [config.py](../prediteq_ml/config.py), [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py), [labview_demo.py](../prediteq_api/core/labview_demo.py) | [GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md](./GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md), [10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md](./10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md) |
| `3` machines de demo lisibles | Realise | [demo_scenarios.py](../prediteq_api/demo_scenarios.py), [simulator.py](../prediteq_api/routers/simulator.py) | [02_GUIDE_LIVE_JURY.md](./02_GUIDE_LIVE_JURY.md), [04_SCRIPT_COMPLET_SLIDES_SOUTENANCE.md](./04_SCRIPT_COMPLET_SLIDES_SOUTENANCE.md) |
| Pipeline ML complet | Realise | [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py), [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py), [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py), [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py) | [02_ml_pipeline/README.md](./02_ml_pipeline/README.md), [01_GUIDE_DETAILLE_PERSO.md](./01_GUIDE_DETAILLE_PERSO.md) |
| Validation et calibration | Realise | [step6_evaluate.py](../prediteq_ml/steps/step6_evaluate.py), [step6b_cmapss.py](../prediteq_ml/steps/step6b_cmapss.py), [step6c_calibration.py](../prediteq_ml/steps/step6c_calibration.py), [prediteq_ml/outputs](../prediteq_ml/outputs) | [03_GUIDE_MISE_A_JOUR_SLIDES.md](./03_GUIDE_MISE_A_JOUR_SLIDES.md), [05_SCRIPT_ORAL_7_MIN.md](./05_SCRIPT_ORAL_7_MIN.md) |
| Backend qui charge les artefacts sans re-entrainer | Realise | [loader.py](../prediteq_api/ml/loader.py), [engine_manager.py](../prediteq_api/ml/engine_manager.py), [prediteq_ml/models](../prediteq_ml/models) | [03_runtime_iot/README.md](./03_runtime_iot/README.md), [10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md](./10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md) |
| Application web complete | Realise | [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx), [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx), [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx), [CalendarPage.tsx](../prediteq_frontend/src/components/pages/CalendarPage.tsx), [RapportIAPage.tsx](../prediteq_frontend/src/components/pages/RapportIAPage.tsx), [ChatWidget.tsx](../prediteq_frontend/src/components/industrial/ChatWidget.tsx) | [04_web_app/README.md](./04_web_app/README.md), [02_GUIDE_LIVE_JURY.md](./02_GUIDE_LIVE_JURY.md) |
| Machine reelle `ARO-01` dans l'app | Realise | [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py), [mqtt.py](../prediteq_api/routers/mqtt.py), [live_ingest.py](../prediteq_api/routers/live_ingest.py), [engine_manager.py](../prediteq_api/ml/engine_manager.py) | [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md), [03_runtime_iot/05_DEMO_RELAY_PC_CSV_VERS_APP.md](./03_runtime_iot/05_DEMO_RELAY_PC_CSV_VERS_APP.md) |
| CSV LabVIEW-style coherent avec la simulation | Realise | [labview_demo.py](../prediteq_api/core/labview_demo.py), [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py), [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py) | [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md), [LABVIEW_CSV_BRIDGE_DEMO.md](../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md) |
| Bridge PC relais -> MQTT / HTTP | Realise | [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py), [mqtt.py](../prediteq_api/routers/mqtt.py), [live_ingest.py](../prediteq_api/routers/live_ingest.py) | [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md), [03_runtime_iot/README.md](./03_runtime_iot/README.md) |
| Demo locale bout en bout | Realise | [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py), [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py), [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py), [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py) | [jury_demo_cheat_sheet.md](./jury_demo_cheat_sheet.md), [00_PANIC_SHEET_1_PAGE.md](./00_PANIC_SHEET_1_PAGE.md) |
| Slides et dossier final alignes sur le code | Realise | [guides_soutenance/tools/create_soutenance_pptx.py](./tools/create_soutenance_pptx.py), [10_dossier_ultime_soutenance.tex](../final_report/prediteq_overleaf_report/10_dossier_ultime_soutenance.tex) | [slides/PrediTeq_Soutenance_Jury_Generated.pptx](./slides/PrediTeq_Soutenance_Jury_Generated.pptx), [rapports/PrediTeq_Dossier_Ultime_Soutenance.pdf](./rapports/PrediTeq_Dossier_Ultime_Soutenance.pdf) |
| Futur vrai PC relais avec CSV ou JSON reels | Deja prepare | [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py), [scripts/.env.bridge.example](../prediteq_api/scripts/.env.bridge.example), [register_machine.py](../prediteq_api/scripts/register_machine.py) | [09_CHECKLIST_REALISE_PARTIEL_FUTUR.md](./09_CHECKLIST_REALISE_PARTIEL_FUTUR.md), [10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md](./10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md), [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md) |
| Futur vrai PC relais avec source specifique site | Partiel | [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py) dans `read_from_custom_source()` | [09_CHECKLIST_REALISE_PARTIEL_FUTUR.md](./09_CHECKLIST_REALISE_PARTIEL_FUTUR.md), [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md) |
| Historique terrain long et annote | Partiel / futur | [scheduler.py](../prediteq_api/scheduler.py), [live_ingest.py](../prediteq_api/routers/live_ingest.py) | [09_CHECKLIST_REALISE_PARTIEL_FUTUR.md](./09_CHECKLIST_REALISE_PARTIEL_FUTUR.md), [06_SCRIPT_ORAL_10_MIN.md](./06_SCRIPT_ORAL_10_MIN.md) |

## Comment lire cette matrice

- `Realise` = idee deja codee et deja documentee
- `Deja prepare` = le chemin est deja code et documente, mais depend encore du format exact de la vraie source site
- `Partiel` = idee bien cadree, mais une adaptation terrain precise reste a faire

## Deux phrases finales

### Phrase courte

> Pour la soutenance, les idees principales du projet sont couvertes par du code et par des documents coherents. Les seules parties encore vraiment site-dependantes concernent la lecture exacte de la source terrain finale et l'enrichissement d'un long historique reel annote.

### Phrase plus ferme

> Le projet est finalise comme demonstrateur live defendable, documente et montrable. La prochaine marche n'est pas de reinventer PrediTeq, mais d'adapter proprement l'entree terrain exacte du site.
