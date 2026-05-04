# PrediTeq - Plateforme SaaS de Maintenance Predictive

> PFE - Mohamed Firas Abed | ISAMM | Aroteq, Ben Arous

PrediTeq est une application de maintenance predictive pour ascenseurs industriels SITI FC100L1-4.  
Le projet combine :

- un pipeline ML offline dans `prediteq_ml/`
- une API FastAPI runtime dans `prediteq_api/`
- une interface React dans `prediteq_frontend/`
- une base Supabase pour les donnees metier, l'authentification et le realtime

## Architecture

```text
prediteq_ml/        Pipeline ML offline, artefacts, exports et evaluation
prediteq_api/       API FastAPI, scheduler, MQTT, moteur runtime, simulateur
prediteq_frontend/  Interface React + TypeScript + Vite
```

## Source de verite

Pour les chiffres valides du pipeline et les resultats soutenance, la reference a utiliser est :

- `INDEX_RESULTATS.md`

Ce fichier contient les metriques, les artefacts et l'ordre valide du pipeline.  
`prediteq_ml/PIPELINE_EXPLAINED.txt` reste le support explicatif jury-friendly, mais `INDEX_RESULTATS.md` prime en cas d'ecart.

## Etat valide actuel

- Artefacts principaux regeneres sur `200` trajectoires brutes et transformees
- `rul_predictions.csv` conserve volontairement seulement le holdout de test (`40` trajectoires)
- Regression RUL holdout : `R² 0,947`, `MAE 2,36 jours`
- Validation NASA CMAPSS FD001 : `R² 0,886`, `Score NASA 16 263,9`
- Le frontend applique un gate `FPT` :
  - si `HI >= 0.80`, on affiche `L10`
  - si `HI < 0.80` mais warm-up incomplet, on reste en `warming_up`
  - si `HI < 0.80` avec historique suffisant, on affiche le `RUL`

## Pipeline ML valide

Ordre d'execution valide depuis `prediteq_ml/` :

1. `step1_simulate.py`
2. `step2_preprocess.py`
3. `step3_isolation_forest.py`
4. `step4_health_index.py`
5. `step5_rul_model.py`
6. `step6_evaluate.py`
7. `step6b_cmapss.py`
8. Calibration des intervalles et export production

Pour le detail exact des sorties et des justifications scientifiques, voir `INDEX_RESULTATS.md`.

## Modes de l'application

- `demo` : mode prioritaire pour la soutenance PFE
- `prod` : mode de surface plus stricte, prevu pour les flux reels

L'application reste demo-first en comportement, mais l'architecture a ete reorganisee pour faciliter un branchement MQTT reel plus tard sans rework massif des pages.

## Developpement local

### Backend

```bash
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd prediteq_frontend
npm install
npm run dev
```

Le frontend de developpement tourne sur `http://localhost:8080`.

## Variables d'environnement importantes

### Frontend

```env
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_APP_MODE=demo
VITE_ALLOW_SUPABASE_FALLBACK=true
```

### Backend

```env
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
MQTT_BROKER=
GROQ_API_KEY=
RESEND_API_KEY=
ADMIN_EMAIL=
APP_MODE=demo
```

## Stack technique

| Couche | Technologies |
|---|---|
| ML | Python, pandas, numpy, scikit-learn, SHAP |
| API | FastAPI, APScheduler, gmqtt, Supabase |
| Frontend | React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Recharts, Leaflet |
| Donnees | Supabase PostgreSQL + Auth + Realtime |

## Positionnement produit

Le projet ne repose pas uniquement sur un `RUL` brut.

- `HI` mesure l'etat courant de sante
- `RUL` estime le futur une fois le gate methodologique franchi
- `Stress Index` mesure la severite operationnelle instantanee
- la couche de decision combine `HI + RUL + stress + alertes + taches + fraicheur`

L'objectif produit est donc :

- une demo PFE convaincante aujourd'hui
- une transition facile vers un mode production alimente par donnees reelles demain
