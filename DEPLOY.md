# PrediTeq — Production Deployment Guide

## Architecture

```
[Vercel]  →  [Render]  →  [Supabase]
Frontend      API + ML      Database
(React)       (FastAPI)     (PostgreSQL)
```

**Your values** (replace `YOUR_*` placeholders with your actual values):

| Service | URL |
|---------|-----|
| Supabase | `https://YOUR_PROJECT.supabase.co` |
| Render API | `https://prediteq-api.onrender.com` (after deploy) |
| Vercel Frontend | `https://prediteq.vercel.app` (after deploy) |

---

## Step 0: Push to GitHub

Open a terminal in `c:\Users\Asus\Desktop\pfe_MIME_26`:

```bash
git init
git add .
git commit -m "PrediTeq v1.0 — production ready"
```

Create a **new repository** on GitHub (https://github.com/new):
- Name: `pfe_MIME_26` (or `prediteq`)
- **Private** repository
- Do NOT initialize with README

Then push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/pfe_MIME_26.git
git branch -M main
git push -u origin main
```

> ⚠️ The repo is ~59 MB (mostly the 50 MB RF model). This is under GitHub's 100 MB file limit.

---

## Step 1: Deploy Backend on Render

### 1.1 — Create Service

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo: `pfe_MIME_26`
4. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `prediteq-api` |
| **Region** | `Frankfurt` (closest to Tunisia) |
| **Branch** | `main` |
| **Root Directory** | *(leave empty — needs both prediteq_api/ and prediteq_ml/)* |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r prediteq_api/requirements.txt` |
| **Start Command** | `cd prediteq_api && uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Plan** | `Starter` ($7/mo) or `Free` (with cold starts) |

### 1.2 — Set Environment Variables

In the Render dashboard → your service → **Environment** tab, add these:

| Key | Value | Notes |
|-----|-------|-------|
| `PYTHON_VERSION` | `3.11.9` | Required by Render |
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `eyJhbG...` (your full key) | The **service_role** key from Supabase |
| `GROQ_API_KEY` | `gsk_...` (your full key) | For AI chat/reports |
| `RESEND_API_KEY` | `re_...` (your full key) | For email alerts |
| `RESEND_FROM` | `PrediTeq Alerts <alerts@yourdomain.com>` | Verified sender (Resend) |
| `ADMIN_EMAIL` | `your-admin@example.com` | Alert fallback email |
| `CORS_ORIGINS` | `https://prediteq.vercel.app` | Your Vercel domain |
| `DASHBOARD_URL` | `https://prediteq.vercel.app` | Used in email links |
| `MQTT_BROKER` | *(leave empty)* | Empty = simulated mode |

### 1.3 — Set Health Check

In **Settings** tab:
- **Health Check Path**: `/health`

### 1.4 — Deploy

Click **"Create Web Service"**. Wait for the build to complete (3-5 minutes).

### 1.5 — Verify

Once deployed, visit:

```
https://prediteq-api.onrender.com/health
```

You should see:

```json
{"status": "ok", ...}
```

> **Note your Render URL** — you'll need it for Vercel. It will be something like:
> `https://prediteq-api.onrender.com`

---

## Step 2: Deploy Frontend on Vercel

### 2.1 — Import Project

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. **Import** your GitHub repo: `pfe_MIME_26`
4. Configure:

| Setting | Value |
|---------|-------|
| **Framework Preset** | `Vite` (auto-detected) |
| **Root Directory** | Click **"Edit"** → type `prediteq_frontend` |
| **Build Command** | `npm run build` (auto) |
| **Output Directory** | `dist` (auto) |

### 2.2 — Set Environment Variables

Before clicking Deploy, expand **"Environment Variables"** and add:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbG...` (your full **anon** key — NOT the service key!) |
| `VITE_API_URL` | `https://prediteq-api.onrender.com` (your Render URL from Step 1.5) |

> ⚠️ **CRITICAL**: `VITE_API_URL` must be your Render URL, NOT localhost.

### 2.3 — Deploy

Click **"Deploy"**. Wait for the build (1-2 minutes).

### 2.4 — Configure Domain (optional)

By default, Vercel gives you `your-project.vercel.app`. If you want `prediteq.vercel.app`:

1. Go to **Settings** → **Domains**
2. Add: `prediteq.vercel.app`

> If you change the domain, update `CORS_ORIGINS` and `DASHBOARD_URL` in Render to match.

### 2.5 — Verify

Visit `https://prediteq.vercel.app` (or your Vercel URL). You should see the login page.

---

## Step 3: Supabase Setup

Your Supabase project is already created. Verify these settings:

### 3.1 — Auth Settings

1. Go to https://supabase.com/dashboard → your project → **Authentication** → **Providers**
2. Ensure **Email** provider is enabled
3. Under **Authentication** → **URL Configuration**:
   - **Site URL**: `https://prediteq.vercel.app`
   - **Redirect URLs**: add `https://prediteq.vercel.app/**`

### 3.2 — Verify Tables Exist

Go to **Table Editor** and verify these tables exist:

- `profiles` — user profiles (role, status, machine_id)
- `machines` — the 3 elevator machines
- `alertes` — system alerts
- `historique_hi` — HI history over time
- `predictions_rul` — RUL prediction log
- `gmao_taches` — maintenance tasks
- `couts` — maintenance costs
- `seuils` — configurable alert thresholds
- `email_logs` — email sending log
- `rapports` — generated AI reports

### 3.3 — Verify Machine Data

In the `machines` table, you should have 3 rows:

| code | nom | region |
|------|-----|--------|
| ASC-A1 | Ascenseur Magasin A1 | Ben Arous |
| ASC-B2 | Ascenseur Magasin B2 | Sfax |
| ASC-C3 | Ascenseur Magasin C3 | Sousse |

If they're missing, insert them manually in the Table Editor.

### 3.4 — Verify RPC Function

The backend uses an RPC function `can_send_email`. Create it if missing:

Go to **SQL Editor** and run:

```sql
CREATE OR REPLACE FUNCTION can_send_email(p_machine_id UUID, p_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_sent TIMESTAMPTZ;
BEGIN
  SELECT created_at INTO last_sent
  FROM email_logs
  WHERE machine_id = p_machine_id
    AND type = p_type
    AND success = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF last_sent IS NULL THEN
    RETURN true;
  END IF;

  RETURN (now() - last_sent) > INTERVAL '24 hours';
END;
$$;
```

---

## Step 4: Test End-to-End

### 4.1 — Login

1. Visit `https://prediteq.vercel.app`
2. Register a new admin account (or login with existing)
3. If new account: approve it in Supabase `profiles` table (set `status` = `approved`)

### 4.2 — Start Simulator

1. Login as admin
2. Go to **Simulateur** page
3. Click **Start** (speed 60x)
4. You should see HI values changing on the Dashboard within ~10 seconds

### 4.3 — Verify Features

- [ ] Dashboard shows live HI for all 3 machines
- [ ] Machine cards show sensor values (vibration, power, temperature)
- [ ] HI chart shows dynamic threshold lines
- [ ] Alerts page shows alerts when HI crosses thresholds
- [ ] Chat widget responds to questions ("état de ASC-A1?")
- [ ] AI Report generates when clicked
- [ ] SHAP explanations show feature contributions in machine modal
- [ ] Planner generates maintenance plans (admin only)
- [ ] Seuils page allows changing thresholds (admin only)

---

## Troubleshooting

### "API calls fail" / CORS error in browser console

→ Check Render env: `CORS_ORIGINS` must exactly match your Vercel URL (no trailing slash).

### "Simulator starts but no HI data"

→ Check Render logs: look for "ML models not found" errors.

### "Login works but dashboard is empty"

→ Check that `machines` table has 3 rows in Supabase.

### "AI chat/reports return 503"

→ `GROQ_API_KEY` not set or invalid in Render.

### "Emails not sending"

→ `RESEND_API_KEY` not set in Render, or Resend domain not verified.

### Render shows "Build failed"

→ Check build logs. Common issues:
- `scikit-learn` needs `PYTHON_VERSION=3.11.9`
- Build command must be: `pip install -r prediteq_api/requirements.txt`

### Vercel shows blank page

→ Check that **Root Directory** is set to `prediteq_frontend` in Vercel settings.
→ Check that `VITE_API_URL` is set (not empty).

---

## Updating After Changes

### Push code changes:

```bash
git add .
git commit -m "description of change"
git push
```

Both Render and Vercel **auto-deploy** on push to `main`.

### Render deploy takes ~3-5 min. Vercel takes ~1-2 min.
