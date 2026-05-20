# Guide de mise a jour des slides

Objectif :
garder les slides alignes avec le rapport, les guides de soutenance et surtout
avec les fichiers source de verite du depot.

Structure recommandee :

`probleme -> demarche methodologique -> donnees d'entrainement -> variables choisies -> 3 machines demo -> pipeline ML -> validation -> runtime -> produit -> integration live -> demo -> limites`

Cette structure est plus claire pour un jury mixte, surtout non technique.

## Deck recommande

- `15 slides principales`
- `5 slides backup`
- total genere actuellement : `20 slides`

Usage conseille :

- `7 min` : slides `1` a `12`, puis integrer les slides `13-15` tres vite
- `10 min` : slides `1` a `15`
- `Q&A` : slides `16` a `20`

## Slide 1 - Titre et promesse

But :
dire en une phrase ce qu'est PrediTeq.

A mettre :

- titre du projet
- sous-titre simple
- phrase courte : `du signal machine a la decision de maintenance`

Phrase a dire :

> PrediTeq est une chaine complete qui part du comportement physique de la machine et arrive jusqu'a la decision de maintenance dans l'application web.

## Slide 2 - Probleme industriel

But :
faire comprendre le besoin avant la technique.

A mettre :

- machine cible
- risque de panne
- cout d'intervenir trop tot ou trop tard
- deux sorties lisibles : `Health Index` et `RUL`

Supports :

- [photo_machine_aroteq.png](../final_report/prediteq_overleaf_report/images/photo_machine_aroteq.png)
- [schema_positionnement_stage_aroteq.png](../final_report/prediteq_overleaf_report/images/schema_positionnement_stage_aroteq.png)

Phrase a dire :

> Le besoin n'est pas de faire de l'IA pour l'IA, mais d'aider a intervenir au bon moment sur une machine industrielle utile a la production.

## Slide 3 - Demarche methodologique

But :
montrer qu'on a suivi une vraie progression industrielle, pas juste empile des modeles.

A mettre :

- peu de donnees reelles longues au depart
- simulation realiste pour demarrer sans bloquer le projet
- progression par phases : signal -> indicateurs -> anomalies -> HI -> RUL
- validation bloc par bloc
- collecte live, historisation et futur journal maintenance en parallele
- expertise technicien pour choisir les variables et les hypotheses

Supports :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [PIPELINE_EXPLAINED.txt](../prediteq_ml/PIPELINE_EXPLAINED.txt)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)

Phrase a dire :

> Nous avons suivi une demarche simple : partir d'une machine reelle, construire un socle simule defendable, avancer etape par etape, valider chaque bloc, puis preparer deja la collecte terrain.

## Slide 4 - Donnees d'entrainement simulees

But :
montrer clairement ce qu'est une trajectoire et ce que contient le jeu d'entrainement.

A mettre :

- `200 trajectoires`
- `4 profils de degradation`
- `20 cas de charge`
- colonnes exportees vers `trajectories.csv`
- phrase simple : une trajectoire = l'histoire complete d'une machine simulee dans le temps

Preuve a afficher :

- [proof_code_07_training_dataset.png](../final_report/prediteq_overleaf_report/images_free/proof_code_07_training_dataset.png)

Fichier source :

- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)

Phrase a dire :

> Notre jeu d'entrainement n'est pas une table arbitraire. Il est fabrique a partir de trajectoires, donc de scenarios machine complets qui evoluent dans le temps.

## Slide 5 - Pourquoi ces variables

But :
faire comprendre pourquoi on a choisi `charge`, `puissance`, `courant`, `vibration`, `temperature`, `humidite`.

A mettre :

- `charge -> puissance -> courant -> echauffement -> usure -> HI baisse -> vibration monte`
- rappel des constantes machine : vrai moteur, charge max `285 kg`, cycle `44 s`
- phrase simple : les variables sont choisies parce qu'elles changent vraiment quand la machine travaille plus fort ou se degrade

Preuves a afficher :

- [proof_code_01_sim_constants.png](../final_report/prediteq_overleaf_report/images_free/proof_code_01_sim_constants.png)
- [proof_code_02_sim_power_current.png](../final_report/prediteq_overleaf_report/images_free/proof_code_02_sim_power_current.png)

Fichiers source :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)

Phrase a dire :

> Nous avons choisi des variables qui ont une lecture physique defendable et qui restent reutilisables plus tard dans le runtime live.

## Slide 6 - Logique des 3 machines simulees

But :
montrer que les `3` machines demo ne sont pas `3` machines aleatoires.

A mettre :

- `ASC-A1` : usage leger, charges faibles a moyennes, environnement protege, HI cible haut
- `ASC-B2` : trafic mixte, demi-charges, stress moyen, HI cible moyen
- `ASC-C3` : charges lourdes, ambiance severe, usure forte, HI cible bas
- phrase simple : meme base machine, mais contextes d'usage differents

Preuves a afficher :

- [proof_code_08_demo_machine_scenarios.png](../final_report/prediteq_overleaf_report/images_free/proof_code_08_demo_machine_scenarios.png)
- [proof_code_09_demo_machine_runtime_logic.png](../final_report/prediteq_overleaf_report/images_free/proof_code_09_demo_machine_runtime_logic.png)

Fichiers source :

- [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- [simulator.py](../prediteq_api/routers/simulator.py)

Phrase a dire :

> Les trois machines de demonstration racontent trois regimes d'usage differents. Le simulateur change les motifs de charge, le stress, l'usure et le point de depart, pas seulement une couleur d'ecran.

## Slide 7 - Pipeline ML dans l'ordre

But :
donner une lecture propre du pipeline.

A mettre :

1. simulation
2. preprocessing
3. anomalies
4. Health Index
5. RUL
6. evaluation
7. validation NASA
8. calibration
9. export runtime

Fichiers source :

- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [step7_export.py](../prediteq_ml/steps/step7_export.py)

Phrase a dire :

> Le projet n'est pas un seul modele ; c'est une progression ordonnee de scripts, validee bloc par bloc, qui produit ensuite des artefacts runtime.

## Slide 8 - Features, anomalies et Health Index

But :
expliquer comment on passe de quelques mesures brutes a une note de sante lisible.

A mettre :

- `4 mesures brutes -> indicateurs intermediaires`
- `une feature = un indicateur calcule`
- detection d'ecart / comportement inhabituel
- conversion en note de sante plus lisible

Preuves a afficher :

- [proof_code_03_ml_features.png](../final_report/prediteq_overleaf_report/images_free/proof_code_03_ml_features.png)
- [proof_code_04_ml_hybrid_score.png](../final_report/prediteq_overleaf_report/images_free/proof_code_04_ml_hybrid_score.png)
- [plot3_anomaly_timeline.png](../prediteq_ml/outputs/plots/plot3_anomaly_timeline.png)

Phrase a dire :

> Pour un jury non technique, une feature est simplement un indicateur calcule a partir des mesures brutes. Ensuite, le pipeline transforme cela en une note de sante plus lisible.

## Slide 9 - Prediction du RUL

But :
expliquer le RUL sans jargon inutile.

A mettre :

- `RUL = temps restant avant qu'il faille agir`
- construit a partir de `hi_smooth`
- validation sans fuite de trajectoires
- utilite concrete pour la planification

Preuves a afficher :

- [proof_code_05_ml_rul_target.png](../final_report/prediteq_overleaf_report/images_free/proof_code_05_ml_rul_target.png)
- [proof_code_06_ml_groupkfold.png](../final_report/prediteq_overleaf_report/images_free/proof_code_06_ml_groupkfold.png)
- [plot2_rul_scatter.png](../prediteq_ml/outputs/plots/plot2_rul_scatter.png)

Phrase a dire :

> Le RUL repond a une question simple : combien de temps reste-t-il avant qu'une action devienne necessaire ?

## Slide 10 - Validation

But :
montrer que le pipeline a ete verifie de plusieurs facons.

A mettre :

- test separe sur nos donnees
- validation par trajectoires entieres
- benchmark externe NASA CMAPSS
- calibration / confiance

Supports :

- [metrics.json](../prediteq_ml/outputs/metrics.json)
- [rul_cv_scores.json](../prediteq_ml/outputs/rul_cv_scores.json)
- [cmapss_metrics.json](../prediteq_ml/outputs/cmapss_metrics.json)
- [plot6_cmapss.png](../prediteq_ml/outputs/plots/plot6_cmapss.png)
- [plot7_calibration.png](../prediteq_ml/outputs/plots/plot7_calibration.png)

Phrase a dire :

> Le message important pour un non specialiste n'est pas de retenir tous les sigles, mais de voir que le pipeline tient sur plusieurs controles differents.

## Slide 11 - Runtime backend

But :
montrer comment l'offline devient un systeme vivant.

A mettre :

- artefacts exportes
- backend FastAPI
- moteur runtime par machine
- seuils live et contexte machine

Fichiers source :

- [main.py](../prediteq_api/main.py)
- [loader.py](../prediteq_api/ml/loader.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)

Phrase a dire :

> L'entrainement vit offline dans `prediteq_ml`, puis le backend charge les artefacts et les applique a la telemetrie runtime.

## Slide 12 - Application web

But :
montrer que la prediction devient decision.

A mettre :

- dashboard
- diagnostics
- planner
- maintenance
- costs

Fichiers source :

- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
- [MaintenancePage.tsx](../prediteq_frontend/src/components/pages/MaintenancePage.tsx)
- [CostsPage.tsx](../prediteq_frontend/src/components/pages/CostsPage.tsx)

Phrase a dire :

> La valeur produit est ici : la prediction se transforme en priorite, action, calendrier et cout.

## Slide 13 - Integration machine reelle / PLC / LabVIEW

But :
montrer l'ouverture vers le monde reel avec un contrat clair.

A mettre :

`LabVIEW / PLC -> PC relais cote client -> MQTT ou HTTP -> /ingest/live -> backend -> frontend`

Puis ajouter :

- les `4` mesures minimales : `rms_mms`, `power_kw`, `temp_c`, `humidity_rh`
- variables utiles en plus : `current_a`, `load_kg`, `status`
- phrase simple : `ARO-01` utilise le meme moteur runtime que les machines demo, mais elle ne passe pas par le simulateur
- phrase simple : avant le flux live, on peut precharger une heure recente d'historique pour eviter un warmup trop long
- phrase simple : demain, la vraie acquisition remplacera surtout la source d'entree

Preuve a afficher :

- [proof_code_10_live_ingest_bridge.png](../final_report/prediteq_overleaf_report/images_free/proof_code_10_live_ingest_bridge.png)

Fichiers source :

- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md)
- [LABVIEW_CSV_BRIDGE_DEMO.md](../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)

Phrase a dire :

> Le contrat live existe deja. `ARO-01` suit deja le vrai chemin produit, et la suite logique est de remplacer progressivement la source CSV de demo par la vraie acquisition LabVIEW ou PLC.

## Slide 14 - Demonstration live

But :
montrer un flux visible de bout en bout.

A mettre :

`bootstrap ARO-01 -> CSV LabVIEW de demonstration -> mqtt_bridge_sender.py -> FastAPI -> application`

Supports :

- [validation_pc2_sender_clean.png](../final_report/prediteq_overleaf_report/images/validation_pc2_sender_clean.png)
- [validation_pc1_backend_clean.png](../final_report/prediteq_overleaf_report/images/validation_pc1_backend_clean.png)
- [validation_pc1_app_aro01_clean.png](../final_report/prediteq_overleaf_report/images/validation_pc1_app_aro01_clean.png)

Phrase a dire :

> Pour la soutenance, nous montrons deja une chaine PC relais -> bridge -> backend -> application. La fin de chaine est deja la vraie chaine live PrediTeq.

Et ajouter si besoin :

> Le bootstrap ne change pas la nature de la machine. Il sert seulement a donner tout de suite assez d'historique recent a `ARO-01` pour publier HI, calendrier et RUL plus vite.

## Slide 15 - Conclusion et limites

But :
finir proprement et honnetement.

A mettre :

- ce qui est deja solide
- ce qui reste a rapprocher du terrain
- la prochaine etape logique

Phrase a dire :

> Nous avons une chaine complete, lisible et montrable ; la prochaine marche est la validation terrain longue duree avec une acquisition industrielle directe.

## Slides backup recommandees

### Slide 16 - Backup jeu d'entrainement + simulation

Supports :

- [proof_code_07_training_dataset.png](../final_report/prediteq_overleaf_report/images_free/proof_code_07_training_dataset.png)
- [proof_code_01_sim_constants.png](../final_report/prediteq_overleaf_report/images_free/proof_code_01_sim_constants.png)
- [proof_code_02_sim_power_current.png](../final_report/prediteq_overleaf_report/images_free/proof_code_02_sim_power_current.png)

### Slide 17 - Backup 3 machines demo

Supports :

- [proof_code_08_demo_machine_scenarios.png](../final_report/prediteq_overleaf_report/images_free/proof_code_08_demo_machine_scenarios.png)
- [proof_code_09_demo_machine_runtime_logic.png](../final_report/prediteq_overleaf_report/images_free/proof_code_09_demo_machine_runtime_logic.png)

### Slide 18 - Backup ML

Supports :

- [proof_code_03_ml_features.png](../final_report/prediteq_overleaf_report/images_free/proof_code_03_ml_features.png)
- [proof_code_04_ml_hybrid_score.png](../final_report/prediteq_overleaf_report/images_free/proof_code_04_ml_hybrid_score.png)
- [proof_code_05_ml_rul_target.png](../final_report/prediteq_overleaf_report/images_free/proof_code_05_ml_rul_target.png)
- [proof_code_06_ml_groupkfold.png](../final_report/prediteq_overleaf_report/images_free/proof_code_06_ml_groupkfold.png)

### Slide 19 - Backup integration live + commandes

Supports :

- [proof_code_10_live_ingest_bridge.png](../final_report/prediteq_overleaf_report/images_free/proof_code_10_live_ingest_bridge.png)
- [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)

### Slide 20 - Backup fichiers source de verite

Ouvrir en priorite :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- [simulator.py](../prediteq_api/routers/simulator.py)
- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)

## Resume ultra-court

Si tu dois resumer la structure des slides en une ligne :

`besoin -> simulation -> jeu d'entrainement -> variables choisies -> 3 machines demo -> ML -> validation -> runtime -> produit -> integration live -> demo -> limites`
