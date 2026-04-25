"""
Diagnostics router — brique complémentaire au pipeline existant.
═══════════════════════════════════════════════════════════════════════════════

Expose les 5 briques du module `prediteq_ml.diagnostics` via l'API, SANS
toucher aux routers existants :
    - /explain       (SHAP anomalie IF)     → inchangé
    - /machines      (status + RUL brut)    → inchangé
    - /diagnostics   (NOUVEAU — RUL IC, diagnose, SHAP RUL, disclaimers)

Fondement scientifique de chaque endpoint documenté dans les docstrings
des fonctions sous-jacentes (rul_confidence.py, diagnose.py, explain.py,
disclaimers.py).

Endpoints
─────────
    GET /diagnostics/disclaimers
        Texte statique AI Act Art. 13 (aucune auth requise pour que le
        frontend puisse l'afficher au login).

    GET /diagnostics/{machine_code}/rul-interval
        RUL enrichi : moyenne + IC 80 % (p10/p90) + CVI + badge. Utilise
        les 300 arbres du Random Forest via la même sérialisation que
        `engine.predict_rul` — pas de ré-entraînement.

    GET /diagnostics/{machine_code}/diagnose
        Alertes normatives (ISO 10816-3, IEC 60034-1, IEEE 1856-2017)
        sur les dernières valeurs capteurs moyennées sur 1 cycle.

    GET /diagnostics/{machine_code}/rul-explain
        Décomposition SHAP TreeExplainer de la prédiction RUL :
        top-K contributions + baseline. Distinct de /explain qui agit
        sur l'IsolationForest d'anomalie.

    GET /diagnostics/{machine_code}/all
        Agrégat des trois endpoints précédents en une seule requête —
        utilisé par le composant `DiagnosticsPanel` côté frontend.
"""

import logging
import math
import os
import sys

import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from core.auth import CurrentUser, require_auth, get_machine_filter
from core.config import settings
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

# ─── Rendre le module prediteq_ml.diagnostics importable ────────────────────
# ml.loader._ensure_ml_path() a déjà ajouté settings.ML_DIR à sys.path au
# démarrage de l'API (cf. lifespan → load_all). On le redouble ici par
# sécurité pour le cas où ce routeur est importé avant le lifespan
# (ex. découverte par uvicorn --reload au hot-reload).
for _p in (settings.ML_DIR, settings.MODEL_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Import après extension du path — le package se trouve à
# prediteq_ml/diagnostics/__init__.py
from diagnostics import (
    predict_with_interval,
    diagnose,
    explain_prediction,
    compute_stress_index,
    disclaimers,
)
from diagnostics.explain import _SHAP_AVAILABLE

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


# ─── Helpers ────────────────────────────────────────────────────────────────

def _check_access(manager, machine_code: str, user: CurrentUser) -> None:
    """Mêmes règles de scoping que /explain et /machines."""
    machine_filter = get_machine_filter(user)
    if machine_filter:
        uuid = manager.get_uuid(machine_code)
        if not uuid or uuid != machine_filter:
            raise HTTPException(403, "Accès interdit à cette machine")


def _build_feature_vector(manager, machine_code: str) -> np.ndarray:
    """Reconstruit le vecteur 17-D attendu par le RF à partir de l'état
    courant de l'engine. Réplique exacte de `engine.predict_rul` ligne
    172-181 — sans l'appeler pour rester non-invasif.

    Raises
    ------
    HTTPException(425)  si l'engine n'a pas assez de données (warming-up).
    HTTPException(404)  si la machine n'est pas connue.
    """
    engine = manager.engines.get(machine_code)
    if engine is None:
        raise HTTPException(
            404,
            f"Machine '{machine_code}' inconnue ou non initialisée — "
            f"démarrer le simulateur ou attendre un message MQTT.",
        )

    if engine._last_norm_feats is None:
        raise HTTPException(425, "Données capteurs insuffisantes (no_sensor_data)")

    hi_buf = engine.buffer_hi_smooth
    if len(hi_buf) < hi_buf.maxlen:
        raise HTTPException(
            425,
            f"Buffer HI en phase d'échauffement "
            f"({len(hi_buf)}/{hi_buf.maxlen} min requis)",
        )

    hi_arr = np.array(list(hi_buf), dtype=float)
    hi_now = float(hi_arr[-1])
    hi_mean = float(np.mean(hi_arr))
    hi_std = float(np.std(hi_arr))
    hi_min = float(np.min(hi_arr))
    hi_slope = float(np.polyfit(np.arange(len(hi_arr)), hi_arr, 1)[0])

    return np.concatenate(
        [engine._last_norm_feats, [hi_now, hi_mean, hi_std, hi_min, hi_slope]]
    ).reshape(1, -1)


def _build_diagnose_features(manager, machine_code: str) -> dict:
    """Assemble le dict attendu par `diagnostics.diagnose` à partir de
    last_raw + last_results + buffers. Complète si possible ; valeurs
    manquantes sont juste ignorées par les règles (None-safe)."""
    raw = manager.last_raw.get(machine_code) or {}
    last = manager.last_results.get(machine_code) or {}
    buf = manager.buffers.get(machine_code)
    engine = manager.engines.get(machine_code)

    # Courant RMS : reconstruit depuis la puissance avec même formule que
    # frontend (hooks/useMachines.ts line 24) — P·1000/(√3·400·cosφ).
    p_mean_kw = float(raw.get("power_kw") or 0.0)
    i_rms_a = p_mean_kw * 1000.0 / (math.sqrt(3.0) * 400.0 * 0.80)

    # i_rms_std_1h : std du courant sur les 60 dernières minutes —
    # proxy depuis buf._power (déjà lissé par cycle ascenseur).
    i_rms_std_1h = 0.0
    if buf is not None and len(buf._power) >= 2:
        powers = list(buf._power)
        i_vals = [p * 1000.0 / (math.sqrt(3.0) * 400.0 * 0.80) for p in powers]
        i_rms_std_1h = float(np.std(i_vals))

    # corr_t_p : déjà calculée par buf.compute()
    corr_t_p = 0.0
    if buf is not None and len(buf._tp_pairs) >= 60:
        arr = np.array(list(buf._tp_pairs))
        t_std = float(np.std(arr[:, 0]))
        p_std = float(np.std(arr[:, 1]))
        if t_std > 1e-8 and p_std > 1e-8:
            c = float(np.corrcoef(arr[:, 0], arr[:, 1])[0, 1])
            corr_t_p = 0.0 if math.isnan(c) else c

    # Pente HI sur 24 h : proxy via buffer_hi_smooth (lookback = 60 min)
    # → on convertit la pente /min en pente /24h (×1440).
    hi_slope_24h = 0.0
    if engine is not None and len(engine.buffer_hi_smooth) >= 10:
        hi_arr = np.array(list(engine.buffer_hi_smooth), dtype=float)
        slope_per_min = float(np.polyfit(np.arange(len(hi_arr)), hi_arr, 1)[0])
        hi_slope_24h = slope_per_min * 1440.0

    return {
        "rms_mms": float(raw.get("rms_mms") or 0.0),
        "temp_mot_c": float(raw.get("temp_c") or 0.0),
        "i_rms_a": i_rms_a,
        "i_rms_std_1h": i_rms_std_1h,
        "hi": float(last.get("hi_smooth") or 0.0),
        "hi_slope_24h": hi_slope_24h,
        "corr_t_p": corr_t_p,
        "p_mean_kw": p_mean_kw,
    }


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/disclaimers")
async def get_disclaimers():
    """Texte AI Act Art. 13 — utilisable par l'UI sans authentification.

    Pas de require_auth ici : ces textes sont publics et affichés sur la
    carte « RUL » de la landing. Pas de donnée sensible.
    """
    return {
        "rul_nature": disclaimers.RUL_NATURE,
        "rul_tooltip": disclaimers.RUL_TOOLTIP,
        "calibration_notice": disclaimers.CALIBRATION_NOTICE,
        "model_card": disclaimers.MODEL_CARD,
        "defense_statement": disclaimers.DEFENSE_STATEMENT,
        "badge_labels": disclaimers.BADGE_LABELS,
    }


@router.get("/{machine_code}/rul-interval")
async def rul_with_interval(machine_code: str,
                            user: CurrentUser = Depends(require_auth)):
    """RUL + intervalle de confiance 80 % (percentiles 10/90 des 300 arbres).

    Fondement : Meinshausen (2006) « Quantile Regression Forests », JMLR 7.
    Non paramétrique — aucune hypothèse gaussienne sur la distribution
    d'erreur.
    """
    manager = get_manager()
    _check_access(manager, machine_code, user)

    # Simulator override : si le simulateur a posé un RUL physique, on
    # retourne ses valeurs enrichies du badge mais sans ré-appel modèle.
    override = manager.rul_overrides.get(machine_code)
    if override:
        rul_days = float(override.get("rul_days") or 0.0)
        ci_low = override.get("ci_low")
        ci_high = override.get("ci_high")
        if ci_low is not None and ci_high is not None and rul_days > 0:
            cvi = (float(ci_high) - float(ci_low)) / max(rul_days, 1e-6)
        else:
            cvi = float("inf")
        from diagnostics.rul_confidence import confidence_badge
        badge = confidence_badge(cvi)
        return {
            "machine_code": machine_code,
            "source": "simulator_override",
            "rul_days": rul_days,
            "rul_days_p10": float(ci_low) if ci_low is not None else None,
            "rul_days_p90": float(ci_high) if ci_high is not None else None,
            "cvi": None if math.isinf(cvi) else round(cvi, 4),
            "confidence": badge.value,
            "n_trees": None,
            "status": override.get("status", "ok"),
            "disclaimer": disclaimers.RUL_NATURE,
        }

    try:
        X = _build_feature_vector(manager, machine_code)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("rul-interval feature build error for %s: %s",
                     machine_code, e)
        raise HTTPException(500, "Erreur reconstruction vecteur features")

    try:
        pred = predict_with_interval(manager._rf, X)
    except Exception as e:
        logger.error("rul-interval prediction error for %s: %s", machine_code, e)
        raise HTTPException(500, "Erreur prédiction RUL")

    payload = pred.to_dict()
    payload["machine_code"] = machine_code
    payload["source"] = "random_forest"
    payload["status"] = "ok"
    payload["disclaimer"] = disclaimers.RUL_NATURE
    # Arrondis UI
    for k in ("rul_days", "rul_days_p10", "rul_days_p90",
              "rul_days_p05", "rul_days_p95", "rul_minutes"):
        if isinstance(payload.get(k), float):
            payload[k] = round(payload[k], 1)
    if isinstance(payload.get("cvi"), float) and not math.isinf(payload["cvi"]):
        payload["cvi"] = round(payload["cvi"], 4)
    return payload


@router.get("/{machine_code}/diagnose")
async def diagnose_machine(machine_code: str,
                            user: CurrentUser = Depends(require_auth)):
    """Règles expertes déterministes ISO/IEC/IEEE — 0 % ML, 100 % auditables."""
    manager = get_manager()
    _check_access(manager, machine_code, user)

    if machine_code not in manager.engines:
        raise HTTPException(
            404,
            f"Machine '{machine_code}' sans données — démarrer le simulateur "
            f"ou attendre un message MQTT.",
        )

    features = _build_diagnose_features(manager, machine_code)
    try:
        alerts = diagnose(features)
    except Exception as e:
        logger.error("diagnose error for %s: %s", machine_code, e)
        raise HTTPException(500, "Erreur moteur de règles diagnostic")

    return {
        "machine_code": machine_code,
        "inputs": {k: round(v, 4) if isinstance(v, float) else v
                   for k, v in features.items()},
        "diagnoses": [a.to_dict() for a in alerts],
        "count": len(alerts),
    }


@router.get("/{machine_code}/stress-index")
async def stress_index(machine_code: str,
                       user: CurrentUser = Depends(require_auth)):
    """Indice de Stress instantané (IS) — métrique opérationnelle dérivée
    des seuils ISO/IEC déjà utilisés ailleurs dans le projet.

    Complète HI (usure passée) et RUL (pronostic futur) avec une mesure
    de la sévérité du régime à l'instant t. Recalculé à chaque appel,
    aucune persistance, aucun apprentissage.

    Fondement : ISO 10816-3:2009 (vibration), IEC 60034-1:2017 (thermal,
    service factor), Thomson & Fenger 2001 (variabilité courant).
    Détails complets dans `prediteq_ml/diagnostics/stress.py`.
    """
    manager = get_manager()
    _check_access(manager, machine_code, user)

    if machine_code not in manager.engines:
        raise HTTPException(
            404,
            f"Machine '{machine_code}' sans données — démarrer le simulateur "
            f"ou attendre un message MQTT.",
        )

    # On réutilise l'extracteur de features de `diagnose` : mêmes capteurs,
    # mêmes formules — cohérence garantie entre les deux écrans.
    features = _build_diagnose_features(manager, machine_code)

    try:
        si = compute_stress_index(features)
    except Exception as e:
        logger.error("stress-index error for %s: %s", machine_code, e)
        raise HTTPException(500, "Erreur calcul Stress Index")

    payload = si.to_dict()
    payload["machine_code"] = machine_code
    payload["inputs"] = {
        k: round(v, 4) if isinstance(v, float) else v
        for k, v in features.items()
        if k in {"temp_mot_c", "rms_mms", "i_rms_a", "i_rms_std_1h"}
    }
    return payload


@router.get("/{machine_code}/rul-explain")
async def explain_rul(machine_code: str,
                      user: CurrentUser = Depends(require_auth)):
    """SHAP TreeExplainer sur le RF RUL — distinct de /explain/{code}
    (qui agit sur l'IsolationForest d'anomalie).

    Fondement : Lundberg & Lee (NeurIPS 2017), TreeSHAP exact polynomial.
    """
    if not _SHAP_AVAILABLE:
        raise HTTPException(
            501,
            "SHAP non installé côté serveur — ajouter `shap>=0.45.0` à "
            "requirements.txt.",
        )
    manager = get_manager()
    _check_access(manager, machine_code, user)

    try:
        X = _build_feature_vector(manager, machine_code)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("rul-explain feature build error for %s: %s",
                     machine_code, e)
        raise HTTPException(500, "Erreur reconstruction vecteur features")

    try:
        result = explain_prediction(manager._rf, X, top_k=5, rul_min_to_day=9)
    except Exception as e:
        logger.error("rul-explain SHAP error for %s: %s", machine_code, e)
        raise HTTPException(500, "Erreur calcul SHAP")

    # Sérialiser les dataclass
    result["contributions"] = [c.to_dict() for c in result["contributions"]]
    result["machine_code"] = machine_code
    # Arrondis UI
    for k in ("baseline_days", "prediction_days", "prediction_minutes",
              "other_impact_days"):
        if isinstance(result.get(k), float):
            result[k] = round(result[k], 2)
    for c in result["contributions"]:
        for k in ("value", "shap_value_min", "impact_days"):
            if isinstance(c.get(k), float):
                c[k] = round(c[k], 4)
    return result


@router.get("/{machine_code}/all")
async def diagnostics_all(machine_code: str,
                           user: CurrentUser = Depends(require_auth)):
    """Agrégat : RUL-IC + diagnose + SHAP + disclaimers en une requête.

    Idéal pour le composant frontend `DiagnosticsPanel` : 1 seul appel,
    réduit la latence et les round-trips réseau. Les sous-endpoints
    restent utilisables séparément pour les usages ciblés.
    """
    manager = get_manager()
    _check_access(manager, machine_code, user)

    response: dict = {
        "machine_code": machine_code,
        "rul_interval": None,
        "diagnose": None,
        "rul_explain": None,
        "stress_index": None,
        "disclaimers": {
            "rul_nature": disclaimers.RUL_NATURE,
            "calibration_notice": disclaimers.CALIBRATION_NOTICE,
            "badge_labels": disclaimers.BADGE_LABELS,
        },
        "errors": {},
    }

    # 1. RUL interval
    try:
        response["rul_interval"] = await rul_with_interval(machine_code, user)
    except HTTPException as e:
        response["errors"]["rul_interval"] = {
            "status_code": e.status_code, "detail": e.detail,
        }

    # 2. Diagnose
    try:
        response["diagnose"] = await diagnose_machine(machine_code, user)
    except HTTPException as e:
        response["errors"]["diagnose"] = {
            "status_code": e.status_code, "detail": e.detail,
        }

    # 3. SHAP
    try:
        response["rul_explain"] = await explain_rul(machine_code, user)
    except HTTPException as e:
        response["errors"]["rul_explain"] = {
            "status_code": e.status_code, "detail": e.detail,
        }

    # 4. Stress Index — métrique instantanée additive (HI = passé,
    #    RUL = futur, SI = présent). Sans dépendance ML, ne devrait
    #    jamais échouer hors absence totale de capteurs.
    try:
        response["stress_index"] = await stress_index(machine_code, user)
    except HTTPException as e:
        response["errors"]["stress_index"] = {
            "status_code": e.status_code, "detail": e.detail,
        }

    return response
