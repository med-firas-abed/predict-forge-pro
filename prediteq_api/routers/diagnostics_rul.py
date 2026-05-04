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
from core.demo_context import get_surfaceable_demo_reference_prediction
from core.supabase_client import get_supabase
from ml.engine_manager import get_manager


def _get_machine_from_supabase(machine_code: str) -> dict:
    """Fallback : lit l'état persisté de la machine depuis Supabase quand
    l'engine n'a pas (encore) de données live en mémoire.

    Pourquoi ce fallback : le scheduler écrit toutes les 60s `hi_courant`
    et `rul_courant` dans Supabase à partir de l'engine. Si l'engine est
    vide (simulateur arrêté, redémarrage API, etc.), `manager.last_results`
    est None et la page Diagnostics affichait "Données indisponibles" alors
    que le tableau de bord montrait toujours les dernières valeurs persistées.

    Avec ce fallback, **les deux pages affichent les mêmes valeurs** —
    UNE SEULE source de vérité, cohérence garantie pour le jury.

    Retourne {} si la machine est inconnue ou si Supabase échoue.
    """
    try:
        sb = get_supabase()
        res = sb.table("machines").select(
            "code, hi_courant, rul_courant, statut, derniere_maj"
        ).eq("code", machine_code).limit(1).execute()
        rows = res.data or []
        return rows[0] if rows else {}
    except Exception:
        return {}

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
    # RUL v2.1 — calibration layer (FPT + observed rate + ISO 281)
    # Note : multiplicateurs zone-conditionnels retirés (v2.1) — voir
    # rul_calibration.py docstring pour la justification complète.
    should_show_rul,
    convert_min_to_days,
    l10_adjusted_years,
    hi_to_zone,
    P_NOMINAL_KW,
    L10_NOMINAL_YEARS,
    FPT_HI_THRESHOLD,
    CYCLES_PER_SIM_MIN,
    MAINTENANCE_WINDOW,
)
from diagnostics.explain import _SHAP_AVAILABLE
from diagnostics.rul_confidence import confidence_badge

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
            f"Machine '{machine_code}' non initialisée — "
            f"synchronisation des données en cours.",
        )

    if engine._last_norm_feats is None:
        raise HTTPException(425, "Synchronisation des données en cours")

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
            f"Machine '{machine_code}' sans données — "
            f"synchronisation des données en cours.",
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
            f"Machine '{machine_code}' sans données — "
            f"synchronisation des données en cours.",
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

    # Utilise le facteur observé (rythme machine 7 j) plutôt que ÷9 figé,
    # pour cohérence avec /rul-v2. Fallback sur 9 si rythme indisponible.
    cpd = manager.get_cycles_per_day(machine_code)
    from diagnostics import observed_factor as _observed_factor
    factor_obs, _ = _observed_factor(cpd)
    try:
        result = explain_prediction(
            manager._rf, X, top_k=5, rul_min_to_day=factor_obs
        )
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


# ─── RUL v2 — FPT + observed rate + adjusted L10 ────────────────────────────

def _build_l10_block(manager, machine_code: str) -> dict:
    """Compute L10 reference for this machine — always available, even when
    the RF prediction is hidden by FPT or unavailable due to warm-up."""
    p_obs = manager.get_power_avg_30j(machine_code)
    res = l10_adjusted_years(p_obs)
    return {
        "years_adjusted": res["years"],
        "p_observed_kw": res["p_observed_kw"],
        "p_nominal_kw": res["p_nominal_kw"],
        "source": res["source"],
        "reference": "ISO 281:2007 §7 — cube law on equivalent dynamic load",
        "bearing_model": "SKF 6306",
        "l10_nominal_years": L10_NOMINAL_YEARS,
    }


def _build_disclaimers_v2() -> dict:
    """Static disclaimer strings for the v2 widget. UI-friendly, sourced.

    v2.1 : retrait de la disclaimer 'industry_calibration' qui annonçait
    une dérivation inexistante depuis NEMA MG-1 / ISO 13374 / SAE JA1011.
    Les multiplicateurs zone-conditionnels ont été supprimés du module
    rul_calibration.py — voir la docstring de ce module pour la
    justification complète du choix méthodologique.
    """
    return {
        "fpt_gate": (
            "Tant que le HI est ≥ 0.80 (zone Excellent ISO 10816-3), aucun "
            "pronostic chiffré n'est publié. La référence affichée est la "
            "durée de vie statistique du roulement, conforme IEEE Std "
            "1856-2017 §6.2."
        ),
        "rate_basis": (
            "La projection en jours est dérivée du rythme d'usage observé "
            "(moyenne 7 jours glissants). Si l'utilisation change "
            "(congés, montée en charge), l'estimation se met à jour "
            "automatiquement."
        ),
        "l10_basis": (
            "La durée de vie de référence du roulement (SKF 6306, ISO 281 "
            "§7.1, formule du cube avec C=22.5 kN, n=23.5 RPM, P estimée "
            "à 7 kN) est ajustée à la charge moyenne mesurée sur 30 jours. "
            "Sensibilité ±20% sur P → facteur 1.95 sur L10."
        ),
        "warm_up": (
            "Période de calibration en cours : moins de 7 jours de données "
            "d'usage observé. Le facteur de conversion par défaut (÷9, "
            "convention dataset synthétique 800 sim-min ↔ 90 jours) est "
            "utilisé en attendant."
        ),
        "model_scope": (
            "Le RUL chiffré reflète exactement la sortie du Random Forest, "
            "sans multiplicateur zone-conditionnel. Aucune extrapolation "
            "hors plage d'entraînement n'est appliquée — l'incertitude "
            "(IC 80%) augmente automatiquement quand on s'éloigne du "
            "domaine de validité."
        ),
    }


def _wide_interval_for_zone(
    zone_name: str,
    conv_p05: dict,
    conv_p10: dict,
    conv_p90: dict,
    conv_p95: dict,
) -> tuple[float | None, float | None, str | None]:
    """Select the display interval by HI band.

    Good zone (0.60-0.80): widen the displayed interval for prudence.
    Degraded/Critical zones: keep the standard IC80% display.
    """
    if zone_name == "Good":
        return conv_p05["rul_days"], conv_p95["rul_days"], "IC 90 %"
    return conv_p10["rul_days"], conv_p90["rul_days"], "IC 80 %"


def build_rul_v2_response(manager, machine_code: str) -> dict:
    """Compute the FPT-aware RUL payload used by Diagnostics and summaries."""
    # ── 1. État courant de la machine ────────────────────────────────────
    last = manager.last_results.get(machine_code) or {}
    hi = last.get("hi_smooth")
    zone = last.get("zone")
    rul_persisted_days = None

    if hi is None:
        sb_row = _get_machine_from_supabase(machine_code)
        if sb_row.get("hi_courant") is not None:
            hi = float(sb_row["hi_courant"])
            zone = hi_to_zone(hi)
            if sb_row.get("rul_courant") is not None:
                rul_persisted_days = int(sb_row["rul_courant"])

    # ── 2. L10 + disclaimers : toujours présents dans le payload ────────
    l10_block = _build_l10_block(manager, machine_code)
    disc = _build_disclaimers_v2()
    zone_name = hi_to_zone(hi)

    base_response: dict = {
        "machine_code": machine_code,
        "hi_current": hi,
        "zone": zone,
        "l10": l10_block,
        "disclaimers": disc,
    }
    reference_prediction = get_surfaceable_demo_reference_prediction(machine_code)

    # ── 3. FPT gate ──────────────────────────────────────────────────────
    if not should_show_rul(hi):
        return {
            **base_response,
            "mode": "no_prediction",
            "prediction": None,
            "reference_prediction": None,
            "maintenance_window": MAINTENANCE_WINDOW.get(
                zone_name, MAINTENANCE_WINDOW["Unknown"]
            ),
            "fpt_threshold": FPT_HI_THRESHOLD,
        }

    # ── 4. Construire le vecteur 17-D pour le RF (warm-up gracieux) ──────
    try:
        X = _build_feature_vector(manager, machine_code)
    except HTTPException as e:
        if e.status_code == 425:
            if rul_persisted_days is not None and rul_persisted_days > 0:
                return {
                    **base_response,
                    "mode": "prediction",
                    "prediction": {
                        "rul_days": rul_persisted_days,
                        "rul_days_p10": None,
                        "rul_days_p90": None,
                        "rul_days_display_low": None,
                        "rul_days_display_high": None,
                        "display_interval_label": None,
                        "cycles_remaining": int(rul_persisted_days * 654),
                        "cycles_per_day_observed": None,
                        "factor_used": 9.0,
                        "factor_source": "calibration_default",
                        "cycles_per_sim_min": CYCLES_PER_SIM_MIN,
                        "hi_zone": zone_name,
                        "maintenance_window": MAINTENANCE_WINDOW.get(
                            zone_name, MAINTENANCE_WINDOW["Unknown"]
                        ),
                        "rul_min_simulator": rul_persisted_days * 9,
                        "rul_min_p10": None,
                        "rul_min_p90": None,
                        "n_trees": None,
                        "cvi": None,
                        "confidence": "medium",
                        "stop_recommended": zone_name == "Critical",
                    },
                    "reference_prediction": None,
                    "fpt_threshold": FPT_HI_THRESHOLD,
                }
            return {
                **base_response,
                "mode": "warming_up",
                "prediction": None,
                "reference_prediction": reference_prediction,
                "maintenance_window": MAINTENANCE_WINDOW.get(
                    zone_name, MAINTENANCE_WINDOW["Unknown"]
                ),
                "warming_up_detail": e.detail,
            }
        raise

    # ── 5. Prédiction RF en minutes-simulation (300 arbres) ──────────────
    try:
        tree_preds = np.array(
            [t.predict(X)[0] for t in manager._rf.estimators_]
        )
        rul_min_mean = float(np.mean(tree_preds))
        rul_min_p05 = float(np.percentile(tree_preds, 5))
        rul_min_p10 = float(np.percentile(tree_preds, 10))
        rul_min_p90 = float(np.percentile(tree_preds, 90))
        rul_min_p95 = float(np.percentile(tree_preds, 95))
        n_trees = int(len(tree_preds))
    except Exception as e:
        logger.error("rul-v2 RF prediction error for %s: %s", machine_code, e)
        raise HTTPException(500, "Erreur prédiction RUL (Random Forest)")

    # ── 6. Conversion par rythme observé (sim-min → jours + cycles) ──────
    cpd = manager.get_cycles_per_day(machine_code)
    conv_mean = convert_min_to_days(rul_min_mean, cpd)
    conv_p05 = convert_min_to_days(rul_min_p05, cpd)
    conv_p10 = convert_min_to_days(rul_min_p10, cpd)
    conv_p90 = convert_min_to_days(rul_min_p90, cpd)
    conv_p95 = convert_min_to_days(rul_min_p95, cpd)
    display_low, display_high, display_label = _wide_interval_for_zone(
        zone_name, conv_p05, conv_p10, conv_p90, conv_p95
    )

    # ── 7. Coefficient of Variation Interval + badge confiance ───────────
    if rul_min_mean > 1e-6:
        cvi = (rul_min_p90 - rul_min_p10) / rul_min_mean
        badge = confidence_badge(cvi)
        cvi_value = round(cvi, 4)
    else:
        from diagnostics.rul_confidence import ConfidenceLevel
        badge = ConfidenceLevel.LOW
        cvi_value = None

    # ── 8. Payload final mode "prediction" ───────────────────────────────
    return {
        **base_response,
        "mode": "prediction",
        "prediction": {
            "rul_days": conv_mean["rul_days"],
            "rul_days_p10": conv_p10["rul_days"],
            "rul_days_p90": conv_p90["rul_days"],
            "rul_days_display_low": display_low,
            "rul_days_display_high": display_high,
            "display_interval_label": display_label,
            "cycles_remaining": conv_mean["cycles_remaining"],
            "cycles_per_day_observed": conv_mean["cycles_per_day_observed"],
            "factor_used": conv_mean["factor_used"],
            "factor_source": conv_mean["source"],
            "cycles_per_sim_min": CYCLES_PER_SIM_MIN,
            "hi_zone": zone_name,
            "maintenance_window": MAINTENANCE_WINDOW.get(
                zone_name, MAINTENANCE_WINDOW["Unknown"]
            ),
            "rul_min_simulator": round(rul_min_mean, 1),
            "rul_min_p10": round(rul_min_p10, 1),
            "rul_min_p90": round(rul_min_p90, 1),
            "n_trees": n_trees,
            "cvi": cvi_value,
            "confidence": badge.value,
            "stop_recommended": zone_name == "Critical",
        },
        "reference_prediction": None,
        "fpt_threshold": FPT_HI_THRESHOLD,
    }


@router.get("/{machine_code}/rul-v2")
async def rul_v2(machine_code: str,
                  user: CurrentUser = Depends(require_auth)):
    """RUL v2 — FPT-conditional + observed-rate + L10 reference.

    Compose trois pratiques PHM industrielles :
      1. FPT (First Predicting Time, IEEE 1856-2017 §6.2) — pas de
         pronostic chiffré tant que HI ≥ 0.80 (zone Excellent ISO 10816-3).
      2. Conversion sim-min → jours par rythme d'usage observé
         (Saxena & Goebel 2008, NASA CMAPSS) — au lieu d'un facteur figé.
      3. Référence L10 ajustée à la charge réelle (ISO 281:2007 cube law)
         — affichée systématiquement pour calibrer les attentes.

    Le Random Forest reste l'unique source de pronostic. Cet endpoint ne
    fait QUE traduire sa sortie pour l'utilisateur final.

    Modes du payload :
      - "no_prediction" : HI ≥ 0.80, FPT bloque l'affichage chiffré
      - "warming_up"    : engine n'a pas encore 60 min d'historique HI
      - "prediction"    : RUL chiffré + cycles + IC80 + L10 + disclaimers
    """
    manager = get_manager()
    _check_access(manager, machine_code, user)
    return build_rul_v2_response(manager, machine_code)


# ─── Endpoint agrégé /all ───────────────────────────────────────────────────

@router.get("/{machine_code}/all")
async def diagnostics_all(machine_code: str,
                           user: CurrentUser = Depends(require_auth)):
    """Agrégat : RUL-IC + diagnose + SHAP + stress + RUL-v2 + disclaimers.

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
        "rul_v2": None,
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

    # 5. RUL v2 — FPT + observed rate + L10. Toujours présent (jamais 425
    #    au niveau de l'endpoint — les modes warming_up et no_prediction
    #    sont gérés en interne).
    try:
        response["rul_v2"] = await rul_v2(machine_code, user)
    except HTTPException as e:
        response["errors"]["rul_v2"] = {
            "status_code": e.status_code, "detail": e.detail,
        }

    return response
