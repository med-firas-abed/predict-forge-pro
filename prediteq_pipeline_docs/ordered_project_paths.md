# PrediTeq - Chemins ordonnes du projet

Tous les chemins ci-dessous sont relatifs a la racine du workspace `pfe_MIME_26/`.

Les chemins sont presentes sous forme de liens Markdown relatifs. Dans les editeurs qui supportent les liens Markdown, un `Ctrl+clic` sur le lien ouvre directement le fichier cible.

Ce document se concentre sur les fichiers utiles pour :

- la simulation,
- l'entrainement et la validation ML,
- les plots et metriques generes,
- le backend runtime qui charge et sert les modeles,
- le frontend qui expose le simulateur et les sorties ML.

Il ne cherche pas a lister tous les fichiers utilitaires de l'UI.

## 1. Fichiers racine d'orientation

| Chemin | Role |
| --- | --- |
| [`README.md`](../README.md) | Description generale du depot. |
| [`INDEX_RESULTATS.md`](../INDEX_RESULTATS.md) | Meilleure vue d'ensemble des scripts, metriques, artefacts et sorties. |
| [`AGENTS.md`](../AGENTS.md) | Regles projet et priorites de source de verite. |

## 2. References ML centrales

| Chemin | Role |
| --- | --- |
| [`prediteq_ml/config.py`](../prediteq_ml/config.py) | Source de verite actuelle pour les constantes et commentaires scientifiques. |
| [`prediteq_ml/PIPELINE_EXPLAINED.txt`](../prediteq_ml/PIPELINE_EXPLAINED.txt) | Explication pedagogique du pipeline ; utile, mais partiellement stale par rapport au code courant. |

## 3. Scripts du pipeline ML offline dans l'ordre d'execution

Ces scripts sont a lancer depuis `prediteq_ml/`.

| Ordre | Script | Entree | Sortie |
| --- | --- | --- | --- |
| 1 | [`prediteq_ml/steps/step1_simulate.py`](../prediteq_ml/steps/step1_simulate.py) | aucune | [`prediteq_ml/data/raw/trajectories.csv`](../prediteq_ml/data/raw/trajectories.csv) |
| 2 | [`prediteq_ml/steps/step2_preprocess.py`](../prediteq_ml/steps/step2_preprocess.py) | [`prediteq_ml/data/raw/trajectories.csv`](../prediteq_ml/data/raw/trajectories.csv) | [`prediteq_ml/data/processed/features.csv`](../prediteq_ml/data/processed/features.csv), [`prediteq_ml/models/scaler_params.json`](../prediteq_ml/models/scaler_params.json) |
| 3 | [`prediteq_ml/steps/step3_isolation_forest.py`](../prediteq_ml/steps/step3_isolation_forest.py) | [`prediteq_ml/data/processed/features.csv`](../prediteq_ml/data/processed/features.csv) | [`prediteq_ml/data/processed/anomaly_scores.csv`](../prediteq_ml/data/processed/anomaly_scores.csv), [`prediteq_ml/models/isolation_forest.pkl`](../prediteq_ml/models/isolation_forest.pkl), [`prediteq_ml/models/hybrid_params.json`](../prediteq_ml/models/hybrid_params.json) |
| 4 | [`prediteq_ml/steps/step4_health_index.py`](../prediteq_ml/steps/step4_health_index.py) | [`prediteq_ml/data/processed/anomaly_scores.csv`](../prediteq_ml/data/processed/anomaly_scores.csv) | [`prediteq_ml/data/processed/hi.csv`](../prediteq_ml/data/processed/hi.csv), [`prediteq_ml/models/hi_params.json`](../prediteq_ml/models/hi_params.json) |
| 5 | [`prediteq_ml/steps/step5_rul_model.py`](../prediteq_ml/steps/step5_rul_model.py) | [`prediteq_ml/data/processed/hi.csv`](../prediteq_ml/data/processed/hi.csv), [`prediteq_ml/data/processed/features.csv`](../prediteq_ml/data/processed/features.csv) | [`prediteq_ml/data/processed/rul_predictions.csv`](../prediteq_ml/data/processed/rul_predictions.csv), [`prediteq_ml/models/random_forest_rul.pkl`](../prediteq_ml/models/random_forest_rul.pkl), [`prediteq_ml/outputs/rul_cv_scores.json`](../prediteq_ml/outputs/rul_cv_scores.json) |
| 6 | [`prediteq_ml/steps/step6_evaluate.py`](../prediteq_ml/steps/step6_evaluate.py) | [`prediteq_ml/data/processed/hi.csv`](../prediteq_ml/data/processed/hi.csv), [`prediteq_ml/data/processed/anomaly_scores.csv`](../prediteq_ml/data/processed/anomaly_scores.csv), [`prediteq_ml/data/processed/rul_predictions.csv`](../prediteq_ml/data/processed/rul_predictions.csv), modele RF | [`prediteq_ml/outputs/metrics.json`](../prediteq_ml/outputs/metrics.json), plots 1 a 5 dans [`prediteq_ml/outputs/plots/`](../prediteq_ml/outputs/plots/) |
| 6B | [`prediteq_ml/steps/step6b_cmapss.py`](../prediteq_ml/steps/step6b_cmapss.py) | fichiers CMAPSS dans [`prediteq_ml/data/cmapss/`](../prediteq_ml/data/cmapss/) | [`prediteq_ml/outputs/cmapss_metrics.json`](../prediteq_ml/outputs/cmapss_metrics.json), [`prediteq_ml/outputs/plots/plot6_cmapss.png`](../prediteq_ml/outputs/plots/plot6_cmapss.png). Les metriques publiees actuellement viennent d'un split interne `80/20` sur les moteurs train CMAPSS. |
| 6C | [`prediteq_ml/steps/step6c_calibration.py`](../prediteq_ml/steps/step6c_calibration.py) | [`prediteq_ml/data/processed/rul_predictions.csv`](../prediteq_ml/data/processed/rul_predictions.csv) | [`prediteq_ml/outputs/calibration_metrics.json`](../prediteq_ml/outputs/calibration_metrics.json), [`prediteq_ml/outputs/plots/plot7_calibration.png`](../prediteq_ml/outputs/plots/plot7_calibration.png) |
| 7 | [`prediteq_ml/steps/step7_export.py`](../prediteq_ml/steps/step7_export.py) | modeles et params dans [`prediteq_ml/models/`](../prediteq_ml/models/) | [`prediteq_ml/outputs/mqtt_schema.json`](../prediteq_ml/outputs/mqtt_schema.json) |

## 4. Scripts ML utilitaires complementaires

| Chemin | Role |
| --- | --- |
| [`prediteq_ml/steps/generate_test_trajectory.py`](../prediteq_ml/steps/generate_test_trajectory.py) | Genere une trajectoire de test separee pour demos et verifications. |

## 5. Donnees brutes et transformees dans l'ordre du flux

### 5.1 Donnees brutes synthetiques et benchmark

| Chemin | Role |
| --- | --- |
| [`prediteq_ml/data/raw/trajectories.csv`](../prediteq_ml/data/raw/trajectories.csv) | Jeu principal de trajectoires simulees run-to-failure. |
| [`prediteq_ml/data/raw/test_trajectories.csv`](../prediteq_ml/data/raw/test_trajectories.csv) | Jeu plus petit pour demo et test. |
| [`prediteq_ml/data/cmapss/train_FD001.txt`](../prediteq_ml/data/cmapss/train_FD001.txt) | Split train NASA CMAPSS FD001. |
| [`prediteq_ml/data/cmapss/test_FD001.txt`](../prediteq_ml/data/cmapss/test_FD001.txt) | Split test NASA CMAPSS FD001. |
| [`prediteq_ml/data/cmapss/RUL_FD001.txt`](../prediteq_ml/data/cmapss/RUL_FD001.txt) | Labels RUL NASA CMAPSS FD001. |

### 5.2 Artefacts ML transformes

| Chemin | Role |
| --- | --- |
| [`prediteq_ml/data/processed/features.csv`](../prediteq_ml/data/processed/features.csv) | Caracteristiques ingenieurees et variables normalisees. |
| [`prediteq_ml/data/processed/anomaly_scores.csv`](../prediteq_ml/data/processed/anomaly_scores.csv) | Scores IF, scores hybrides et flags d'anomalie. |
| [`prediteq_ml/data/processed/hi.csv`](../prediteq_ml/data/processed/hi.csv) | Health Index a la minute avec zones. |
| [`prediteq_ml/data/processed/rul_predictions.csv`](../prediteq_ml/data/processed/rul_predictions.csv) | Predictions RUL holdout avec bandes de confiance. |

## 6. Modeles et fichiers de parametres

| Chemin | Role |
| --- | --- |
| [`prediteq_ml/models/scaler_params.json`](../prediteq_ml/models/scaler_params.json) | Parametres de normalisation bases sur la reference saine. |
| [`prediteq_ml/models/isolation_forest.pkl`](../prediteq_ml/models/isolation_forest.pkl) | Detecteur d'anomalies entraine. |
| [`prediteq_ml/models/hybrid_params.json`](../prediteq_ml/models/hybrid_params.json) | Calibration du score hybride et de son seuil. |
| [`prediteq_ml/models/hi_params.json`](../prediteq_ml/models/hi_params.json) | Parametres p5/p95 pour la normalisation du Health Index. |
| [`prediteq_ml/models/random_forest_rul.pkl`](../prediteq_ml/models/random_forest_rul.pkl) | Modele final Random Forest pour le RUL. |
| [`prediteq_ml/models/prediteq_engine.py`](../prediteq_ml/models/prediteq_engine.py) | Moteur d'inference runtime utilise par l'API. |

## 7. Sorties de validation et metriques

| Chemin | Role |
| --- | --- |
| [`prediteq_ml/outputs/metrics.json`](../prediteq_ml/outputs/metrics.json) | Resume principal des performances detection d'anomalie et RUL. |
| [`prediteq_ml/outputs/rul_cv_scores.json`](../prediteq_ml/outputs/rul_cv_scores.json) | Detail holdout, CV, baselines, ablation et courbe OOB du RUL. |
| [`prediteq_ml/outputs/cmapss_metrics.json`](../prediteq_ml/outputs/cmapss_metrics.json) | Validation externe sur NASA CMAPSS FD001. |
| [`prediteq_ml/outputs/calibration_metrics.json`](../prediteq_ml/outputs/calibration_metrics.json) | Metriques de calibration des intervalles de confiance. |
| [`prediteq_ml/outputs/mqtt_schema.json`](../prediteq_ml/outputs/mqtt_schema.json) | Contrat runtime du payload/reponse MQTT. |
| [`prediteq_ml/outputs/lead_time.json`](../prediteq_ml/outputs/lead_time.json) | Artefact supplementaire present dans le dossier outputs. |

## 8. Fichiers de plots dans l'ordre de presentation

| Plot | Chemin | Signification |
| --- | --- | --- |
| 1 | [`prediteq_ml/outputs/plots/plot1_hi_curves.png`](../prediteq_ml/outputs/plots/plot1_hi_curves.png) | Courbes HI par profil. |
| 2 | [`prediteq_ml/outputs/plots/plot2_rul_scatter.png`](../prediteq_ml/outputs/plots/plot2_rul_scatter.png) | RUL predit vs RUL reel. |
| 3 | [`prediteq_ml/outputs/plots/plot3_anomaly_timeline.png`](../prediteq_ml/outputs/plots/plot3_anomaly_timeline.png) | Score IF, baseline RMS et evolution HI dans le temps. |
| 4 | [`prediteq_ml/outputs/plots/plot4_shap_summary.png`](../prediteq_ml/outputs/plots/plot4_shap_summary.png) | Resume SHAP pour la prediction RUL. |
| 5 | [`prediteq_ml/outputs/plots/plot5_sensitivity_heatmap.png`](../prediteq_ml/outputs/plots/plot5_sensitivity_heatmap.png) | Analyse de sensibilite a la contamination IF. |
| 6 | [`prediteq_ml/outputs/plots/plot6_cmapss.png`](../prediteq_ml/outputs/plots/plot6_cmapss.png) | Plot de validation externe NASA CMAPSS. |
| 7 | [`prediteq_ml/outputs/plots/plot7_calibration.png`](../prediteq_ml/outputs/plots/plot7_calibration.png) | Plot de calibration des intervalles de confiance. |

## 9. Fichiers backend runtime qui chargent et servent les modeles

### 9.1 Entree backend et configuration

| Chemin | Role |
| --- | --- |
| [`prediteq_api/main.py`](../prediteq_api/main.py) | Point d'entree FastAPI. |
| [`prediteq_api/requirements.txt`](../prediteq_api/requirements.txt) | Dependances Python du backend. |
| [`prediteq_api/scheduler.py`](../prediteq_api/scheduler.py) | Taches planifiees backend, y compris la logique de persistance utile a la calibration runtime. |

### 9.2 Couche runtime de chargement de modeles et d'ingenierie de features

| Chemin | Role |
| --- | --- |
| [`prediteq_api/ml/loader.py`](../prediteq_api/ml/loader.py) | Charge tous les artefacts ML depuis `prediteq_ml/models/`. |
| [`prediteq_api/ml/engine_manager.py`](../prediteq_api/ml/engine_manager.py) | Convertit les capteurs live bruts en 12 features derivees et gere un moteur par machine. |

### 9.3 Routeurs backend directement lies a la simulation, au ML et au RUL

| Chemin | Role |
| --- | --- |
| [`prediteq_api/routers/simulator.py`](../prediteq_api/routers/simulator.py) | Logique du simulateur demo/live basee sur les memes helpers physiques que la simulation offline. |
| [`prediteq_api/routers/mqtt.py`](../prediteq_api/routers/mqtt.py) | Ingestion des payloads capteurs live. |
| [`prediteq_api/routers/machines.py`](../prediteq_api/routers/machines.py) | Statut machine et sorties ML runtime principales. |
| [`prediteq_api/routers/diagnostics_rul.py`](../prediteq_api/routers/diagnostics_rul.py) | RUL enrichi, diagnostics et endpoints d'explicabilite. |
| [`prediteq_api/routers/explain.py`](../prediteq_api/routers/explain.py) | Endpoints d'explication. |
| [`prediteq_api/routers/seuils.py`](../prediteq_api/routers/seuils.py) | Seuils runtime pouvant surcharger les valeurs offline. |
| [`prediteq_api/routers/alerts.py`](../prediteq_api/routers/alerts.py) | Logique d'alertes liee aux etats de sante. |
| [`prediteq_api/routers/health.py`](../prediteq_api/routers/health.py) | Checks de sante/statu backend. |
| [`prediteq_api/routers/report.py`](../prediteq_api/routers/report.py) | Route backend de generation de rapport. |

## 10. Package `diagnostics` de `prediteq_ml` utilise par l'API

| Chemin | Role |
| --- | --- |
| [`prediteq_ml/diagnostics/__init__.py`](../prediteq_ml/diagnostics/__init__.py) | Surface d'export du package. |
| [`prediteq_ml/diagnostics/diagnose.py`](../prediteq_ml/diagnostics/diagnose.py) | Logique de diagnostic a base de regles. |
| [`prediteq_ml/diagnostics/explain.py`](../prediteq_ml/diagnostics/explain.py) | Helpers SHAP et explication. |
| [`prediteq_ml/diagnostics/rul_confidence.py`](../prediteq_ml/diagnostics/rul_confidence.py) | Utilitaires d'intervalles de confiance et badges. |
| [`prediteq_ml/diagnostics/rul_calibration.py`](../prediteq_ml/diagnostics/rul_calibration.py) | Helpers de conversion et calibration RUL. |
| [`prediteq_ml/diagnostics/disclaimers.py`](../prediteq_ml/diagnostics/disclaimers.py) | Disclaimers runtime et texte de model card. |
| [`prediteq_ml/diagnostics/stress.py`](../prediteq_ml/diagnostics/stress.py) | Calculs d'indice de stress. |
| [`prediteq_ml/diagnostics/demo.py`](../prediteq_ml/diagnostics/demo.py) | Helpers de demonstration. |
| [`prediteq_ml/diagnostics/README.md`](../prediteq_ml/diagnostics/README.md) | Notes du package diagnostics. |

## 11. Fichiers frontend qui exposent la simulation et les sorties ML

### 11.1 Entree frontend et client API

| Chemin | Role |
| --- | --- |
| [`prediteq_frontend/src/main.tsx`](../prediteq_frontend/src/main.tsx) | Bootstrap de l'application frontend. |
| [`prediteq_frontend/src/App.tsx`](../prediteq_frontend/src/App.tsx) | Shell principal de l'application. |
| [`prediteq_frontend/src/lib/api.ts`](../prediteq_frontend/src/lib/api.ts) | Client API partage utilise par les pages simulateur et dashboard. |

### 11.2 Pages directement liees au simulateur et aux sorties ML

| Chemin | Role |
| --- | --- |
| [`prediteq_frontend/src/components/pages/SimulatorPage.tsx`](../prediteq_frontend/src/components/pages/SimulatorPage.tsx) | Page de controle du simulateur. |
| [`prediteq_frontend/src/components/pages/DashboardPage.tsx`](../prediteq_frontend/src/components/pages/DashboardPage.tsx) | Page principale du dashboard. |
| [`prediteq_frontend/src/components/pages/MachinesPage.tsx`](../prediteq_frontend/src/components/pages/MachinesPage.tsx) | Page de suivi machine par machine. |
| [`prediteq_frontend/src/components/pages/DiagnosticsPage.tsx`](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx) | Page d'affichage des diagnostics et du RUL. |
| [`prediteq_frontend/src/components/pages/AlertsPage.tsx`](../prediteq_frontend/src/components/pages/AlertsPage.tsx) | Page orientee alertes. |
| [`prediteq_frontend/src/components/pages/ExperimentPage.tsx`](../prediteq_frontend/src/components/pages/ExperimentPage.tsx) | Page experimentale ou auxiliaire. |

### 11.3 Composants et hooks lies au HI, diagnostics et statut machine

| Chemin | Role |
| --- | --- |
| [`prediteq_frontend/src/components/industrial/HIChart.tsx`](../prediteq_frontend/src/components/industrial/HIChart.tsx) | Graphe d'evolution du Health Index. |
| [`prediteq_frontend/src/components/industrial/DiagnosticsPanel.tsx`](../prediteq_frontend/src/components/industrial/DiagnosticsPanel.tsx) | Panneau de diagnostics combine. |
| [`prediteq_frontend/src/components/industrial/MachineCard.tsx`](../prediteq_frontend/src/components/industrial/MachineCard.tsx) | Carte resume d'une machine. |
| [`prediteq_frontend/src/components/industrial/MachineModal.tsx`](../prediteq_frontend/src/components/industrial/MachineModal.tsx) | Modal detaillee d'une machine. |
| [`prediteq_frontend/src/hooks/useMachines.ts`](../prediteq_frontend/src/hooks/useMachines.ts) | Hook pour le statut machine et les metriques live. |
| [`prediteq_frontend/src/hooks/useDiagnostics.ts`](../prediteq_frontend/src/hooks/useDiagnostics.ts) | Hook pour diagnostics et payloads RUL. |
| [`prediteq_frontend/src/hooks/useHistoriqueHI.ts`](../prediteq_frontend/src/hooks/useHistoriqueHI.ts) | Hook pour l'historique du HI. |

## 12. Fichiers de rapport et de presentation qui citent le pipeline

| Chemin | Role |
| --- | --- |
| [`PrediTeq_Dossier_Jury.pdf`](../PrediTeq_Dossier_Jury.pdf) | PDF principal du dossier jury. |
| [`PrediTeq_Soutenance_v3.pptx`](../PrediTeq_Soutenance_v3.pptx) | Deck principal de soutenance present a la racine. |
| [`final_report/report.md`](../final_report/report.md) | Source prose actuelle du rapport dans l'espace `final_report/`. |

## 13. Chemin de lecture le plus rapide pour comprendre le projet

Si quelqu'un veut comprendre rapidement le projet, lire dans cet ordre :

1. [`INDEX_RESULTATS.md`](../INDEX_RESULTATS.md)
2. [`prediteq_ml/config.py`](../prediteq_ml/config.py)
3. [`prediteq_ml/steps/step1_simulate.py`](../prediteq_ml/steps/step1_simulate.py)
4. [`prediteq_ml/steps/step2_preprocess.py`](../prediteq_ml/steps/step2_preprocess.py)
5. [`prediteq_ml/steps/step3_isolation_forest.py`](../prediteq_ml/steps/step3_isolation_forest.py)
6. [`prediteq_ml/steps/step4_health_index.py`](../prediteq_ml/steps/step4_health_index.py)
7. [`prediteq_ml/steps/step5_rul_model.py`](../prediteq_ml/steps/step5_rul_model.py)
8. [`prediteq_ml/outputs/metrics.json`](../prediteq_ml/outputs/metrics.json)
9. [`prediteq_ml/outputs/rul_cv_scores.json`](../prediteq_ml/outputs/rul_cv_scores.json)
10. [`prediteq_ml/outputs/cmapss_metrics.json`](../prediteq_ml/outputs/cmapss_metrics.json)
11. [`prediteq_ml/outputs/calibration_metrics.json`](../prediteq_ml/outputs/calibration_metrics.json)
12. [`prediteq_ml/models/prediteq_engine.py`](../prediteq_ml/models/prediteq_engine.py)
13. [`prediteq_api/ml/engine_manager.py`](../prediteq_api/ml/engine_manager.py)
14. [`prediteq_api/routers/simulator.py`](../prediteq_api/routers/simulator.py)
15. [`prediteq_frontend/src/components/pages/SimulatorPage.tsx`](../prediteq_frontend/src/components/pages/SimulatorPage.tsx)
16. [`prediteq_frontend/src/components/industrial/HIChart.tsx`](../prediteq_frontend/src/components/industrial/HIChart.tsx)
