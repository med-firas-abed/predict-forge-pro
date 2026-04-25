# AGENTS.md

## Scope
- Ignore `external-skills/` for product and report work; the real project is `prediteq_ml/`, `prediteq_api/`, `prediteq_frontend/`, `rapport_firas/`, and `final_report/`.
- There is already a report workspace in `final_report/`; if the task is about the jury report, read `final_report/AGENTS.md` first.

## Package Boundaries
- This repo is not a root workspace. Run commands from the package you are changing.
- `prediteq_ml/` is offline training/evaluation/export.
- `prediteq_api/` is the runtime loader and service layer.
- `prediteq_frontend/` is the React UI.
- `rapport_firas/` is the existing ISAMM LaTeX scaffold and formatting reference.
- `final_report/report.md` is the current French jury-report prose source for any report-to-LaTeX transformation.

## Commands Easy To Guess Wrong
- Frontend local dev is `cd prediteq_frontend && npm install && npm run dev` and runs on port `8080`, not Vite's default `5173`.
- Frontend tests are split: `cd prediteq_frontend && npm run test` for Vitest, `cd prediteq_frontend && npx playwright test` for E2E.
- Backend local run is `cd prediteq_api && pip install -r requirements.txt && uvicorn main:app --reload`.
- The full ML pipeline order is the 8-step sequence in `INDEX_RESULTATS.md`; cite that exact order instead of reconstructing it from memory.

## Report / LaTeX Work
- For a new LaTeX report, mirror the chapter structure and compile pattern of `rapport_firas/main.tex`; compile the main file, never individual chapters.
- Reuse `rapport_firas/00_page_de_garde.tex` and `rapport_firas/TABLE_DES_MATIERES.md` as the formatting and ordering reference for ISAMM-style reports.
- Prefer transforming `final_report/report.md` into LaTeX rather than rewriting content from scratch.
- Keep source figures in place unless the task explicitly asks for copies; the verified ML plots already exist under `prediteq_ml/outputs/plots/`.

## Source Priority
- Trust executable and generated sources over prose when they disagree.
- Current ML truth is in `prediteq_ml/config.py`, `prediteq_ml/outputs/*.json`, and runtime code in `prediteq_api/`.
- `INDEX_RESULTATS.md` is the best single source for verified numbers, file inventory, and pipeline timings.
- `prediteq_ml/PIPELINE_EXPLAINED.txt` is the best source for jury-friendly explanations of parameter and method choices.
- `references/GUIDE_PREDITEQ.md` and `references/PRESENTATION_ML.md` are helpful for phrasing but contain stale claims; cross-check them before using any metric or workflow detail.

## Facts Easy To Misstate
- The current pipeline uses `200` trajectories, not `100`.
- The current RUL target is built from observable `hi_smooth` with a no-leakage split/crossing workflow; do not describe the final RUL model as trained directly on hidden `simulated_hi` labels.
- The simulator is demo-oriented: it feeds telemetry through the engine, then clamps or overrides displayed `hi_smooth`, `zone`, and RUL in `prediteq_api/routers/simulator.py`.
- Runtime thresholds can differ from offline defaults because live values come from the Supabase `seuils` table.
- The API depends on sibling `prediteq_ml/models/`; do not describe `prediteq_api/` as a standalone backend that trains models itself.
