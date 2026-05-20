# Atlas Soutenance: Runtime et IoT

Ce dossier organise tout ce qui relie les modeles exportes a l'application live.

Pour la note de cloture la plus complete sur la machine reelle `ARO-01`, ouvre aussi :

- [08_FINALISATION_APP_MACHINE_REELLE_MQTT.md](../08_FINALISATION_APP_MACHINE_REELLE_MQTT.md)

## A quoi sert cette partie

Ici, tu expliques comment on passe:

- des artefacts ML deja entraines
- a un backend qui les charge
- a des donnees de demo ou de terrain
- puis a des resultats visibles dans le web app

## Ordre simple a ouvrir

1. [engine_manager.py](../../prediteq_api/ml/engine_manager.py)
2. [demo_scenarios.py](../../prediteq_api/demo_scenarios.py)
3. [simulator.py](../../prediteq_api/routers/simulator.py)
4. [live_ingest.py](../../prediteq_api/routers/live_ingest.py)
5. [mqtt.py](../../prediteq_api/routers/mqtt.py)
6. [mqtt_bridge_sender.py](../../prediteq_api/scripts/mqtt_bridge_sender.py)
7. [generate_labview_demo_csv.py](../../prediteq_api/scripts/generate_labview_demo_csv.py)
8. [setup_real_machine_demo.py](../../prediteq_api/scripts/setup_real_machine_demo.py)
9. [replay_labview_demo_csv.py](../../prediteq_api/scripts/replay_labview_demo_csv.py)
10. [LABVIEW_CSV_BRIDGE_DEMO.md](../../prediteq_api/LABVIEW_CSV_BRIDGE_DEMO.md)
11. [LABVIEW_PLC_INTEGRATION.md](../../prediteq_api/LABVIEW_PLC_INTEGRATION.md)
12. [05_DEMO_RELAY_PC_CSV_VERS_APP.md](./05_DEMO_RELAY_PC_CSV_VERS_APP.md)

## Version tres simple a dire

Le backend ne re-entraine pas le modele. Il charge les modeles deja exportes, recoit les mesures en direct, calcule les indicateurs utiles, puis renvoie au frontend l'etat de sante, la zone et le RUL quand assez d'historique existe.

## Ce que chaque fichier prouve

- [engine_manager.py](../../prediteq_api/ml/engine_manager.py)  
  C'est la passerelle entre les capteurs live et le moteur PrediTeq. Il transforme les mesures live en indicateurs attendus par l'inference.

- [demo_scenarios.py](../../prediteq_api/demo_scenarios.py)  
  Il definit les `3` machines de demo pour la soutenance.

- [simulator.py](../../prediteq_api/routers/simulator.py)  
  Il rejoue une demonstration acceleree. Important: ce mode sert la narration de soutenance et peut ajuster l'affichage de `hi_smooth`, `zone` et RUL.

- [live_ingest.py](../../prediteq_api/routers/live_ingest.py)  
  C'est l'entree HTTP `/ingest/live` pour des mesures venant d'un bridge.

- [mqtt.py](../../prediteq_api/routers/mqtt.py)  
  C'est l'autre chemin live quand on passe par broker MQTT.

- [mqtt_bridge_sender.py](../../prediteq_api/scripts/mqtt_bridge_sender.py)  
  C'est le pont entre une source externe et PrediTeq.

- [generate_labview_demo_csv.py](../../prediteq_api/scripts/generate_labview_demo_csv.py)  
  Il cree un CSV de demo coherent avec la simulation.

- [setup_real_machine_demo.py](../../prediteq_api/scripts/setup_real_machine_demo.py)  
  Il cree ou met a jour `ARO-01`, puis precharge une heure recente d'historique pour que HI, RUL et la lecture calendrier soient deja disponibles dans l'app.

- [replay_labview_demo_csv.py](../../prediteq_api/scripts/replay_labview_demo_csv.py)  
  Il rejoue ce CSV comme s'il etait produit en continu par un poste relais / LabVIEW.

## Real machine / PLC integration

Le chemin reel vise est:

`PLC / LabVIEW -> PC relais cote client -> MQTT ou HTTP -> backend PrediTeq -> web app`

Pour la machine reelle `ARO-01`, il faut maintenant retenir une nuance importante :

- elle utilise le meme moteur runtime que les trois machines demo
- mais elle ne passe pas par les overrides narratifs du simulateur
- on la lisse d'abord via un bootstrap recent, puis on la laisse continuer en flux live normal

Les fichiers de reference sont:

- [LABVIEW_PLC_INTEGRATION.md](../../prediteq_api/LABVIEW_PLC_INTEGRATION.md)
- [live_ingest.py](../../prediteq_api/routers/live_ingest.py)
- [mqtt_bridge_sender.py](../../prediteq_api/scripts/mqtt_bridge_sender.py)

Pour la soutenance, utilise aussi ce guide operationnel:

- [05_DEMO_RELAY_PC_CSV_VERS_APP.md](./05_DEMO_RELAY_PC_CSV_VERS_APP.md)

## Champs minimums attendus par le backend

Le backend live attend au minimum:

- `machine_id`
- `observed_at` ou `timestamp`
- `rms_mms`
- `power_kw`
- `temp_c`
- `humidity_rh`

Champs utiles en plus:

- `current_a`
- `load_kg`
- `status`
- `source`

## Commandes utiles

### Lancer le backend local

```powershell
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### Lancer la demo LabVIEW / PC relais

```powershell
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

### Si la machine n'existe pas encore

```powershell
cd prediteq_api
python scripts/register_machine.py ARO-01 --name "Machine reelle" --region "Ben Arous"
```

## A dire au jury

- aujourd'hui nous savons deja faire une demonstration credible du flux LabVIEW / PC relais
- demain la source CSV pourra etre remplacee par la vraie sortie PLC / LabVIEW sans changer tout le backend
- le coeur de l'inference reste le meme
- le bootstrap `ARO-01` sert seulement a eviter l'attente de warmup pendant la demo; ensuite la machine continue sur le vrai chemin live

## Aller ensuite vers

- [../01_simulation/README.md](../01_simulation/README.md)
- [../02_ml_pipeline/README.md](../02_ml_pipeline/README.md)
- [../04_web_app/README.md](../04_web_app/README.md)
- [../02_GUIDE_LIVE_JURY.md](../02_GUIDE_LIVE_JURY.md)
