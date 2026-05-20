# References Archive

## Jury warning

This folder is a **historical reference bank**, not the canonical jury pack.

For the current soutenance story, prefer:

- `guides_soutenance/`
- `prediteq_ml/config.py`
- `prediteq_ml/outputs/*.json`
- `prediteq_api/demo_scenarios.py`
- `prediteq_api/routers/simulator.py`
- `prediteq_api/routers/live_ingest.py`

Do not use this folder alone to state current metrics, the current simulation
story, or the live integration contract.

This folder is kept as a reference bank, not as an active source of truth for
the running product.

Use this folder for:

- older phrasing help for reports and presentations
- deployment notes kept for historical context
- writing guidance that may still be useful for packaging the project

Do not treat these files as authoritative for current metrics, paths, or runtime
behavior. When facts matter, prefer:

- `prediteq_ml/config.py`
- `prediteq_ml/outputs/*.json`
- `prediteq_api/`
- `prediteq_frontend/`
- `prediteq_api/sql/`
- `docs/`

Notes:

- `GUIDE_PREDITEQ.md` and `PRESENTATION_ML.md` are helpful for phrasing, but can
  contain stale claims.
- `DEPLOY.md` is historical deployment guidance and should be cross-checked
  against the current deploy setup.
