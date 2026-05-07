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
