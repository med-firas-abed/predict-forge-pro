# Guide live jury

Ce guide est la version courte a garder ouverte pendant la soutenance.

But :

1. lancer l'application vite
2. savoir quoi montrer
3. savoir quel fichier ouvrir si le jury demande une preuve code
4. savoir quelles commandes lancer si on veut montrer le flux live

Si tu veux la note la plus claire sur la derniere tache finalisee du projet, ouvre aussi :

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)
- [10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md](./10_FAQ_JURY_ET_AROTEQ_SANS_BLOCAGE.md)
- [11_MATRICE_IDEES_COUVERTURE.md](./11_MATRICE_IDEES_COUVERTURE.md)

## 0. Fil methodologique a garder en tete

La phrase la plus sure est :

> Nous sommes partis d'une machine reelle avec peu de donnees longues, nous avons construit une simulation realiste, nous avons avance par phases du signal vers le RUL, nous avons valide chaque bloc, puis nous avons deja prepare la collecte terrain live.

Les 5 mots a garder :

- reel
- simulation defendable
- progression par phases
- validation bloc par bloc
- collecte terrain en parallele

## 1. Ce que je garde ouvert avant de commencer

- [PrediTeq-Jury.code-workspace](../PrediTeq-Jury.code-workspace)
- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
- [CalendarPage.tsx](../prediteq_frontend/src/components/pages/CalendarPage.tsx)
- [RapportIAPage.tsx](../prediteq_frontend/src/components/pages/RapportIAPage.tsx)
- [ChatWidget.tsx](../prediteq_frontend/src/components/industrial/ChatWidget.tsx)
- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- [jury_demo_cheat_sheet.md](./jury_demo_cheat_sheet.md)
- [07_OUVERTURES_ORALES_30S_1MIN_2MIN.md](./07_OUVERTURES_ORALES_30S_1MIN_2MIN.md)

## 2. Demarrage local minimum

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

Ouvrir :

- frontend : `http://127.0.0.1:8080`
- backend docs : `http://127.0.0.1:8000/docs`

## 3. Demo la plus simple si je veux aller vite

1. ouvrir l'application
2. constater que le dashboard se cale par defaut sur `ASC-A1`, la machine saine
3. aller sur le simulateur
4. cliquer `Pause` si besoin
5. cliquer `Reinitialiser`
6. cliquer `Demarrer`
7. revenir ensuite sur dashboard
8. montrer diagnostics
9. montrer planner
10. montrer maintenance ou costs selon le temps

Fichiers de reference :

- [SimulatorPage.tsx](../prediteq_frontend/src/components/pages/SimulatorPage.tsx)
- [jury_demo_cheat_sheet.md](./jury_demo_cheat_sheet.md)

## 4. Ordre de demo recommande

### Partie 1 : montrer la valeur produit

Ouvrir dans l'application :

1. Dashboard
2. Diagnostics
3. Planner
4. Calendar
5. Analyse & Rapport IA
6. Maintenance
7. Costs
8. Alerts

Fichiers si besoin :

- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
- [CalendarPage.tsx](../prediteq_frontend/src/components/pages/CalendarPage.tsx)
- [RapportIAPage.tsx](../prediteq_frontend/src/components/pages/RapportIAPage.tsx)
- [MaintenancePage.tsx](../prediteq_frontend/src/components/pages/MaintenancePage.tsx)
- [CostsPage.tsx](../prediteq_frontend/src/components/pages/CostsPage.tsx)
- [AlertsPage.tsx](../prediteq_frontend/src/components/pages/AlertsPage.tsx)

### Partie 2 : si le jury demande "ou est le code ?"

Ordre le plus court :

1. [config.py](../prediteq_ml/config.py)
2. [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
3. [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
4. [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
5. [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
6. [engine_manager.py](../prediteq_api/ml/engine_manager.py)
7. [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)

## 5. Si le jury pose une question precise

### "Ou est la simulation ?"

Ouvrir :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)

### "Ou est le jeu d'entrainement simule ?"

Ouvrir :

- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)

Dire vite :

> Une trajectoire est l'histoire complete d'une machine simulee dans le temps. Le jeu d'entrainement contient 200 trajectoires, 4 profils et 20 cas de charge.

### "Avez-vous suivi une vraie methode ou juste empile des modeles ?"

Ouvrir :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)

Dire vite :

> Nous avons suivi une progression simple : partir du reel, construire une simulation defendable, traiter les signaux, detecter l'anormalite, estimer ensuite le RUL, valider chaque bloc, puis preparer deja la collecte live.

### "Pourquoi avez-vous choisi ces variables ?"

Ouvrir :

- [config.py](../prediteq_ml/config.py)
- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)

Dire vite :

> Nous avons choisi des variables qui changent vraiment quand la machine travaille plus fort ou se degrade : charge, puissance, courant, vibration, temperature et humidite.

### "Ou sont les 3 machines demo ?"

Ouvrir :

- [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- [simulator.py](../prediteq_api/routers/simulator.py)

Dire vite :

> ASC-A1, ASC-B2 et ASC-C3 representent trois contextes d'usage differents. Le simulateur change les charges, le stress, l'usure et le point de depart.

### "Ou sont les features ML ?"

Ouvrir :

- [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

### "Ou est le RUL ?"

Ouvrir :

- [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)

### "Ou sont les modeles dans l'app ?"

Ouvrir :

- [loader.py](../prediteq_api/ml/loader.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- [Dossier models](../prediteq_ml/models)

### "Ou est l'interface ?"

Ouvrir :

- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)

### "Ou est le flux live externe ?"

Ouvrir :

- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md)
- [LABVIEW_CSV_BRIDGE_DEMO.md](../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md)
- [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py)
- [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)

Dire vite :

> En pratique, LabVIEW ou le PLC alimente un PC relais cote client. Ce PC relit les nouvelles mesures, les normalise, puis les publie sur le topic MQTT `prediteq/{machine_id}/sensors`. Le backend PrediTeq est abonne a ce topic et met ensuite a jour HI, RUL, diagnostics, planner et calendrier.

## 6. Commandes si je veux montrer le flux LabVIEW / PC relais

### Terminal 3 : generer le CSV de demo

```bash
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
```

### Terminal 4 : preparer la machine reelle dans l'app

```bash
cd prediteq_api
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
```

Dire vite :

> Cette etape cree `ARO-01` puis precharge une heure recente d'historique runtime, pour que la machine reelle ait deja HI, contexte calendrier et souvent un RUL exploitable avant meme que le flux CSV live continue.

### Terminal 5 : ecrire le CSV live

```bash
cd prediteq_api
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
```

### Terminal 6 : envoyer le CSV vers PrediTeq

```bash
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

Dire vite :

> Ici, le script joue le role du PC relais. Il lit la derniere ligne du CSV LabVIEW, la transforme dans le format PrediTeq, puis l'envoie sur MQTT. Le backend recoit ces messages en temps reel et la machine `ARO-01` est alors mise a jour comme une vraie machine live.

Option rapide :

```bash
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 0.25
```

## 7. Phrases sures a dire

### Pour la simulation

> Nous avons simule des trajectoires realistes pour construire un premier socle PHM avant validation terrain complete, puis nous avons prepare en parallele la collecte live qui servira a raffiner le systeme.

### Pour le jeu d'entrainement

> Une trajectoire est l'histoire complete d'une machine simulee. Notre jeu d'entrainement contient 200 trajectoires, 4 profils et 20 cas de charge.

### Pour le choix des variables

> Nous avons choisi des variables qui suivent une logique cause-effet : charge, puissance, courant, echauffement, usure, puis vibration et Health Index.

### Pour les 3 machines demo

> Les trois machines demo ne sont pas aleatoires. Elles representent trois contextes d'usage differents avec trois regimes d'etat de sante.

### Pour le ML

> Le pipeline ne lit pas seulement des mesures brutes ; il construit des features, un Health Index lisible, puis un RUL exploitable.

### Pour le runtime

> Le backend ne reentraine pas les modeles ; il charge les artefacts exportes et les applique a la telemetrie runtime.

### Pour le bridge live

> La fin de chaine est deja la vraie chaine live PrediTeq ; seule la source CSV de demonstration remplace encore la source LabVIEW / PLC finale sur le PC relais cote client.

### Pour la machine reelle

> `ARO-01` utilise le meme moteur runtime que les trois machines demo, mais elle ne passe pas par les overrides du simulateur. Elle suit le vrai chemin produit live.

## 8. Deux choses a ne pas dire

- ne pas dire que tout l'affichage vient du raw ML
- ne pas dire que le simulateur backend est une copie neutre et pure du modele final

## 9. Rappels chiffres utiles

- pipeline courant : `200 trajectoires`
- machines demo principales : `ASC-A1`, `ASC-B2`, `ASC-C3`
- frontend local : `http://127.0.0.1:8080`
- backend local : `http://127.0.0.1:8000`
- pipeline ML offline : `step1 -> step2 -> step3 -> step4 -> step5 -> step6 -> step6b -> step6c -> step7`

## 10. Si j'ai 30 secondes pour repondre "ou est chaque chose ?"

- simulation : [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- jeu d'entrainement simule : [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- 3 machines demo : [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- features : [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- anomalies : [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py)
- HI : [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
- RUL : [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
- moteur runtime : [engine_manager.py](../prediteq_api/ml/engine_manager.py)
- API de lecture predictive : [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
- demo simulator : [simulator.py](../prediteq_api/routers/simulator.py)
- integration machine reelle : [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- bootstrap machine reelle : [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- web app : [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- guide detaille perso : [01_GUIDE_DETAILLE_PERSO.md](./01_GUIDE_DETAILLE_PERSO.md)



