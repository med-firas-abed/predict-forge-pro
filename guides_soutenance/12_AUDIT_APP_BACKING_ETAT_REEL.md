# Audit app, backing et etat reel

Ce document repond a la question :

- quelles idees sont vraiment appuyees par le backend et verifiees localement ?

## 1. Regle utile

Quand quelqu'un demande :

> Est-ce que cette page est vraiment branchee a quelque chose ?

la bonne reponse est :

> Oui, et voici la route backend ou les fichiers qui l'alimentent.

## 2. Nouveau comportement dashboard

Le dashboard ouvre maintenant par defaut sur la machine saine et verte.

Regle actuelle :

1. si `ASC-A1` existe, elle est choisie par defaut
2. sinon, on prend la machine operationnelle la plus saine
3. sinon, on retombe sur le premier choix disponible

Fichiers :

- [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
- [dashboardSelection.ts](../prediteq_frontend/src/lib/dashboardSelection.ts)
- [dashboardSelection.test.ts](../prediteq_frontend/src/test/dashboardSelection.test.ts)

## 3. Ce qui a ete reverifie localement

### Frontend

Verifie :

- build frontend OK
- test unitaire du choix par defaut dashboard OK

Fichiers :

- [dashboardSelection.test.ts](../prediteq_frontend/src/test/dashboardSelection.test.ts)

### Backend

Verifie :

- login admin OK
- routes principales OK
- `ARO-01` visible dans la flotte
- `ARO-01` visible dans le planner
- diagnostics `ASC-A1` OK
- diagnostics `ARO-01` OK
- rapport OK
- chatbot OK
- alerts OK
- costs OK
- tasks OK

## 4. Pages et vrais backings

### Dashboard

Backed par :

- [machines.py](../prediteq_api/routers/machines.py)
- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
- [useMachines.ts](../prediteq_frontend/src/hooks/useMachines.ts)
- [useDiagnostics.ts](../prediteq_frontend/src/hooks/useDiagnostics.ts)
- [useMachineSensors.ts](../prediteq_frontend/src/hooks/useMachineSensors.ts)

Ce que cela veut dire :

- la machine choisie n'est pas juste un bloc statique de frontend
- le dashboard lit vraiment les machines, les diagnostics et les capteurs

### Diagnostics

Backed par :

- [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
- route principale : `/diagnostics/{machine_code}/all`

Verifie localement :

- `ASC-A1` : `mode=prediction`
- `ARO-01` : `mode=initializing` au moment de l'audit, ce qui est coherent avec une machine live en warmup / stabilisation

### Planner

Backed par :

- [planner.py](../prediteq_api/routers/planner.py)
- routes :
  - `/planner/status`
  - `/planner/generate`

Verifie localement :

- `planner_rows=4`
- `planner_has_ARO_01=True`

### Calendar / maintenance tasks

Backed par :

- [runtime_data.py](../prediteq_api/routers/runtime_data.py)
- route principale : `/runtime-data/tasks`

Ce que cela veut dire :

- les taches de maintenance ne reposent pas seulement sur du mock frontend

### Costs & Budget

Backed par :

- [runtime_data.py](../prediteq_api/routers/runtime_data.py)
- route principale : `/runtime-data/costs`

Verifie localement :

- retour `200`

### Alerts

Backed par :

- [alerts.py](../prediteq_api/routers/alerts.py)
- routes :
  - `/alerts`
  - `/alerts/email-history`

Verifie localement :

- alerts list OK
- email history OK

### Rapport IA

Backed par :

- [report.py](../prediteq_api/routers/report.py)
- route verifiee :
  - `/report/auto/generate`

Nuance importante :

- la page rapport est bien backend-backed
- elle passe en pratique par la generation automatique de rapport template-based

### Chatbot

Backed par :

- [chat.py](../prediteq_api/routers/chat.py)
- route verifiee :
  - `/chat`

Verifie localement :

- reponse non vide sur `ARO-01`

### Administration

Backed par :

- [admin.py](../prediteq_api/routers/admin.py)
- route verifiee :
  - `/admin/users`

### Seuils

Backed par :

- [seuils.py](../prediteq_api/routers/seuils.py)
- route verifiee :
  - `/seuils/public`

## 5. Machine reelle `ARO-01`

### Ce qui est vrai

`ARO-01` est vraiment branchee au backend runtime.

Fichiers :

- [setup_real_machine_demo.py](../prediteq_api/scripts/setup_real_machine_demo.py)
- [mqtt_bridge_sender.py](../prediteq_api/scripts/mqtt_bridge_sender.py)
- [mqtt.py](../prediteq_api/routers/mqtt.py)
- [live_ingest.py](../prediteq_api/routers/live_ingest.py)
- [engine_manager.py](../prediteq_api/ml/engine_manager.py)

### Ce qui est encore demo

- la source terrain finale est remplacee ici par un CSV LabVIEW-style rejoue

### Ce qui est deja vrai en revanche

- le bridge
- le transport MQTT
- le backend
- le moteur runtime
- l'application

## 6. Resultat d'audit a retenir

Version courte :

> Les grandes pages du produit sont bien backend-backed et ont ete reverifiees localement. Le dashboard ouvre maintenant sur la machine saine `ASC-A1`. La machine reelle `ARO-01` est visible dans la flotte et suit la vraie chaine runtime. La partie encore de demonstration est surtout la source terrain finale, pas la logique produit aval.

## 7. Fichiers a ouvrir si quelqu'un challenge le backing

Ordre rapide :

1. [DashboardPage.tsx](../prediteq_frontend/src/components/pages/DashboardPage.tsx)
2. [dashboardSelection.ts](../prediteq_frontend/src/lib/dashboardSelection.ts)
3. [useDiagnostics.ts](../prediteq_frontend/src/hooks/useDiagnostics.ts)
4. [runtimeDataRepository.ts](../prediteq_frontend/src/lib/runtimeDataRepository.ts)
5. [machines.py](../prediteq_api/routers/machines.py)
6. [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)
7. [planner.py](../prediteq_api/routers/planner.py)
8. [runtime_data.py](../prediteq_api/routers/runtime_data.py)
9. [report.py](../prediteq_api/routers/report.py)
10. [chat.py](../prediteq_api/routers/chat.py)
