# FINAL RELEASE CHECKLIST

This checklist is the safest way to freeze a jury-ready and demo-ready version of PrediTeq without destabilizing the product.

## Current verified baseline

- Manual frontend production build verified on `2026-05-15`
- Manual deployed smoke verified on `2026-05-15`
- Frontend preferred URL: `https://prediteq.aro-teq.com`
- Frontend fallback URL: `https://prediteq-saas.vercel.app`
- Backend live URL: `https://prediteq-saas.onrender.com`

## Freeze rules

- Do not add new features after this point.
- Accept only bug fixes, wording fixes, and deployment corrections.
- Re-run the full checklist after any post-freeze change.

## Local verification

### Frontend

Run from `prediteq_frontend/`:

```bash
npm run build
npm run test
npx playwright test
```

Expected outcome:

- production build passes
- all Vitest tests pass
- all Playwright tests pass

### Backend

Run from `prediteq_api/`:

```bash
python -m py_compile main.py report_engine.py routers\planner.py routers\report.py routers\simulator.py core\cost_model.py core\machine_labels.py
python -c "import main, routers.simulator, routers.report, routers.planner"
```

Expected outcome:

- compile check passes
- imports load without runtime errors

## Live verification

Run from `prediteq_frontend/`:

```bash
npm run smoke:deployed
```

Expected outcome:

- backend `/health` passes
- backend public metrics endpoint passes
- public machine list returns data
- frontend login page loads
- unauthenticated routing remains correct
- backend CORS accepts `https://prediteq.aro-teq.com`
- backend CORS accepts `https://prediteq-saas.vercel.app`

## Demo rehearsal

- Open `Simulateur`
- `Pause` if a session is active
- `Réinitialiser`
- `Démarrer`
- Open `Tableau de bord`
- Confirm the demo story:
- `Machine 1` = stable / healthy
- `Machine 2` = watch / medium-risk
- `Machine 3` = critical
- Rehearse this sequence:
- `Simulateur` -> `Tableau de bord` -> `Diagnostic avancé` -> `Coûts & Budget` -> `Analyse & Rapport IA`

## Product consistency checks

- public naming uses `Machine 1`, `Machine 2`, `Machine 3`
- labor cost stays `30 DT / heure`
- AI PDF export uses the branded professional layout
- French wording is consistent across demo pages
- no hardcoded `ASC-A1 / ASC-B2 / ASC-C3` remain in user-facing demo copy

## Delivery package

- `PrediTeq_Dossier_Jury.pdf`
- `PrediTeq_Soutenance_v3.pptx`
- `final_report/report.md`
- `final_report/jury_demo_cheat_sheet.md`
- root `README.md`
- `DEPLOYMENT_FREEZE.md`

## Backup demo assets to prepare

- one screenshot of `Simulateur`
- one screenshot of `Tableau de bord`
- one screenshot of `Diagnostic avancé`
- one screenshot of `Coûts & Budget`
- one screenshot of `Analyse & Rapport IA`
- optional PDF export sample already generated from the branded report path

## After DNS/custom-domain cutover

When the final domain is ready, repeat:

- `npm run smoke:deployed` with the final public URLs
- CORS verification
- PDF/export verification from the new frontend domain
- one quick end-to-end live demo rehearsal
