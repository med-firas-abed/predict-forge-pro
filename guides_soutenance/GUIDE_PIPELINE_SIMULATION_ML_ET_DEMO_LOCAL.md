# Guide simple : simulation, pipeline ML et demo locale

Ce fichier sert a trois choses :

1. expliquer la chaine `simulation -> ML -> backend -> frontend` dans un ordre simple
2. donner des liens cliquables vers les vrais fichiers du projet
3. donner les commandes a lancer si le jury demande une preuve live

Astuce :
ouvrez aussi [PrediTeq-Jury.code-workspace](../PrediTeq-Jury.code-workspace) dans VS Code pour une navigation plus propre.

Pour la derniere integration machine reelle / MQTT / application, ouvre aussi :

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)

## 1. Le projet en une phrase

PrediTeq simule d'abord des vies de machine realistes, entraine ensuite un pipeline ML pour detecter l'etat de sante et estimer le RUL, puis charge ces artefacts dans un backend FastAPI et les affiche dans une application web React.

## 1 bis. La methode a raconter au jury

La logique a retenir est :

1. partir d'une machine reelle meme si les donnees longues manquent
2. construire une simulation realiste pour ne pas bloquer le projet
3. avancer par phases : signal -> indicateurs -> anomalies -> HI -> RUL
4. valider chaque bloc avant le suivant
5. preparer en parallele la collecte live et l'historisation terrain

Nuance importante :

- NASA CMAPSS sert ici de validation externe methodologique, pas de dataset principal du stockeur.

## 2. Le point de depart a ouvrir en premier

- [Configuration centrale du projet ML](../prediteq_ml/config.py)
- [Explication longue et jury-friendly du pipeline](../prediteq_ml/PIPELINE_EXPLAINED.txt)
- [Carte rapide des etapes ML](../prediteq_ml/steps/README.md)
- [README ML](../prediteq_ml/README.md)
- [README Backend](../prediteq_api/README.md)
- [Carte des pages frontend](../prediteq_frontend/src/components/pages/README.md)

## 3. Pipeline simulation + ML dans l'ordre

### Etape 0 : les regles de base

Role simple :
on fixe les constantes physiques et les seuils du projet avant de lancer quoi que ce soit.

Ce que cela veut dire pour un non-technicien :
on ne part pas d'un moteur imaginaire. On part d'un vrai contexte machine : moteur, charge maximale, cycle de 44 secondes, bruit capteur, seuils HI, fenetre RUL.

Fichiers a ouvrir :

- [config.py](../prediteq_ml/config.py)
- [PIPELINE_EXPLAINED.txt](../prediteq_ml/PIPELINE_EXPLAINED.txt)

### Etape 1 : simulation des trajectoires machine

Role simple :
on cree des vies de machine credibles parce qu'on n'a pas encore des annees de pannes reelles annotees.

Ce que cela veut dire pour un non-technicien :
on reproduit des cycles de montee, descente et pause, avec des cas de charge, du courant, de la puissance, de la vibration, de la temperature et de l'humidite.

Fichiers a ouvrir :

- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [config.py](../prediteq_ml/config.py)

### Etape 2 : pretraitement et feature engineering

Role simple :
on transforme les mesures brutes en variables plus intelligentes pour le modele.

Ce que cela veut dire pour un non-technicien :
le modele ne lit pas seulement une vibration instantanee. Il lit aussi des tendances, des variations, des energies de cycle et des correlations.

Fichiers a ouvrir :

- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

### Etape 3 : detection d'anomalies

Role simple :
on compare le comportement courant a un comportement sain.

Ce que cela veut dire pour un non-technicien :
la machine est comparee a sa zone normale. Si elle s'eloigne trop, le pipeline remonte un score d'anomalie.

Fichiers a ouvrir :

- [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py)
- [config.py](../prediteq_ml/config.py)

### Etape 4 : construction du Health Index

Role simple :
on convertit les signaux techniques en un indice de sante lisible entre `0` et `1`.

Ce que cela veut dire pour un non-technicien :
au lieu de montrer seulement des nombres techniques, on montre un etat global plus simple a comprendre : excellent, bon, degrade, critique.

Fichiers a ouvrir :

- [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)

### Etape 5 : prediction du RUL

Role simple :
on estime le temps restant avant d'atteindre une zone vraiment critique.

Ce que cela veut dire pour un non-technicien :
PrediTeq n'essaie pas seulement de dire "la machine va mal". Il essaie de dire "combien de temps il reste avant qu'il faille agir".

Fichiers a ouvrir :

- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [prediteq_engine.py](../prediteq_ml/models/prediteq_engine.py)

### Etape 6 : evaluation interne

Role simple :
on mesure si le pipeline fonctionne bien sur nos donnees de projet.

Ce que cela veut dire pour un non-technicien :
on verifie que le systeme n'est pas juste "joli en demo", mais qu'il produit de bons resultats sur des jeux de test et des graphes de verification.

Fichiers a ouvrir :

- [step6_evaluate.py](../prediteq_ml/steps/step6_evaluate.py)
- [Dossier outputs](../prediteq_ml/outputs)
- [Plots verifies](../prediteq_ml/outputs/plots)

### Etape 6B : validation externe NASA CMAPSS

Role simple :
on teste l'architecture sur une base publique connue hors de notre simulation interne.

Ce que cela veut dire pour un non-technicien :
on montre que l'idee generale du pipeline ne depend pas uniquement de notre propre cas de demo.

Fichiers a ouvrir :

- [step6b_cmapss.py](../prediteq_ml/steps/step6b_cmapss.py)
- [cmapss_metrics.json](../prediteq_ml/outputs/cmapss_metrics.json)

### Etape 6C : calibration et confiance

Role simple :
on verifie si les intervalles de confiance racontent quelque chose de raisonnable.

Ce que cela veut dire pour un non-technicien :
un bon systeme ne doit pas seulement predire, il doit aussi savoir quand il est plus ou moins sur de lui.

Fichiers a ouvrir :

- [step6c_calibration.py](../prediteq_ml/steps/step6c_calibration.py)
- [rul_cv_scores.json](../prediteq_ml/outputs/rul_cv_scores.json)
- [lead_time.json](../prediteq_ml/outputs/lead_time.json)

### Etape 7 : export vers le runtime

Role simple :
on transforme le pipeline entraine en artefacts consommables par le backend.

Ce que cela veut dire pour un non-technicien :
une fois l'entrainement termine, le backend ne reentraine rien. Il charge simplement les fichiers exportes et les utilise en production ou en demo.

Fichiers a ouvrir :

- [step7_export.py](../prediteq_ml/steps/step7_export.py)
- [Dossier models](../prediteq_ml/models)
- [mqtt_schema.json](../prediteq_ml/outputs/mqtt_schema.json)

## 4. Ce qui se passe ensuite dans l'application

### Backend runtime

Role simple :
le backend recoit la telemetrie, applique le moteur PrediTeq, puis expose les resultats au frontend.

Fichiers a ouvrir :

- [main.py](../prediteq_api/main.py)
- [loader.py](../prediteq_api/ml/loader.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
- [simulator.py](../prediteq_api/routers/simulator.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- [scheduler.py](../prediteq_api/scheduler.py)

Nuance importante :

- `ASC-A1`, `ASC-B2`, `ASC-C3` servent la demo acceleree via le simulateur
- `ARO-01` est la machine reelle cote produit
- elle utilise le meme moteur runtime, mais pas les overrides narratifs du simulateur
- pour la soutenance, on lui precharge une heure recente d'historique via [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py) afin d'avoir HI, calendrier et RUL plus vite

### Frontend web

Role simple :
le frontend transforme les sorties techniques en vues utiles pour la decision.

Fichiers a ouvrir :

- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
- [CalendarPage.tsx](../prediteq_frontend/src/components/pages/CalendarPage.tsx)
- [MaintenancePage.tsx](../prediteq_frontend/src/components/pages/MaintenancePage.tsx)
- [CostsPage.tsx](../prediteq_frontend/src/components/pages/CostsPage.tsx)
- [AlertsPage.tsx](../prediteq_frontend/src/components/pages/AlertsPage.tsx)
- [RapportIAPage.tsx](../prediteq_frontend/src/components/pages/RapportIAPage.tsx)
- [ChatWidget.tsx](../prediteq_frontend/src/components/industrial/ChatWidget.tsx)
- [SimulatorPage.tsx](../prediteq_frontend/src/components/pages/SimulatorPage.tsx)
- [ExperimentPage.tsx](../prediteq_frontend/src/components/pages/ExperimentPage.tsx)

## 5. Les meilleurs fichiers a montrer en live si le jury demande "prouvez-le dans le code"

### Pour prouver la simulation

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)

### Pour prouver les features et le ML

- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py)
- [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)

### Pour prouver le runtime

- [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
- [simulator.py](../prediteq_api/routers/simulator.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)

### Pour prouver l'interface

- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
- [MachinesPage.tsx](../prediteq_frontend/src/components/pages/MachinesPage.tsx)

### Pour prouver la demo LabVIEW / PC relais

- [Guide demo bridge LabVIEW](../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md)
- [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py)
- [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [ARO-01_labview_demo_template.csv](../prediteq_api/scripts/sample_data/ARO-01_labview_demo_template.csv)

## 6. Commandes pour lancer l'application en local

### Backend

```bash
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend local :

- `http://127.0.0.1:8000`
- `http://127.0.0.1:8000/docs`

### Frontend

```bash
cd prediteq_frontend
npm install
npm run dev
```

Frontend local :

- `http://127.0.0.1:8080`

Important :
le frontend local tourne bien sur `8080`, pas sur `5173`.

## 7. Commandes pour relancer tout le pipeline ML offline

Ce bloc sert si quelqu'un demande :
"Montrez-moi l'ordre complet des scripts ML."

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

Remarque utile a dire a l'oral :
ce rerun complet n'est pas obligatoire pour faire tourner l'application, car le backend charge deja les artefacts exportes depuis [prediteq_ml/models](../prediteq_ml/models).

## 8. Commandes pour montrer le flux live "LabVIEW / PC relais"

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

### Terminal 3 : generer le CSV de demo une seule fois

```bash
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
```

### Terminal 4 : creer la machine reelle et precharger son historique

```bash
cd prediteq_api
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
```

Pourquoi cette etape existe :

- elle cree ou met a jour `ARO-01` dans PrediTeq
- elle charge une heure recente d'historique coherent avec la simulation
- elle permet d'avoir `HI`, `RUL`, `calendar`, `rapport IA` et `chatbot` plus vite

### Terminal 5 : ecrire le CSV live ligne par ligne

```bash
cd prediteq_api
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
```

### Terminal 6 : envoyer ce CSV vers PrediTeq

```bash
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

Option demo plus rapide :

```bash
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 0.25
```

Phrase sure a dire :
la fin de chaine est bien la vraie chaine live PrediTeq ; seule la source CSV est encore une source de demonstration au format LabVIEW.

Phrase complementaire :
`ARO-01` n'est pas une quatrieme machine simulee ; c'est la machine reelle cote produit, initialisee puis continuee sur le vrai chemin live.

## 9. Commandes et gestes pour la demo la plus simple

Si on ne veut pas lancer le bridge LabVIEW et qu'on veut juste montrer le produit vite :

1. lancer backend
2. lancer frontend
3. ouvrir l'application
4. aller sur [jury_demo_cheat_sheet.md](./jury_demo_cheat_sheet.md)
5. ouvrir la page [SimulatorPage.tsx](../prediteq_frontend/src/components/pages/SimulatorPage.tsx) dans l'app
6. cliquer `Reinitialiser`, puis `Demarrer`
7. revenir ensuite sur le dashboard, diagnostics, planner, maintenance, costs et alerts

## 10. Ordre conseille si le jury demande une preuve technique live

1. ouvrir [config.py](../prediteq_ml/config.py)
2. ouvrir [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
3. ouvrir [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
4. ouvrir [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
5. ouvrir [engine_manager.py](../prediteq_api/ml/engine_manager.py)
6. ouvrir [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
7. ouvrir [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
8. ouvrir [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
9. si besoin, ouvrir ensuite [LABVIEW_CSV_BRIDGE_DEMO.md](../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md)

## 11. Phrase finale tres simple pour les non-techniciens

PrediTeq suit toujours la meme logique :

1. simuler ou recevoir des signaux machine
2. transformer ces signaux en indicateurs intelligents
3. detecter l'etat de sante et le temps restant
4. afficher une decision claire dans l'application
5. permettre une demonstration locale ou une integration live type LabVIEW / PC relais cote client



