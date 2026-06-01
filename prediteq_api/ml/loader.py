import os
import sys
import json
import logging
import joblib

from core.config import settings

logger = logging.getLogger(__name__)


def _ensure_ml_path():
    """Add prediteq_ml root + models/ to sys.path for imports."""
    for p in [settings.ML_DIR, settings.MODEL_DIR]:
        if p not in sys.path:
            sys.path.insert(0, p)


def _apply_runtime_rf_limit(rf_model, estimator_limit: int | None):
    """Trim the RF ensemble for memory-constrained hosted runtimes.

    The production/demo app only needs inference. On small hosted instances,
    keeping all 300 trees in memory can exceed RAM even though a smaller
    ensemble produces near-identical demo outputs. Local development keeps the
    full model by default; Render-hosted runtimes use a safer cap unless an
    explicit env override is provided.
    """
    if estimator_limit is None:
        return rf_model

    estimators = getattr(rf_model, "estimators_", None)
    if not isinstance(estimators, list):
        return rf_model

    current = len(estimators)
    if estimator_limit <= 0 or estimator_limit >= current:
        return rf_model

    rf_model.estimators_ = estimators[:estimator_limit]
    try:
        rf_model.n_estimators = int(estimator_limit)
    except Exception:
        pass

    logger.warning(
        "  Runtime RF estimator cap active: %d -> %d trees to reduce memory pressure",
        current,
        estimator_limit,
    )
    return rf_model


def load_all() -> tuple:
    """
    Load all ML artifacts from MODEL_DIR.
    Returns (if_model, rf_model, scaler_params, hi_params, hybrid_params, PrediteqEngine_cls).
    """
    _ensure_ml_path()
    model_dir = settings.MODEL_DIR
    logger.info("Loading ML models from %s", model_dir)

    # Validate required files exist before loading
    required_files = ['isolation_forest.pkl', 'random_forest_rul.pkl',
                      'scaler_params.json', 'hi_params.json']
    for fname in required_files:
        fpath = os.path.join(model_dir, fname)
        if not os.path.exists(fpath):
            raise FileNotFoundError(
                f"Required ML artifact missing: {fpath}. "
                f"Run the ML pipeline (steps 1-7) first."
            )

    from prediteq_engine import PrediteqEngine

    if_model = joblib.load(os.path.join(model_dir, 'isolation_forest.pkl'))
    logger.info("  Loaded isolation_forest.pkl")

    rf_model = joblib.load(os.path.join(model_dir, 'random_forest_rul.pkl'))
    rf_model = _apply_runtime_rf_limit(
        rf_model,
        settings.EFFECTIVE_RUNTIME_RF_ESTIMATOR_LIMIT,
    )
    logger.info("  Loaded random_forest_rul.pkl (%d trees)", len(rf_model.estimators_))

    with open(os.path.join(model_dir, 'scaler_params.json')) as f:
        scaler_params = json.load(f)
    logger.info("  Loaded scaler_params.json (%d features)", len(scaler_params))

    with open(os.path.join(model_dir, 'hi_params.json')) as f:
        hi_params = json.load(f)
    logger.info("  Loaded hi_params.json (p5=%.4f, p95=%.4f)", hi_params['p5'], hi_params['p95'])

    hybrid_path = os.path.join(model_dir, 'hybrid_params.json')
    if os.path.exists(hybrid_path):
        with open(hybrid_path) as f:
            hybrid_params = json.load(f)
        logger.info("  Loaded hybrid_params.json (alpha=%.2f)", hybrid_params['hybrid_alpha'])
    else:
        hybrid_params = None
        logger.warning("  hybrid_params.json not found — IF-only mode")

    return if_model, rf_model, scaler_params, hi_params, hybrid_params, PrediteqEngine
