# Guide detaille perso

Ce guide est pour toi seul.

Objectif :

1. comprendre toute la chaine dans le bon ordre
2. savoir quel fichier prouve quoi
3. savoir quoi ouvrir si quelqu'un te demande une preuve technique live
4. savoir quoi lancer pour faire tourner l'app ou le flux live de demo

Si tu veux relire uniquement la toute derniere tache finalisee du projet, ouvre aussi :

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)

## 1. Vision globale du projet

La logique complete de PrediTeq est :

1. fixer des constantes physiques et des seuils
2. simuler des trajectoires machine credibles
3. transformer les signaux bruts en features utiles
4. detecter les anomalies
5. construire un Health Index lisible
6. predire le RUL
7. evaluer, calibrer et valider
8. exporter les artefacts
9. charger ces artefacts dans le backend runtime
10. afficher le resultat dans l'application web

En fichiers, la chaine se lit ainsi :

`config.py -> step1 -> step2 -> step3 -> step4 -> step5 -> step6 -> step6b -> step6c -> step7 -> prediteq_ml/models -> prediteq_api/ml/loader.py -> prediteq_api/ml/engine_manager.py -> prediteq_api/routers -> prediteq_frontend/src/components/pages`

## 1 bis. Demarche methodologique a retenir

Si le jury te demande si le projet a suivi une vraie methode industrielle, la reponse courte est oui. La logique a ete :

1. partir d'un vrai cas machine meme si les donnees longues manquaient
2. lancer une simulation realiste plutot que bloquer le projet
3. traiter d'abord le signal et construire des indicateurs
4. detecter l'anormalite avant de parler de RUL
5. valider chaque bloc avant le suivant
6. preparer en parallele la collecte terrain et l'annotation future

Comment cela apparait concretement dans les fichiers :

- cas reel et hypotheses physiques : [config.py](../prediteq_ml/config.py), [PIPELINE_EXPLAINED.txt](../prediteq_ml/PIPELINE_EXPLAINED.txt)
- simulation realiste : [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- indicateurs et features : [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- anomalies puis Health Index : [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py), [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
- RUL ensuite : [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- validation externe et calibration : [step6_evaluate.py](../prediteq_ml/steps/step6_evaluate.py), [step6b_cmapss.py](../prediteq_ml/steps/step6b_cmapss.py), [step6c_calibration.py](../prediteq_ml/steps/step6c_calibration.py)
- collecte reelle et historisation : [live_ingest.py](../prediteq_api/routers/live_ingest.py), [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md), [scheduler.py](../prediteq_api/scheduler.py)
- bootstrap machine reelle pour la demo : [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)

Deux nuances importantes a retenir :

- NASA CMAPSS sert de validation externe methodologique, pas de dataset principal du stockeur.
- la collecte live est deja preparee, mais un vrai historique terrain long et annote reste a construire.

## 2. Les fichiers de base a ouvrir d'abord

Si tu veux te remettre tout le projet en tete rapidement, ouvre dans cet ordre :

1. [config.py](../prediteq_ml/config.py)
2. [PIPELINE_EXPLAINED.txt](../prediteq_ml/PIPELINE_EXPLAINED.txt)
3. [README ML](../prediteq_ml/README.md)
4. [README des steps ML](../prediteq_ml/steps/README.md)
5. [README Backend](../prediteq_api/README.md)
6. [Carte des pages frontend](../prediteq_frontend/src/components/pages/README.md)
7. [JURY_CODE_TOUR.md](../docs/JURY_CODE_TOUR.md)

## 3. Simulation + pipeline ML dans l'ordre

### Etape 0 : configuration centrale

Role :
ce fichier centralise les constantes machine, les parametres de simulation, les seuils HI, les parametres RUL et plusieurs choix de calibration.

Pourquoi c'est important :
si le jury te demande "d'ou viennent les chiffres ?", la reponse commence ici.

Ce qu'il faut comprendre :

- moteur reel, pas moteur imaginaire
- `44 s` de cycle
- `285 kg` de charge max
- `200` trajectoires
- `HI_CRITICAL`, `HYBRID_ALPHA`, fenetre RUL et autres seuils centraux

Fichier principal :

- [config.py](../prediteq_ml/config.py)

Question jury typique :
"Ou avez-vous fixe les hypotheses physiques et les seuils ?"

Reponse fichier :

- [config.py](../prediteq_ml/config.py)

### Etape 1 : simulation

Role :
generer des trajectoires machine realistes avant d'avoir des historiques industriels run-to-failure complets.

Pourquoi on l'a fait :
sans historique de pannes terrain annotees, on ne peut pas construire un pipeline PHM complet seulement avec des donnees reelles.

Ce qu'il faut comprendre :

- la simulation ne remplace pas le terrain
- elle cree un socle realiste et reproductible
- elle reproduit montee, descente, pause, charge, puissance, courant, vibration, temperature, humidite
- elle encode une logique de degradation progressive
- elle produit ensuite un vrai jeu d'entrainement exploitable par le reste du pipeline

Fichiers a ouvrir :

- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [config.py](../prediteq_ml/config.py)

Ce qu'il faut savoir montrer dans le code :

- constantes moteur
- cycle `12 + 12 + 20`
- charge et puissance
- courant derive de la puissance
- vibration qui monte quand HI se degrade

### Ce qu'est exactement le jeu d'entrainement simule

Role :
transformer la simulation en un dataset concret pour l'apprentissage.

Ce qu'il faut comprendre :

- une trajectoire = l'histoire complete d'une machine simulee dans le temps
- le pipeline courant genere `200` trajectoires
- ces trajectoires sont reparties sur `4` profils de degradation
- chaque profil est combine a `20` cas de charge
- les colonnes exportees servent ensuite au preprocessing et au reste de la chaine

Ce qu'il faut savoir dire simplement :

> Nous n'avons pas cree une table arbitraire. Nous avons cree des trajectoires machine, puis nous avons exporte les signaux utiles a l'apprentissage.

Ce qu'il faut montrer dans le code :

- la creation des colonnes dans [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- la repartition `200 / 4 / 20` dans [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)

### Pourquoi ces variables ont ete choisies

Role :
garder des variables defendables physiquement et reutilisables en live.

Ce qu'il faut comprendre :

- la charge influence l'effort de montee
- cet effort influence la puissance
- la puissance influence le courant
- le courant participe a l'echauffement et a l'usure
- l'usure fait baisser le HI et monter la vibration
- temperature et humidite aident a decrire un contexte de fonctionnement plausible

Ce qu'il faut savoir dire simplement :

> Nous avons choisi des variables qui changent vraiment quand la machine travaille plus fort ou se degrade.

Fichiers a ouvrir :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)

### Les 3 machines simulees de la demo

Role :
creer trois contextes d'usage lisibles pour la soutenance et le simulateur runtime.

Ce qu'il faut comprendre :

- `ASC-A1` = machine protegee, usage leger, HI cible haut
- `ASC-B2` = machine sous surveillance, trafic mixte, HI cible moyen
- `ASC-C3` = machine critique, charges lourdes, usure forte, HI cible bas
- ces trois machines ne changent pas seulement de couleur : le simulateur change les motifs de charge, le stress, l'usure et le point de depart

Fichiers a ouvrir :

- [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- [simulator.py](../prediteq_api/routers/simulator.py)

Question jury typique :
"Pourquoi avez-vous trois machines differentes dans la demo ?"

Reponse simple :

> Pour montrer trois regimes d'usage et trois niveaux de sante differents a partir d'une meme base projet.

### Etape 2 : preprocessing et feature engineering

Role :
transformer les donnees brutes en variables plus informatives pour l'apprentissage.

Pourquoi on l'a fait :
les algorithmes sont plus efficaces si on leur donne des indices structurels, pas seulement des valeurs instantanees.

Ce qu'il faut comprendre :

- le modele ne lit pas juste `rms`, `power`, `temp`
- il lit aussi des derivees, variabilites, energie de cycle, correlations
- ces variables rapprochent le modele de la logique physique reelle

Fichiers a ouvrir :

- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

Point tres important :
le backend runtime reproduit la meme logique de features que la phase offline.

### Etape 3 : anomaly scoring

Role :
evaluer l'ecart entre le comportement observe et le comportement sain.

Pourquoi on l'a fait :
avant de parler de RUL ou de decision, il faut deja savoir si le comportement courant est normal ou suspect.

Ce qu'il faut comprendre :

- l'Isolation Forest apprend d'abord la zone saine
- ensuite on construit un score hybride
- la vibration RMS garde un poids fort dans notre contexte de simulation actuel

Fichiers a ouvrir :

- [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py)
- [config.py](../prediteq_ml/config.py)

### Etape 4 : Health Index

Role :
convertir des signaux techniques difficiles a lire en un indicateur lisible entre `0` et `1`.

Pourquoi on l'a fait :
un jury mixte ou un responsable non technique comprend plus vite un indice de sante qu'une liste de scores techniques heterogenes.

Ce qu'il faut comprendre :

- le HI est la couche de traduction metier
- il sert d'interface entre les scores techniques et la lecture produit
- il permet ensuite les zones `excellent`, `bon`, `degrade`, `critique`

Fichier a ouvrir :

- [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)

### Etape 5 : prediction du RUL

Role :
estimer le temps restant avant l'etat critique.

Pourquoi on l'a fait :
PrediTeq ne doit pas seulement dire "ca se degrade", mais "quand faut-il agir ?"

Ce qu'il faut comprendre :

- le RUL n'est pas entraine directement sur un label cache purement simulateur
- la cible est derivee de `hi_smooth`
- il y a une logique de franchissement persistant
- les splits evientent la fuite de donnees

Fichiers a ouvrir :

- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [prediteq_engine.py](../prediteq_ml/models/prediteq_engine.py)

Questions jury typiques :

- "Le RUL vient-il d'une verite cachee du simulateur ?"
- "Comment evitez-vous la fuite de donnees ?"

Reponse fichier :

- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)

### Etape 6 : evaluation interne

Role :
mesurer la qualite du pipeline sur nos jeux de test et produire les graphes.

Pourquoi on l'a fait :
un pipeline credible doit etre mesure, pas seulement montre.

Fichiers a ouvrir :

- [step6_evaluate.py](../prediteq_ml/steps/step6_evaluate.py)
- [metrics.json](../prediteq_ml/outputs/metrics.json)
- [Dossier plots](../prediteq_ml/outputs/plots)

### Etape 6B : validation externe NASA CMAPSS

Role :
verifier l'architecture generale sur un benchmark externe connu.

Pourquoi on l'a fait :
pour sortir d'un cadre purement interne et montrer une certaine capacite de generalisation.

Fichiers a ouvrir :

- [step6b_cmapss.py](../prediteq_ml/steps/step6b_cmapss.py)
- [cmapss_metrics.json](../prediteq_ml/outputs/cmapss_metrics.json)

### Etape 6C : calibration et confiance

Role :
evaluer si les intervalles et niveaux de confiance restent raisonnables.

Pourquoi on l'a fait :
un systeme industriel doit savoir s'il est tres confiant ou non.

Fichiers a ouvrir :

- [step6c_calibration.py](../prediteq_ml/steps/step6c_calibration.py)
- [rul_cv_scores.json](../prediteq_ml/outputs/rul_cv_scores.json)
- [lead_time.json](../prediteq_ml/outputs/lead_time.json)

### Etape 7 : export des artefacts

Role :
transformer l'entrainement offline en artefacts utilisables par le backend.

Pourquoi on l'a fait :
le backend n'entraine pas ; il charge ce qui a ete exporte offline.

Fichiers a ouvrir :

- [step7_export.py](../prediteq_ml/steps/step7_export.py)
- [Dossier models](../prediteq_ml/models)
- [mqtt_schema.json](../prediteq_ml/outputs/mqtt_schema.json)

## 4. Ce qui se passe ensuite dans le backend

Le backend sert a :

1. charger les artefacts
2. recevoir la telemetrie live ou simulee
3. reconstruire les features runtime
4. calculer HI / stress / RUL / decision
5. exposer tout cela au frontend

Fichiers a ouvrir dans l'ordre :

1. [main.py](../prediteq_api/main.py)
2. [loader.py](../prediteq_api/ml/loader.py)
3. [engine_manager.py](../prediteq_api/ml/engine_manager.py)
4. [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
5. [simulator.py](../prediteq_api/routers/simulator.py)
6. [live_ingest.py](../prediteq_api/routers/live_ingest.py)
7. [seuils.py](../prediteq_api/routers/seuils.py)
8. [scheduler.py](../prediteq_api/scheduler.py)

Ce qu'il faut comprendre :

- `loader.py` charge les artefacts
- `engine_manager.py` est le coeur runtime
- `diagnostics_rul.py` expose la lecture predictive
- `simulator.py` alimente la demo
- `live_ingest.py` recoit la telemetrie live

### La vraie logique de la machine reelle

Il faut bien separer deux choses :

- les `3` machines demo du simulateur : `ASC-A1`, `ASC-B2`, `ASC-C3`
- la machine reelle cote produit : `ARO-01`

Ce qu'elles ont en commun :

- le meme moteur runtime dans [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- la meme lecture predictive dans [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
- les memes ecrans produit

Ce qui change :

- les `ASC-*` sont pilotees par [simulator.py](../prediteq_api/routers/simulator.py)
- `ARO-01` entre par [live_ingest.py](../prediteq_api/routers/live_ingest.py) ou [mqtt.py](../prediteq_api/routers/mqtt.py)
- `ARO-01` ne depend pas des overrides narratifs du simulateur

Pour la soutenance, on a ajoute un point intermediaire utile :

- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)

Ce script :

1. cree ou met a jour `ARO-01`
2. appelle `/ingest/bootstrap/labview-demo`
3. remplit une heure recente d'historique runtime
4. rend plus vite disponibles `HI`, `RUL`, `calendar`, `rapport IA` et `chatbot`

## 5. Ce qui se passe dans le frontend

Le frontend sert a traduire la lecture predictive en action utilisateur.

Pages principales a connaitre :

- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
- [CalendarPage.tsx](../prediteq_frontend/src/components/pages/CalendarPage.tsx)
- [MaintenancePage.tsx](../prediteq_frontend/src/components/pages/MaintenancePage.tsx)
- [CostsPage.tsx](../prediteq_frontend/src/components/pages/CostsPage.tsx)
- [AlertsPage.tsx](../prediteq_frontend/src/components/pages/AlertsPage.tsx)
- [RapportIAPage.tsx](../prediteq_frontend/src/components/pages/RapportIAPage.tsx)
- [ChatWidget.tsx](../prediteq_frontend/src/components/industrial/ChatWidget.tsx)
- [MachinesPage.tsx](../prediteq_frontend/src/components/pages/MachinesPage.tsx)
- [SimulatorPage.tsx](../prediteq_frontend/src/components/pages/SimulatorPage.tsx)
- [ExperimentPage.tsx](../prediteq_frontend/src/components/pages/ExperimentPage.tsx)

Ce qu'il faut comprendre :

- `Dashboard` montre la vue flotte
- `Diagnostics` justifie l'etat machine
- `Planner` transforme la lecture en action
- `Calendar` transforme la lecture en fenetre calendrier
- `Maintenance` organise l'execution
- `Costs` chiffre l'impact
- `Alerts` montre les priorites
- `Rapport IA` formalise l'analyse
- le `chatbot` interroge la meme machine en langage naturel

## 6. Si on te demande "prouvez-le dans le code"

### Pour prouver la simulation

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [plot1_hi_curves.png](../prediteq_ml/outputs/plots/plot1_hi_curves.png)

### Pour prouver les features

- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

### Pour prouver l'anomalie et le HI

- [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py)
- [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)

### Pour prouver le RUL

- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [rul_cv_scores.json](../prediteq_ml/outputs/rul_cv_scores.json)

### Pour prouver le runtime

- [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
- [simulator.py](../prediteq_api/routers/simulator.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)

### Pour prouver les 3 machines demo

- [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- [simulator.py](../prediteq_api/routers/simulator.py)

### Pour prouver le bridge LabVIEW / PC relais

- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md)
- [LABVIEW_CSV_BRIDGE_DEMO.md](../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md)
- [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py)
- [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [ARO-01_labview_demo_template.csv](../prediteq_api/scripts/sample_data/ARO-01_labview_demo_template.csv)

## 7. Les meilleurs ordres d'ouverture selon le type de question

### Si la question est tres technique

1. [config.py](../prediteq_ml/config.py)
2. [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
3. [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
4. [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py)
5. [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
6. [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
7. [engine_manager.py](../prediteq_api/ml/engine_manager.py)
8. [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)

### Si la question est mixte technique + produit

1. [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
2. [simulator.py](../prediteq_api/routers/simulator.py)
3. [engine_manager.py](../prediteq_api/ml/engine_manager.py)
4. [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
5. [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
6. [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)

### Si la question est tres non technique

1. [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
2. [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
3. [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
4. [MaintenancePage.tsx](../prediteq_frontend/src/components/pages/MaintenancePage.tsx)
5. [CostsPage.tsx](../prediteq_frontend/src/components/pages/CostsPage.tsx)

## 8. Commandes pour lancer l'app localement

### Backend

```bash
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

URLs backend :

- `http://127.0.0.1:8000`
- `http://127.0.0.1:8000/docs`

### Frontend

```bash
cd prediteq_frontend
npm install
npm run dev
```

URL frontend :

- `http://127.0.0.1:8080`

Important :
le frontend tourne sur `8080`.

## 9. Commandes pour rerun tout le pipeline ML

```bash
cd prediteq_ml
python steps/step1_simulate.py
python steps/step2_preprocess.py
python steps/step3_isolation_forest.py
python steps/step4_health_index.py
python steps/step5_rul_model.py
python steps/step6_evaluate.py
python steps/step6b_cmapss.py
python steps/step6c_calibration.py
python steps/step7_export.py
```

Phrase utile :
ce rerun complet sert a la preuve offline, mais n'est pas necessaire pour faire tourner l'application locale puisque le backend consomme deja les artefacts exportes.

## 10. Commandes pour le flux live LabVIEW / PC relais

### Terminal 1 : backend

```bash
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### Terminal 2 : frontend

```bash
cd prediteq_frontend
npm install
npm run dev
```

### Terminal 3 : generer le CSV de demo

```bash
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
```

### Terminal 4 : installer la machine reelle dans l'app et precharger son historique

```bash
cd prediteq_api
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
```

Pourquoi c'est important :

- sans cela, `ARO-01` existe peut-etre dans la base, mais le RUL attend encore le warmup runtime
- avec cela, la machine reelle peut deja etre lue dans `Machines`, `Dashboard`, `Diagnostics`, `Planner`, `Calendar`, `Rapport IA` et `chatbot`

### Terminal 5 : ecrire le CSV live

```bash
cd prediteq_api
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
```

### Terminal 6 : pousser ce CSV dans PrediTeq

```bash
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

Option demo plus rapide :

```bash
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 0.25
```

## 11. Ce qu'il faut toujours garder en tete

- le pipeline courant utilise `200` trajectoires
- le backend ne reentraine pas les modeles
- le simulateur backend est un outil de demo
- les seuils runtime peuvent differer des seuils offline
- pour un flux live brut, le RUL numerique ne sort pas immediatement ; il faut un historique suffisant
- pour la soutenance, [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py) remplit cet historique recent pour `ARO-01`
- la chaine LabVIEW / PC relais de soutenance utilise encore une source CSV de demonstration, mais la fin de chaine est deja la vraie chaine live PrediTeq

## 12. Fichiers utiles autour de cette preparation

- [Guide live jury](./02_GUIDE_LIVE_JURY.md)
- [Guide general initial](./GUIDE_PIPELINE_SIMULATION_ML_ET_DEMO_LOCAL.md)
- [jury_demo_cheat_sheet.md](./jury_demo_cheat_sheet.md)
- [README du dossier guides](./README.md)



