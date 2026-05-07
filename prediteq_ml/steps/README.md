# ML Steps Map

Each file in this folder corresponds to one offline pipeline step.

## Step roles

- `step1_simulate.py` - generate synthetic trajectories
- `step2_preprocess.py` - transform raw trajectories into engineered features
- `step3_isolation_forest.py` - anomaly scoring
- `step4_health_index.py` - build HI from observed signals and derived scores
- `step5_rul_model.py` - train the RUL model
- `step6_evaluate.py` - internal evaluation and plots
- `step6b_cmapss.py` - external validation on CMAPSS
- `step6c_calibration.py` - confidence / interval calibration
- `step7_export.py` - export artifacts for runtime use

## Best file sequence to explain prediction

If you need a clean technical sequence, open:

1. `step1_simulate.py`
2. `step2_preprocess.py`
3. `step4_health_index.py`
4. `step5_rul_model.py`
5. `step6_evaluate.py`
6. `step7_export.py`
