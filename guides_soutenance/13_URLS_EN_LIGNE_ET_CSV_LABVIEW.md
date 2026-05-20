# URLs en ligne et CSV LabVIEW

Ce fichier repond a deux questions tres pratiques :

1. quelles sont les vraies URLs publiques a utiliser
2. ou se trouvent les CSV LabVIEW de demonstration dans le projet

## URLs publiques a retenir

Frontend public prefere :

- `https://prediteq.aro-teq.com/`

Frontend Vercel de secours :

- `https://prediteq-saas.vercel.app/`

Backend public :

- `https://prediteq-saas.onrender.com/`

Health backend :

- `https://prediteq-saas.onrender.com/health`

Phrase simple a dire :

> Le frontend public prefere est le domaine Aroteq. Le domaine Vercel reste une URL de secours. Le backend public reste sur Render.

## Ou se trouve le CSV LabVIEW

### 1. Template canonique dans le repo

C'est le fichier principal a garder comme reference :

- [ARO-01_labview_demo_template.csv](../prediteq_api/scripts/sample_data/ARO-01_labview_demo_template.csv)

Il est genere pour etre coherent avec la logique de simulation et il sert de base au rejeu live.

### 2. Fichier live ecrit pendant la demo locale

Quand tu lances le rejeu live, le fichier ecrit en continu est :

- `C:\labview\prediteq_log.csv`

Ce fichier n'est pas la source canonique versionnee du projet. C'est la sortie live ecrite par :

- [replay_labview_demo_csv.py](../prediteq_api/scripts/replay_labview_demo_csv.py)

### 3. Copie simple dans le Bridge Kit

Si tu veux un CSV facile a montrer dans le kit relais :

- [PREFERRED_LABVIEW_CSV_TEMPLATE.csv](../prediteq_api/PrediTeq_Bridge_Kit/PREFERRED_LABVIEW_CSV_TEMPLATE.csv)

### 4. Copie simple dans le dossier transfert PC relais

Autre copie utile pour les tests relay-PC :

- [labview_mock_output.csv](../prediteq_api/TRANSFER_TO_PC2/labview_mock_output.csv)

## Quels fichiers poussent la partie en ligne

### Frontend

- [vercel.json](../prediteq_frontend/vercel.json)
  - les routes `/api/*` y sont redirigees vers le backend Render

### Backend

- [config.py](../prediteq_api/core/config.py)
  - URL dashboard par defaut
  - CORS par defaut pour les domaines frontend publics
- [render.yaml](../render.yaml)
  - configuration de deploiement Render

### Bridge PC relais

- [.env.bridge.example](../prediteq_api/scripts/.env.bridge.example)
- [BRIDGE_CONFIG_EXAMPLE.txt](../prediteq_api/PrediTeq_Bridge_Kit/BRIDGE_CONFIG_EXAMPLE.txt)

Ces fichiers montrent comment viser un broker MQTT prive ou, en secours, l'ingest HTTP du backend public.

## Verification en ligne

Le script de verification deploiement est :

- [smoke-deployed.mjs](../prediteq_frontend/scripts/smoke-deployed.mjs)

Commande :

```powershell
cd prediteq_frontend
npm run smoke:deployed
```

## Resume ultra-pratique

- CSV LabVIEW canonique : [ARO-01_labview_demo_template.csv](../prediteq_api/scripts/sample_data/ARO-01_labview_demo_template.csv)
- CSV live local pendant la demo : `C:\labview\prediteq_log.csv`
- Frontend public prefere : `https://prediteq.aro-teq.com/`
- Frontend secours : `https://prediteq-saas.vercel.app/`
- Backend public : `https://prediteq-saas.onrender.com/`
