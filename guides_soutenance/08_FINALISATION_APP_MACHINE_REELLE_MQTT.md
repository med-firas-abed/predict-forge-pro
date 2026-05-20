# Finalisation app machine reelle MQTT

Ce document fixe la derniere tache de fin de projet, avec les fichiers exacts, la logique produit, la logique technique, et le chemin LabVIEW / CSV / MQTT / application.

Pour retrouver tres vite les vraies URLs publiques et le chemin exact du CSV LabVIEW, ouvre aussi :

- [13_URLS_EN_LIGNE_ET_CSV_LABVIEW.md](./13_URLS_EN_LIGNE_ET_CSV_LABVIEW.md)

## 1. Ce qui a ete finalise

La derniere tache importante du projet a ete :

1. faire exister `ARO-01` comme vraie machine cote application
2. ne plus la traiter comme une quatrieme machine du simulateur
3. la faire entrer dans l'app par le vrai chemin live
4. afficher sur cette machine les memes familles d'informations produit que pour les machines demo :
   - capteurs
   - HI
   - zone
   - RUL
   - diagnostic
   - planner
   - calendrier
   - rapport
   - chatbot

La logique finale est donc :

`LabVIEW / PLC -> PC relais cote client -> CSV ou acquisition directe -> bridge PrediTeq -> MQTT -> backend PrediTeq -> moteur runtime -> web app`

## 2. Ce que cela veut dire concretement

`ARO-01` n'est pas une machine du simulateur.

`ARO-01` est une machine live cote produit :

- elle apparait dans la flotte reelle cote backend
- elle utilise le moteur runtime charge par le backend
- elle recalcule ses indicateurs depuis la telemetrie live
- elle est visible dans les pages normales de l'application

Le simulateur reste reserve a :

- `ASC-A1`
- `ASC-B2`
- `ASC-C3`

Ces trois machines demo passent encore par [simulator.py](../prediteq_api/routers/simulator.py), avec des overrides de demonstration.

La machine `ARO-01`, elle, suit le vrai chemin runtime :

- [mqtt.py](../prediteq_api/routers/mqtt.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

## 3. Les fichiers qui portent cette finalisation

### Source LabVIEW-style coherente avec la simulation

- [labview_demo.py](../prediteq_api/core/labview_demo.py)  
  C'est la base commune des donnees LabVIEW-style de demonstration.  
  Ce fichier garde une coherence avec la simulation :
  - cycle machine
  - charge
  - puissance
  - courant
  - temperature
  - humidite
  - niveau de degradation

### Generation du CSV de demonstration

- [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py)  
  Ce script cree un CSV de demonstration coherent avec notre logique simulation / machine.

### Rejeu live du CSV

- [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py)  
  Ce script rejoue ligne par ligne le CSV comme s'il etait ecrit en continu par un poste terrain ou un poste relais.

### Bridge PC relais vers PrediTeq

- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)  
  Ce script joue le role du PC relais cote client :
  - il lit le dernier etat disponible
  - il normalise les noms de colonnes
  - il publie le message vers PrediTeq
  - il peut utiliser MQTT ou HTTP

### Creation et bootstrap de la machine reelle dans l'app

- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)  
  Ce script :
  1. cree ou met a jour `ARO-01`
  2. precharge une heure recente d'historique runtime
  3. evite une demo vide pendant le warmup
  4. rend HI, calendrier et RUL visibles plus vite

### Ingestion live HTTP

- [live_ingest.py](../prediteq_api/routers/live_ingest.py)  
  Ce routeur gere :
  - le contrat `/ingest/live`
  - le bootstrap live de demonstration
  - la tolerance locale de demo si le token HTTP n'est pas configure
  - l'acceptation de certaines sources relay / LabVIEW sans les traiter comme de faux outliers

### Ingestion live MQTT

- [mqtt.py](../prediteq_api/routers/mqtt.py)  
  Ce routeur :
  - s'abonne au topic `prediteq/+/sensors`
  - lit `machine_id`
  - charge la machine depuis la base si besoin
  - envoie ensuite la telemetrie au moteur runtime

### Moteur runtime commun

- [engine_manager.py](../prediteq_api/ml/engine_manager.py)  
  C'est le coeur runtime commun.  
  Il sert aux machines demo et a la machine reelle, mais `ARO-01` y arrive par le vrai chemin live.

## 4. Comment le CSV LabVIEW de demonstration fonctionne

Le CSV de demonstration n'est pas un CSV arbitraire.

Il respecte une logique machine defendable :

1. un cycle type `montee -> descente -> pause`
2. une charge qui fait varier la puissance
3. une puissance qui influence le courant
4. un contexte thermique et hygrometrique plausible
5. une degradation qui se repercute sur vibration et effort moteur

Les fichiers a montrer pour le prouver sont :

- [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
- [config.py](../prediteq_ml/config.py)
- [labview_demo.py](../prediteq_api/core/labview_demo.py)
- [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py)

La phrase la plus sure est :

> Pour la soutenance, nous remplacons seulement la source d'entree terrain par un CSV LabVIEW-style coherent avec notre simulation. La suite de la chaine, elle, est deja la vraie chaine live de PrediTeq.

## 5. Comment MQTT fonctionne dans notre cas

La logique simple est :

1. LabVIEW ou le PLC produit ou expose des mesures
2. un PC relais cote client lit ces mesures
3. ce PC construit un message simple PrediTeq
4. ce message est publie sur MQTT
5. le backend PrediTeq est abonne au topic
6. le backend met a jour la machine dans l'application

Le topic live utilise est :

`prediteq/{machine_id}/sensors`

Le fichier principal pour cette partie est :

- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)

La phrase la plus sure a dire est :

> Les capteurs ou LabVIEW n'envoient pas directement vers l'interface web. Ils passent d'abord par un PC relais cote client, puis ce PC publie les valeurs sur MQTT. PrediTeq ecoute ce topic et met a jour HI, RUL, diagnostics et les autres vues de l'application.

## 6. Pages de l'application concernees

Une fois `ARO-01` creee et alimentee, elle peut apparaitre dans :

- [MachinesPage.tsx](../prediteq_frontend/src/components/pages/MachinesPage.tsx)
- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
- [PlannerPage.tsx](../prediteq_frontend/src/components/pages/PlannerPage.tsx)
- [CalendarPage.tsx](../prediteq_frontend/src/components/pages/CalendarPage.tsx)
- [RapportIAPage.tsx](../prediteq_frontend/src/components/pages/RapportIAPage.tsx)
- [ChatWidget.tsx](../prediteq_frontend/src/components/industrial/ChatWidget.tsx)

Les pages frontend ne font pas un traitement special "demo" pour `ARO-01`.

Elles lisent les donnees que le backend fournit pour cette machine.

Nuance utile a retenir :

- la page rapport passe par la route [report.py](../prediteq_api/routers/report.py), en pratique via `POST /report/auto/generate`
- le chatbot passe par la route [chat.py](../prediteq_api/routers/chat.py), en pratique via `POST /chat`

## 7. Ce qui a ete reverifie localement

La finalisation a ete reverifiee localement sur l'environnement du projet :

- frontend local accessible sur `http://127.0.0.1:8080/`
- backend local accessible sur `http://127.0.0.1:8000/`
- `GET /health` retourne bien `ok`
- `ARO-01` est bien presente dans `/machines`
- `ARO-01` apparait aussi dans `/planner/status`
- la generation de rapport fonctionne via `/report/auto/generate`
- le chatbot a repondu sur `ARO-01` via `/chat`
- le flux MQTT a bien envoye des messages sur `prediteq/ARO-01/sensors`
- le backend a recree le moteur runtime `ARO-01` a partir de ce flux

Autrement dit :

- auth : verifie
- planner : verifie
- rapport : verifie
- chat : verifie
- machine reelle live : verifie

## 8. Commandes completes a relancer si besoin

### Backend

```bash
cd prediteq_api
uvicorn main:app --reload
```

### Frontend

```bash
cd prediteq_frontend
npm run dev
```

### Bootstrap de la machine reelle

```bash
cd prediteq_api
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
```

### Creation du CSV LabVIEW-style

```bash
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
```

### Rejeu live du CSV

```bash
cd prediteq_api
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
```

### Envoi via MQTT

```bash
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

## 9. Comment le raconter au jury

Version courte :

> La derniere tache du projet a ete de faire passer `ARO-01` par le vrai chemin live de l'application. Nous avons donc prepare un bootstrap runtime, un CSV LabVIEW-style coherent avec notre simulation, puis un bridge PC relais qui l'envoie en MQTT vers PrediTeq. Une fois ingeree, cette machine alimente les memes pages produit que les autres : dashboard, diagnostic, planner, calendrier, rapport et chatbot.

Version encore plus courte :

> Nous avons deja la vraie chaine live PrediTeq. Pour la soutenance, seule la source terrain finale est remplacee par un CSV LabVIEW-style rejoue en temps reel.

## 10. Fichiers a ouvrir tres vite si on te demande la preuve

Ordre recommande :

1. [labview_demo.py](../prediteq_api/core/labview_demo.py)
2. [generate_labview_demo_csv.py](../prediteq_api/scripts/generate_labview_demo_csv.py)
3. [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py)
4. [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
5. [live_ingest.py](../prediteq_api/routers/live_ingest.py)
6. [mqtt.py](../prediteq_api/routers/mqtt.py)
7. [engine_manager.py](../prediteq_api/ml/engine_manager.py)
8. [MachinesPage.tsx](../prediteq_frontend/src/components/pages/MachinesPage.tsx)
9. [DiagnosticsPage.tsx](../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
10. [ChatWidget.tsx](../prediteq_frontend/src/components/industrial/ChatWidget.tsx)
