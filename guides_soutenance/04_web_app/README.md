# Atlas Soutenance: Web App

Ce dossier organise la partie interface sans toucher au vrai code frontend.

Pour la note finale qui relie `ARO-01`, MQTT et les ecrans de l'app, ouvre aussi :

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](../08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)

## A quoi sert cette partie

Ici, tu peux montrer:

- ou chaque ecran principal se trouve
- quel message il porte pour le jury
- quels fichiers ouvrir si on te demande "ou est code ce bouton ou cet ecran"

## Ordre simple a ouvrir

1. [DashboardPage.tsx](../../prediteq_frontend/src/components/pages/DashboardPage.tsx)
2. [DiagnosticsPage.tsx](../../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)
3. [PlannerPage.tsx](../../prediteq_frontend/src/components/pages/PlannerPage.tsx)
4. [CalendarPage.tsx](../../prediteq_frontend/src/components/pages/CalendarPage.tsx)
5. [RapportIAPage.tsx](../../prediteq_frontend/src/components/pages/RapportIAPage.tsx)
6. [MaintenancePage.tsx](../../prediteq_frontend/src/components/pages/MaintenancePage.tsx)
7. [CostsPage.tsx](../../prediteq_frontend/src/components/pages/CostsPage.tsx)
8. [AlertsPage.tsx](../../prediteq_frontend/src/components/pages/AlertsPage.tsx)
9. [MachinesPage.tsx](../../prediteq_frontend/src/components/pages/MachinesPage.tsx)
10. [SimulatorPage.tsx](../../prediteq_frontend/src/components/pages/SimulatorPage.tsx)
11. [SeuilsPage.tsx](../../prediteq_frontend/src/components/pages/SeuilsPage.tsx)
12. [ChatWidget.tsx](../../prediteq_frontend/src/components/industrial/ChatWidget.tsx)
13. [README.md](../../prediteq_frontend/src/components/pages/README.md)

## Ce que chaque ecran raconte

- [DashboardPage.tsx](../../prediteq_frontend/src/components/pages/DashboardPage.tsx)  
  Vue d'ensemble flotte et etat courant des machines.

- [DiagnosticsPage.tsx](../../prediteq_frontend/src/components/pages/DiagnosticsPage.tsx)  
  C'est l'ecran central pour expliquer HI, zone, interpretation et RUL.

- [PlannerPage.tsx](../../prediteq_frontend/src/components/pages/PlannerPage.tsx)  
  Il montre qu'on ne s'arrete pas au diagnostic: on va vers la decision.

- [CalendarPage.tsx](../../prediteq_frontend/src/components/pages/CalendarPage.tsx)  
  Il transforme la lecture predictive en fenetre calendrier concrete.

- [RapportIAPage.tsx](../../prediteq_frontend/src/components/pages/RapportIAPage.tsx)  
  Il formalise la lecture machine en rapport IA exploitable.

- [MaintenancePage.tsx](../../prediteq_frontend/src/components/pages/MaintenancePage.tsx)  
  Il montre la traduction en maintenance planifiee.

- [CostsPage.tsx](../../prediteq_frontend/src/components/pages/CostsPage.tsx)  
  Il montre l'impact economique.

- [AlertsPage.tsx](../../prediteq_frontend/src/components/pages/AlertsPage.tsx)  
  Il montre la reaction et la surveillance.

- [SimulatorPage.tsx](../../prediteq_frontend/src/components/pages/SimulatorPage.tsx)  
  Il pilote la demonstration acceleree.

- [MachinesPage.tsx](../../prediteq_frontend/src/components/pages/MachinesPage.tsx)  
  Il montre l'inventaire et la navigation par machine.

- [ChatWidget.tsx](../../prediteq_frontend/src/components/industrial/ChatWidget.tsx)  
  Il permet d'interroger la meme machine en langage naturel.

- [SeuilsPage.tsx](../../prediteq_frontend/src/components/pages/SeuilsPage.tsx)  
  Il montre que les seuils et alertes sont pilotables.

## Ce qu'il faut comprendre pour la machine reelle

Une fois `ARO-01` creee puis bootstrappee via [setup_real_machine_demo.py](../../prediteq_api/scripts/setup_real_machine_demo.py), cette meme machine peut etre lue dans :

- `Machines`
- `Dashboard`
- `Diagnostics`
- `Planner`
- `Calendar`
- `Rapport IA`
- `chatbot`

Autrement dit :

- les trois machines `ASC-*` servent surtout la demonstration acceleree
- `ARO-01` suit le vrai chemin produit live

## Si on te demande "ou est le code du bouton ou de l'ecran"

Le plus simple est:

1. ouvrir [README.md](../../prediteq_frontend/src/components/pages/README.md)
2. ouvrir la page concernee dans `src/components/pages/`
3. si besoin, remonter ensuite vers les routes backend de [prediteq_api/routers](../../prediteq_api/routers)

## Commandes utiles

### Lancer le frontend local

```powershell
cd prediteq_frontend
npm install
npm run dev
```

Frontend local:

- `http://127.0.0.1:8080`

## Phrase simple a dire

L'application ne montre pas seulement des courbes. Elle va du constat a l'action: visualiser, diagnostiquer, planifier, budgetiser et alerter.

## Aller ensuite vers

- [../03_runtime_iot/README.md](../03_runtime_iot/README.md)
- [../02_GUIDE_LIVE_JURY.md](../02_GUIDE_LIVE_JURY.md)
- [../jury_demo_cheat_sheet.md](../jury_demo_cheat_sheet.md)
