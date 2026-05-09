# PrediTeq Frontend

This folder contains the React application deployed on Vercel.

## Expected deploy root

If Vercel is used, the root directory should be:

- `prediteq_frontend`

Main frontend deploy files:

- `package.json`
- `vercel.json`
- `vite.config.ts`

## Open these files first

1. `src/pages/Index.tsx`
2. `src/components/pages/DashboardPage.tsx`
3. `src/components/pages/DiagnosticsPage.tsx`
4. `src/components/pages/PlannerPage.tsx`
5. `src/components/pages/MaintenancePage.tsx`

## Folder map

```text
src/components/pages/       full application pages
src/components/industrial/  reusable domain widgets
src/contexts/               auth and app context
src/hooks/                  data hooks and live queries
src/lib/                    API helpers, formatting and domain helpers
src/data/                   local data helpers and machine presentation data
src/pages/                  top-level router entry
```

## Runtime flow

The usual frontend flow is:

`route -> page component -> hook -> lib/runtimeDataRepository -> backend API`

## Local development

```bash
npm install
npm run dev
```

Dev server:

- `http://127.0.0.1:8080`

## Final QA

Run these from `prediteq_frontend/` before a demo or delivery:

```bash
npm run build
npm run test
npx playwright test
```

If you want to smoke the deployed app instead of local dev:

```bash
npm run smoke:deployed
```

## Demo-ready flow

Use this order for the cleanest product story:

1. `Simulateur` to reset and start the calibrated replay
2. `Tableau de bord` to compare `Machine 1`, `Machine 2`, and `Machine 3`
3. `Diagnostic avancé` to justify the recommended action
4. `Coûts & Budget` to translate the action into business impact
5. `Analyse & Rapport IA` to export the professional PDF

Current public naming is intentionally generic:

- `Machine 1` = healthy / stable demo profile
- `Machine 2` = watch / medium-risk demo profile
- `Machine 3` = critical demo profile
