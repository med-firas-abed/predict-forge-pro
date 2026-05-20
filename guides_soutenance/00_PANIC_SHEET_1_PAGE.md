# Panic Sheet 1 page

## Si je panique, je garde seulement cette logique

PrediTeq = `cas reel -> simulation realiste -> pipeline ML par phases -> validation -> backend runtime -> web app -> action de maintenance`

## Demarrage minimum

### Terminal 1

```bash
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### Terminal 2

```bash
cd prediteq_frontend
npm install
npm run dev
```

- frontend : `http://127.0.0.1:8080`
- backend docs : `http://127.0.0.1:8000/docs`

## Demo ultra-courte

1. ouvrir l'app
2. aller sur `Simulateur`
3. cliquer `Reinitialiser`
4. cliquer `Demarrer`
5. revenir sur `Dashboard`
6. montrer `Diagnostics`
7. montrer `Planner`
8. finir par `Calendar`, `Rapport IA` ou `Costs`

## Si le jury demande "ou est le code ?"

1. [config.py](../prediteq_ml/config.py)
2. [step1_simulate.py](../prediteq_ml/steps/step1_simulate.py)
3. [step2_preprocess.py](../prediteq_ml/steps/step2_preprocess.py)
4. [step5_rul_model.py](../prediteq_ml/steps/step5_rul_model.py)
5. [engine_manager.py](../prediteq_api/ml/engine_manager.py)
6. [diagnostics_rul.py](../prediteq_api/routers/diagnostics_rul.py)

## Si le jury demande le flux live externe

### Terminal 3

```bash
cd prediteq_api
python scripts/generate_labview_demo_csv.py --machine-id ARO-01 --scenario surveillance
```

### Terminal 4

```bash
cd prediteq_api
python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine reelle" --scenario surveillance
```

### Terminal 5

```bash
cd prediteq_api
python scripts/replay_labview_demo_csv.py --input scripts/sample_data/ARO-01_labview_demo_template.csv --output C:\labview\prediteq_log.csv --interval 1.0
```

### Terminal 6

```bash
cd prediteq_api
python scripts/mqtt_bridge_sender.py --transport mqtt --mode csv-last-row --machine-id ARO-01 --csv-path C:\labview\prediteq_log.csv
```

## Phrases sures

- Nous sommes partis d'une machine reelle, puis nous avons simule des trajectoires realistes pour construire un premier socle PHM avant validation terrain complete.
- Nous avons avance par phases : signal -> indicateurs -> anomalies -> Health Index -> RUL.
- Le pipeline transforme des signaux bruts en Health Index et en RUL exploitables.
- Le backend ne reentraine pas : il charge les artefacts exportes offline.
- La fin de chaine live est deja la vraie chaine PrediTeq ; la source CSV reste une source LabVIEW de demonstration.
- `ARO-01` n'est pas une quatrieme machine simulee ; c'est la machine reelle cote produit.

## Chiffres a retenir

- `200 trajectoires`
- cycle `44 s`
- frontend local `8080`
- backend local `8000`

## Liens reflexe

- [Guide live jury](./02_GUIDE_LIVE_JURY.md)
- [Guide detaille perso](./01_GUIDE_DETAILLE_PERSO.md)
- [jury_demo_cheat_sheet.md](./jury_demo_cheat_sheet.md)



