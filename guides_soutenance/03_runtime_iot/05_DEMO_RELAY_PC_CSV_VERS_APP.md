# Demo relay PC CSV vers app

Ce guide est la version canonique pour montrer la machine reelle `ARO-01` dans l'application.

## URLs publiques et CSV a garder sous la main

- frontend public prefere : `https://prediteq.aro-teq.com/`
- frontend secours : `https://prediteq-saas.vercel.app/`
- backend public : `https://prediteq-saas.onrender.com/`
- CSV LabVIEW canonique : [ARO-01_labview_demo_template.csv](../../prediteq_api/scripts/sample_data/ARO-01_labview_demo_template.csv)
- CSV live local pendant le rejeu : `C:\labview\prediteq_log.csv`

Si tu veux le raccourci complet avec ces chemins et les fichiers de deploiement, ouvre aussi :

- [13_URLS_EN_LIGNE_ET_CSV_LABVIEW.md](../13_URLS_EN_LIGNE_ET_CSV_LABVIEW.md)

## Idee simple

La machine reelle ne passe pas par le simulateur de demo.

Elle suit cette chaine :

`LabVIEW / PLC -> PC relais cote client -> CSV -> mqtt_bridge_sender.py -> MQTT ou HTTP -> /ingest/live -> moteur runtime PrediTeq -> web app`

## Point essentiel a retenir

`ARO-01` n'est pas une quatrieme machine simulee.

Ce qu'elle partage avec `ASC-A1`, `ASC-B2` et `ASC-C3` :

- le meme moteur runtime dans [engine_manager.py](../../prediteq_api/ml/engine_manager.py)
- la meme logique HI / diagnostics / stress / RUL dans [diagnostics_rul.py](../../prediteq_api/routers/diagnostics_rul.py)
- les memes ecrans web : dashboard, diagnostics, planner, calendar, rapport IA, chatbot

Ce qu'elle ne partage pas :

- elle ne depend pas de [demo_scenarios.py](../../prediteq_api/demo_scenarios.py)
- elle ne depend pas des overrides de [simulator.py](../../prediteq_api/routers/simulator.py)
- elle suit le vrai chemin `live_ingest` / `mqtt` du produit

## Pourquoi ajouter un bootstrap avant le CSV live

Sans bootstrap, le backend publie vite les capteurs, le HI et le diagnostic, mais le RUL numerique attend encore environ `60 minutes` d'historique HI.

Pour une demo fluide, on initialise donc `ARO-01` avec une heure recente de telemetrie LabVIEW-style coherent avec notre simulation.

Le code qui fait cela est maintenant ici :

- [live_ingest.py](../../prediteq_api/routers/live_ingest.py)
- [setup_real_machine_demo.py](../../prediteq_api/scripts/setup_real_machine_demo.py)
- [generate_labview_demo_csv.py](../../prediteq_api/scripts/generate_labview_demo_csv.py)
- [labview_demo.py](../../prediteq_api/core/labview_demo.py)

## Ordre recommande

### Terminal 1 : backend

```powershell
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### Terminal 2 : frontend

```powershell
cd prediteq_frontend
npm install
npm run dev
```

### Terminal 3 : creer la machine reelle et precharger son historique

```powershell
cd prediteq_api
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
```

Ce script fait deux choses :

1. il cree ou met a jour `ARO-01` dans la table `machines`
2. il appelle `/ingest/bootstrap/labview-demo` pour remplir d'un coup l'historique recent du moteur runtime

Resultat attendu :

- `HI` disponible
- `zone` disponible
- `cycles_per_day` et `power_avg_30j` poses pour la calibration calendrier
- `RUL` live disponible si les conditions sont reunies

### Terminal 4 : generer le CSV de demonstration

```powershell
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
```

### Terminal 5 : rejouer le CSV ligne par ligne

```powershell
cd prediteq_api
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
```

Option demo plus rapide :

```powershell
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 0.25
```

### Terminal 6 : envoyer le CSV live vers PrediTeq

```powershell
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

## Ce qu'il faut ouvrir ensuite dans l'app

Dans cet ordre :

1. [MachinesPage.tsx](../../prediteq_frontend/src/components/pages/MachinesPage.tsx)
2. [DashboardPage.tsx](../../prediteq_frontend/src/components/pages/DashboardPage.tsx)
3. [DiagnosticsPage.tsx](../../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
4. [PlannerPage.tsx](../../prediteq_frontend/src/components/pages/PlannerPage.tsx)
5. [CalendarPage.tsx](../../prediteq_frontend/src/components/pages/CalendarPage.tsx)
6. [RapportIAPage.tsx](../../prediteq_frontend/src/components/pages/RapportIAPage.tsx)
7. [ChatWidget.tsx](../../prediteq_frontend/src/components/industrial/ChatWidget.tsx)

Phrase sure a dire :

> Ici, `ARO-01` n'est plus un replay de simulateur. C'est la machine reelle cote produit : meme moteur runtime, memes ecrans, mais alimentee par le bridge live CSV/MQTT/HTTP.

## Ce que cela prouve

- la machine reelle utilise la meme logique produit que les machines demo
- les ecrans `Dashboard`, `Diagnostics`, `Planner`, `Calendar`, `Rapport IA` et `chatbot` lisent la meme machine
- le bootstrap supprime l'attente de warmup pendant la soutenance
- la seule partie encore de demonstration est la source CSV LabVIEW-style, pas le reste de la chaine

## Fichiers de preuve a ouvrir si on te challenge

- [live_ingest.py](../../prediteq_api/routers/live_ingest.py)
- [engine_manager.py](../../prediteq_api/ml/engine_manager.py)
- [diagnostics_rul.py](../../prediteq_api/routers/diagnostics_rul.py)
- [mqtt.py](../../prediteq_api/routers/mqtt.py)
- [mqtt_bridge_sender.py](../../prediteq_api/scripts/mqtt_bridge_sender.py)
- [setup_real_machine_demo.py](../../prediteq_api/scripts/setup_real_machine_demo.py)
- [generate_labview_demo_csv.py](../../prediteq_api/scripts/generate_labview_demo_csv.py)
- [labview_demo.py](../../prediteq_api/core/labview_demo.py)
