# Deployment Freeze

This file records the current known-good deployment wiring so local, GitHub, Vercel, and Render stay aligned.

## Live URLs

- Frontend: `https://prediteq-saas.vercel.app`
- Backend: `https://prediteq-saas.onrender.com`

## Last Verified State

- Local frontend production build re-verified on `2026-05-15`
- Deployed smoke manually re-verified on `2026-05-15`
- Verification command: `cd prediteq_frontend && npm run smoke:deployed`
- Result on `2026-05-15`: passed against the Vercel and Render live URLs above
- Additional live checks on `2026-05-15`:
  - `GET https://prediteq-saas.onrender.com/health` returned `{"status":"ok","version":"1.0.0"}`
  - `GET https://prediteq-saas.onrender.com/health/public-metrics` returned the expected verified pipeline JSON
  - `GET https://prediteq-saas.vercel.app/login` returned `200`
  - backend CORS accepted `Origin: https://prediteq-saas.vercel.app`

## Frontend Environment Variables

These are the values or meanings the Vercel deployment should keep:

- `VITE_API_URL=https://prediteq-saas.onrender.com`
- `VITE_SUPABASE_URL=<your Supabase project URL>`
- `VITE_SUPABASE_ANON_KEY=<your public Supabase anon key>`

Notes:

- The frontend build bakes `VITE_API_URL` into the bundle.
- `VITE_SUPABASE_ANON_KEY` is a public client key, not the service-role key.
- Local frontend dev should still use `VITE_API_URL=http://localhost:8000`.
- If `VITE_API_URL` is missing in Vercel, the app will render but API calls will fail.

## Backend Environment Variables

These are the key Render-side values that must stay aligned with the live frontend:

- `SUPABASE_URL=<your Supabase project URL>`
- `SUPABASE_SERVICE_KEY=<your Supabase service role key>`
- `CORS_ORIGINS=https://prediteq-saas.vercel.app`
- `DASHBOARD_URL=https://prediteq-saas.vercel.app`
- `ADMIN_EMAIL=<approved admin email>`

Email and alert variables are defined in [render.yaml](./render.yaml) and [prediteq_api/.env.example](./prediteq_api/.env.example).

## GitHub Guardrails

The repo now uses these workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/deployed-smoke.yml`

What they cover:

- frontend lint
- frontend unit tests
- frontend Playwright browser tests
- frontend production build
- backend compile check
- deployed smoke test against live Vercel and Render URLs

## Stability Notes

- The Render service currently responds on `https://prediteq-saas.onrender.com` even though `render.yaml` still names the service `prediteq-api`. Do not change the live URL assumption in Vercel unless Render is updated first.
- The deployed smoke script lives in [prediteq_frontend/scripts/smoke-deployed.mjs](./prediteq_frontend/scripts/smoke-deployed.mjs).
- If GitHub Actions browser tests run without a local `.env`, the workflow now injects safe placeholder Supabase values so the app can boot in CI.
- The current manual freeze package is documented in [docs/FINAL_RELEASE_CHECKLIST.md](./docs/FINAL_RELEASE_CHECKLIST.md) and [docs/HANDOFF_RUNBOOK.md](./docs/HANDOFF_RUNBOOK.md).
- The backend currently returns `405` to `HEAD /health`; Render health checks use `GET /health`, which is the path validated above.

## Rollback Plan

Use the latest stable tag as the rollback point for demo or jury recovery.

- Inspect tags: `git tag`
- Roll back locally: `git checkout <stable-tag>`
- Roll back a branch: `git reset --hard <stable-tag>` only if you explicitly choose a destructive rollback

The current stable tag should be updated only after CI and the deployed smoke workflow are green.
