# Checklist realise, partiel, futur

Ce document repond a deux questions :

1. est-ce que tes idees principales sont deja realisees et documentees ?
2. comment passer plus tard a de vraies donnees venant d'un autre PC cote client ?

## 1. Ce qui est realise maintenant

### Simulation et pipeline ML

Realise et documente :

- constantes et hypothese physiques : [config.py](../prediteq_ml/config.py)
- simulation du jeu d'entrainement : [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- features : [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
- anomalies : [step3_isolation_forest.py](../prediteq_ml/steps/step3_isolation_forest.py)
- Health Index : [step4_health_index.py](../prediteq_ml/steps/step4_health_index.py)
- RUL : [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)

### Demo produit avec 3 machines

Realise et documente :

- scenarios `ASC-A1`, `ASC-B2`, `ASC-C3` : [demo_scenarios.py](../prediteq_api/demo_scenarios.py)
- route simulateur : [simulator.py](../prediteq_api/routers/simulator.py)

### Machine reelle cote application

Realise et documente :

- machine `ARO-01`
- bootstrap runtime : [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- ingestion live : [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- ingestion MQTT : [mqtt.py](../prediteq_api/routers/mqtt.py)
- moteur runtime : [engine_manager.py](../prediteq_api/ml/engine_manager.py)

### Flux relay-PC / LabVIEW-style / MQTT

Realise et documente :

- generation du CSV LabVIEW-style : [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py)
- rejeu live du CSV : [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py)
- bridge PC relais : [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- source commune LabVIEW-style : [labview_demo.py](../prediteq_api/core/labview_demo.py)

### Application web

Realise et documente :

- flotte / machines : [MachinesPage.tsx](../prediteq_frontend/src/components/pages/MachinesPage.tsx)
- dashboard : [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- diagnostics : [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- planner : [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
- calendrier : [CalendarPage.tsx](../prediteq_frontend/src/components/pages/CalendarPage.tsx)
- rapport : [RapportIAPage.tsx](../prediteq_frontend/src/components/pages/RapportIAPage.tsx)
- chatbot : [ChatWidget.tsx](../prediteq_frontend/src/components/industrial/ChatWidget.tsx)

## 2. Ce qui est seulement partiel ou encore en mode demo

### Source terrain finale

Partiel :

- aujourd'hui, la source terrain finale est remplacee par un CSV LabVIEW-style de demonstration
- cela ne remet pas en cause la chaine runtime, mais la source physique finale n'est pas encore branchee

### Acquisition industrielle directe

Partiel :

- si le site fournit deja un `CSV` ou un `JSON`, le bridge est deja pret
- si le site expose plutot `OPC UA`, `Modbus`, `SQL` ou une API locale LabVIEW, il faut encore coder le lecteur exact dans [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py), dans `read_from_custom_source()`

### Historique terrain long et annote

Partiel :

- le projet sait deja ingerer et afficher du live
- mais un long historique terrain reel, annote et exploitable pour raffinement futur reste encore a construire

## 3. Future : vraies donnees depuis un autre PC

## Idee generale

Oui, c'est deja documente, et la logique prevue est claire :

`LabVIEW / PLC -> PC relais cote client -> MQTT ou HTTP -> backend PrediTeq -> web app`

Le "PC de l'autre cote" ne doit pas executer toute l'application.

Il joue seulement le role de **PC relais** :

1. il recoit ou lit les donnees terrain
2. il les transforme dans le format PrediTeq
3. il les envoie au backend PrediTeq

## Cas 1 : LabVIEW ecrit un CSV

C'est le cas le plus simple.

Le PC relais fait :

1. LabVIEW ajoute des lignes dans un CSV
2. [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py) lit la derniere ligne
3. le script publie sur MQTT
4. [mqtt.py](../prediteq_api/routers/mqtt.py) recoit la mesure
5. [engine_manager.py](../prediteq_api/ml/engine_manager.py) met a jour `HI`, zone, RUL et le reste
6. l'app affiche `ARO-01`

Commande typique cote PC relais :

```powershell
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

## Cas 2 : LabVIEW ecrit un JSON

Le bridge est deja prevu pour cela aussi.

Commande typique :

```powershell
python scripts/mqtt_bridge_sender.py --transport mqtt --mode json-file --machine-id ARO-01 --json-path C:\labview\prediteq_latest.json
```

## Cas 3 : pas de CSV ni JSON, mais une vraie interface locale

Si le site donne :

- OPC UA
- Modbus TCP
- base SQL locale
- API locale LabVIEW

alors on garde le meme backend, le meme MQTT, la meme application, et on change seulement la facon de lire la source.

Le point a adapter est :

- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)

Plus precisement :

- `read_from_custom_source()`

## 4. Ce qui est deja documente pour ce futur cas

### Dans le pack de soutenance

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](./08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)
- [03_runtime_iot/README.md](./03_runtime_iot/README.md)
- [03_runtime_iot/05_DEMO_RELAY_PC_CSV_VERS_APP.md](./03_runtime_iot/05_DEMO_RELAY_PC_CSV_VERS_APP.md)
- [02_GUIDE_LIVE_JURY.md](./02_GUIDE_LIVE_JURY.md)

### Dans les docs techniques du backend

- [RELAY_PC_SETUP_SIMPLE.md](../prediteq_api/RELAY_PC_SETUP_SIMPLE.md)
- [LABVIEW_PLC_INTEGRATION.md](../prediteq_api/LABVIEW_PLC_INTEGRATION.md)
- [LABVIEW_CSV_BRIDGE_DEMO.md](../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md)
- [LIVE_MQTT_BRIDGE.md](../prediteq_api/LIVE_MQTT_BRIDGE.md)

### Dans les kits et scripts de terrain

- [scripts/.env.bridge.example](../prediteq_api/scripts/.env.bridge.example)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [register_machine.py](../prediteq_api/scripts/register_machine.py)
- [TRANSFER_TO_PC2/README_FIRST.txt](../prediteq_api/TRANSFER_TO_PC2/README_FIRST.txt)
- [TRANSFER_TO_PC2/RUN_RELAY_PC_REAL_CSV.ps1](../prediteq_api/TRANSFER_TO_PC2/RUN_RELAY_PC_REAL_CSV.ps1)
- [PrediTeq_Bridge_Kit/START_HERE.txt](../prediteq_api/PrediTeq_Bridge_Kit/START_HERE.txt)
- [PrediTeq_Bridge_Kit/run_windows_real_csv.ps1](../prediteq_api/PrediTeq_Bridge_Kit/run_windows_real_csv.ps1)

## 5. Les fichiers backend qui font vraiment le travail

Voici les fichiers les plus importants si quelqu'un te demande :
"ok, mais quel code fera marcher les vraies donnees depuis un autre PC ?"

- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)  
  Lit la source locale et publie les messages.

- [mqtt.py](../prediteq_api/routers/mqtt.py)  
  Recoit les messages MQTT du PC relais.

- [live_ingest.py](../prediteq_api/routers/live_ingest.py)  
  Alternative HTTP si on ne veut pas de broker MQTT.

- [register_machine.py](../prediteq_api/scripts/register_machine.py)  
  Cree ou met a jour la machine dans la base.

- [engine_manager.py](../prediteq_api/ml/engine_manager.py)  
  Transforme la telemetrie live en indicateurs PrediTeq.

- [MachinesPage.tsx](../prediteq_frontend/src/components/pages/MachinesPage.tsx)  
  Affiche la machine dans la flotte.

- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)  
  Affiche HI, zone, RUL et diagnostic.

## 6. Ce qu'il faudra faire le jour de la vraie integration

### Cote backend PrediTeq

1. choisir le vrai code machine, par exemple `ARO-01`
2. creer la machine si besoin avec [register_machine.py](../prediteq_api/scripts/register_machine.py)
3. configurer le broker MQTT prive dans [prediteq_api/.env](../prediteq_api/.env)
4. relancer le backend

### Cote PC relais client

1. installer Python et les dependances bridge
2. copier la configuration de [scripts/.env.bridge.example](../prediteq_api/scripts/.env.bridge.example)
3. choisir `csv-last-row`, `json-file` ou `custom`
4. pointer vers le vrai fichier ou la vraie source locale
5. lancer [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)

### Cote application

Rien de special a re-developper si le payload respecte deja le contrat PrediTeq :

- `machine_id`
- `observed_at`
- `rms_mms`
- `power_kw`
- `temp_c`
- `humidity_rh`

Les champs utiles en plus sont :

- `current_a`
- `load_kg`
- `status`
- `source`

## 7. Reponse courte a dire au jury

> Oui, la suite vers un autre PC avec de vraies donnees est deja pensee et documentee. Le PC distant jouera simplement le role de PC relais cote client. Si LabVIEW ecrit un CSV ou un JSON, le bridge actuel peut deja le lire. Si le site expose plutot OPC UA, Modbus ou une API locale, on garde le meme backend et on adapte seulement le lecteur de source dans `mqtt_bridge_sender.py`.

## 8. Conclusion honnete

Donc la bonne reponse est :

- **oui**, c'est documente
- **oui**, une grande partie est deja codee
- **oui**, le chemin `autre PC -> MQTT -> backend -> app` existe deja
- **non**, l'adaptateur exact au materiel final n'est pas universellement pret sans connaitre la vraie forme de la source terrain

La partie la plus susceptible d'etre encore specifique au site est simplement :

- comment lire localement la vraie sortie LabVIEW / PLC sur le PC relais

Le reste de la chaine est deja structure.
