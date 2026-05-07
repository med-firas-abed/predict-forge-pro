# PrediTeq ML

This folder contains the offline ML pipeline.

Important:

- training happens here
- runtime inference happens in `prediteq_api/`
- the backend loads artifacts from `prediteq_ml/models/`

## Open these files first

1. `config.py`
2. `steps/README.md`
3. `PIPELINE_EXPLAINED.txt`
4. `../INDEX_RESULTATS.md`

## Folder map

```text
steps/        pipeline scripts in execution order
diagnostics/  calibration, confidence and stress helpers
models/       exported runtime artifacts consumed by the backend
outputs/      generated metrics, plots and evaluation outputs
data/         generated and processed datasets
```

## Exact ordered pipeline scripts

See `INDEX_RESULTATS.md` for the exact current source of truth.

The current ordered scripts are:

1. `steps/step1_simulate.py`
2. `steps/step2_preprocess.py`
3. `steps/step3_isolation_forest.py`
4. `steps/step4_health_index.py`
5. `steps/step5_rul_model.py`
6. `steps/step6_evaluate.py`
7. `steps/step6b_cmapss.py`
8. `steps/step6c_calibration.py`
9. `steps/step7_export.py`

## What not to say by mistake

- the API does not train the models
- the runtime backend depends on sibling artifacts exported from this folder
- `INDEX_RESULTATS.md` is the safest source for final metrics and generated outputs
