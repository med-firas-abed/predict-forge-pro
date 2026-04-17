"""
SHAP explainability endpoint — per PFE doc §10.1.
Returns feature importance for the last anomaly score of a machine.
Uses TreeExplainer on the IsolationForest model.

GET /explain/{machine_code} — SHAP feature contributions
"""

import logging

import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from core.auth import CurrentUser, require_auth, get_machine_filter
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/explain", tags=["explainability"])

FEATURE_NAMES = [
    'rms_mms', 'drms_dt', 'rms_variability',
    'p_mean_kw', 'p_rms_kw', 'dp_dt',
    'e_cycle_kwh', 'duration_ratio',
    't_mean_c', 'dt_dt', 'hr_std', 'corr_t_p',
]


def _compute_shap(if_model, features: dict) -> dict:
    """Compute SHAP values for one sample using TreeExplainer."""
    import shap

    explainer = shap.TreeExplainer(if_model)
    X = np.array([[features.get(f, 0.0) for f in FEATURE_NAMES]])
    shap_values = explainer.shap_values(X)[0]

    contributions = {
        name: round(float(val), 6)
        for name, val in zip(FEATURE_NAMES, shap_values)
    }
    # Sort by absolute impact (descending)
    sorted_contrib = dict(sorted(
        contributions.items(),
        key=lambda x: abs(x[1]),
        reverse=True,
    ))
    return sorted_contrib


@router.get("/{machine_code}")
async def explain_anomaly(machine_code: str,
                           user: CurrentUser = Depends(require_auth)):
    """
    GET /explain/{machine_code}
    Returns SHAP feature contributions for the latest anomaly score.
    Shows which sensor features drive the anomaly detection.
    """
    manager = get_manager()

    # Machine scoping
    machine_filter = get_machine_filter(user)
    if machine_filter:
        uuid = manager.get_uuid(machine_code)
        if not uuid or uuid != machine_filter:
            raise HTTPException(403, "Accès interdit à cette machine")

    last = manager.last_results.get(machine_code)
    if not last:
        raise HTTPException(404, f"No data for machine '{machine_code}' — start simulator first")

    # Get the current features from the buffer
    buf = manager.buffers.get(machine_code)
    if not buf:
        raise HTTPException(404, f"No feature buffer for '{machine_code}'")

    # Reconstruct last features from buffer state
    features = {
        'rms_mms': buf._rms[-1] if buf._rms else 0.0,
        'drms_dt': (buf._rms[-1] - buf._rms[-2]) if len(buf._rms) >= 2 else 0.0,
        'rms_variability': float(np.std(list(buf._rms))) if len(buf._rms) >= 2 else 0.0,
        'p_mean_kw': float(np.mean(list(buf._power))) if buf._power else 0.0,
        'p_rms_kw': float(np.sqrt(np.mean([p**2 for p in buf._power]))) if buf._power else 0.0,
        'dp_dt': (buf._power[-1] - buf._power[-2]) if len(buf._power) >= 2 else 0.0,
        'e_cycle_kwh': buf._e_cycle_kwh,
        'duration_ratio': buf._duration_ratio,
        't_mean_c': float(np.mean(list(buf._temp))) if buf._temp else 0.0,
        'dt_dt': (buf._temp_means[-1] - buf._temp_means[-61]) / 60.0 if len(buf._temp_means) > 60 else 0.0,
        'hr_std': float(np.std(list(buf._humidity))) if len(buf._humidity) >= 2 else 0.0,
        'corr_t_p': 0.0,
    }
    # Compute corr_t_p
    if len(buf._tp_pairs) >= 60:
        arr = np.array(list(buf._tp_pairs))
        t_std = float(np.std(arr[:, 0]))
        p_std = float(np.std(arr[:, 1]))
        if t_std > 1e-8 and p_std > 1e-8:
            c = float(np.corrcoef(arr[:, 0], arr[:, 1])[0, 1])
            features['corr_t_p'] = 0.0 if np.isnan(c) else c

    # Compute SHAP on normalized features (IF was trained on z-scored data)
    try:
        scaler = manager._scaler  # {feat: {mean, std}}
        missing = [f for f in FEATURE_NAMES if f not in scaler]
        if missing:
            raise HTTPException(500, f"Scaler missing features: {missing}")
        normalized_features = {
            f: (features.get(f, 0.0) - scaler[f]['mean']) / max(scaler[f]['std'], 1e-12)
            for f in FEATURE_NAMES
        }
        shap_contributions = _compute_shap(manager._if, normalized_features)
    except Exception as e:
        logger.error("SHAP computation error for %s: %s", machine_code, e)
        raise HTTPException(500, "SHAP computation failed")

    return {
        "machine_code": machine_code,
        "hi_smooth": last.get("hi_smooth"),
        "zone": last.get("zone"),
        "score_if": last.get("score_if"),
        "features": features,
        "shap_contributions": shap_contributions,
        "top_drivers": list(shap_contributions.keys())[:3],
    }
