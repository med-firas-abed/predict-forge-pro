# prediteq_api/ml

This folder is the runtime bridge between exported models and live API behavior.

## Files

- `loader.py` - loads exported artifacts from `prediteq_ml/models/`
- `engine_manager.py` - runtime state, feature building, buffers, HI and RUL context

## Why this folder matters

If the jury asks where prediction becomes live application behavior, this is one of the first folders to open.
