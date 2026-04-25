# PrediTeq — Plateforme SaaS de Maintenance Prédictive

> PFE — Mohamed Firas Abed | ISAMM | Aroteq, Ben Arous

Plateforme de maintenance prédictive pour ascenseurs industriels (SITI FC100L1-4).
ML + FastAPI + React + Supabase.

## Architecture

```
prediteq_ml/       ← Pipeline ML (7 étapes) + modèles entraînés
prediteq_api/      ← Backend FastAPI (10 routeurs, scheduler, MQTT, email)
prediteq_frontend/ ← Frontend React + TypeScript + Tailwind + shadcn/ui
```

## Déploiement

### Frontend → Vercel (gratuit)

1. Aller sur [vercel.com](https://vercel.com), connecter ton repo GitHub
2. Sélectionner **Root Directory** → `prediteq_frontend`
3. Framework Preset → **Vite** (auto-détecté)
4. Ajouter les **Environment Variables** :
   ```
   VITE_SUPABASE_URL      = https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJ...
   VITE_API_URL            = https://prediteq-api.onrender.com
   ```
5. Cliquer **Deploy**

### Backend → Render (gratuit)

1. Aller sur [render.com](https://render.com), connecter ton repo GitHub
2. Créer un **New Web Service**
3. **Build Command** : `pip install -r prediteq_api/requirements.txt`
4. **Start Command** : `cd prediteq_api && uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Ajouter les **Environment Variables** :
   ```
   PYTHON_VERSION       = 3.11.9
   SUPABASE_URL         = https://xxx.supabase.co
   SUPABASE_SERVICE_KEY = eyJ...service-role-key
   GROQ_API_KEY         = gsk_...    (chat IA, rapports, planificateur)
   RESEND_API_KEY       = re_...    (alertes email)
   ADMIN_EMAIL          = ton-email@example.com
   MQTT_BROKER          =           (vide = mode simulé)
   ```
6. Cliquer **Create Web Service**

> Le plan gratuit de Render met l'API en veille après 15 min d'inactivité.
> Le premier appel prend ~30s (cold start). Normal pour un PFE.

### Après le déploiement

- Note l'URL Render (ex: `https://prediteq-api.onrender.com`)
- Mets-la dans les env vars Vercel : `VITE_API_URL`
- Redéploy le frontend sur Vercel

## Développement local

```bash
# Backend
cd prediteq_api
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd prediteq_frontend
npm install
npm run dev
```

## Stack technique

| Couche | Technologies |
|--------|-------------|
| ML | Python, scikit-learn (IF + RF), SHAP, pandas, numpy |
| Backend | FastAPI, APScheduler, gmqtt, Supabase, Groq (LLM), Resend |
| Frontend | React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, Recharts, Leaflet |
| BDD | Supabase (PostgreSQL + Auth + Realtime) |
