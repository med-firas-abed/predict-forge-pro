"""
diagnostics.demo — Démonstration end-to-end des 5 améliorations
═══════════════════════════════════════════════════════════════════════════════

Script autonome exécutable qui charge le Random Forest entraîné
(models/random_forest_rul.pkl) et applique les 5 briques de diagnostic sur
des scénarios représentatifs tirés des vraies trajectoires du dataset.

N'ÉCRIT RIEN, NE MODIFIE RIEN. Affiche juste le résultat dans le terminal
pour que tu puisses :
  - vérifier que tout fonctionne bien ensemble ;
  - copier-coller les sorties dans la soutenance / le rapport ;
  - convaincre l'encadrant en direct sur PC au moment de la défense.

USAGE
─────
    cd /chemin/vers/pfe_MIME_26
    python -m prediteq_ml.diagnostics.demo

ou équivalent depuis la racine du projet :
    python prediteq_ml/diagnostics/demo.py

PRÉ-REQUIS
──────────
    - random_forest_rul.pkl présent dans prediteq_ml/models/
    - shap>=0.45.0 installé (déjà dans prediteq_api/requirements.txt)
    - scikit-learn, numpy, pandas, joblib (déjà dans prediteq_api/)

Sortie attendue : 3 scénarios (SAIN, DÉGRADATION DÉBUTANTE, DÉFAILLANCE
PROCHE) affichés avec les 5 briques pour chacun.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Permet `python prediteq_ml/diagnostics/demo.py` depuis la racine
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import numpy as np

from prediteq_ml.diagnostics import (
    predict_with_interval,
    diagnose,
    explain_prediction,
    disclaimers,
    FEATURE_NAMES,
)
from prediteq_ml.diagnostics.explain import format_explanation_text


# ──────────────────────────────────────────────────────────────────────────────
# Scénarios pré-construits — valeurs de features synthétiques MAIS réalistes
# (tirées de l'ordre de grandeur des vraies features.csv post-step2).
# ──────────────────────────────────────────────────────────────────────────────
SCENARIOS = [
    {
        "name": "SCÉNARIO 1 — Machine saine (ASC-A1 en temps normal)",
        "sensor_features": [
            # rms_mms_norm, drms_dt_norm, rms_variability_norm,
            0.10, 0.02, 0.05,
            # p_mean_kw_norm, p_rms_kw_norm, dp_dt_norm,
            0.15, 0.18, 0.01,
            # e_cycle_kwh_norm, duration_ratio_norm,
            0.20, 1.00,
            # t_mean_c_norm, dt_dt_norm, hr_std_norm, corr_t_p_norm
            0.35, 0.00, 0.10, 0.85,
        ],
        # 5 résumés HI
        "hi_now": 0.92, "hi_mean": 0.93, "hi_std": 0.01,
        "hi_min": 0.90, "hi_slope": -0.0002,
        # Features physiques (non normalisées) pour le module diagnose
        "raw_features": {
            "rms_mms": 1.2, "temp_mot_c": 65, "i_rms_a": 4.85,
            "i_rms_std_1h": 0.06, "hi": 0.92, "hi_slope_24h": -0.003,
            "corr_t_p": 0.85, "p_mean_kw": 1.45,
        },
    },
    {
        "name": "SCÉNARIO 2 — Dégradation débutante (cas observé à 82 % HI)",
        "sensor_features": [
            0.40, 0.15, 0.25,
            0.40, 0.45, 0.08,
            0.45, 1.02,
            0.55, 0.05, 0.18, 0.62,
        ],
        "hi_now": 0.82, "hi_mean": 0.83, "hi_std": 0.02,
        "hi_min": 0.81, "hi_slope": -0.0008,
        "raw_features": {
            "rms_mms": 3.2, "temp_mot_c": 72, "i_rms_a": 4.78,
            "i_rms_std_1h": 0.22, "hi": 0.82, "hi_slope_24h": -0.018,
            "corr_t_p": 0.55, "p_mean_kw": 1.68,
        },
    },
    {
        "name": "SCÉNARIO 3 — Défaillance proche (inspection sous 72 h)",
        "sensor_features": [
            0.75, 0.35, 0.55,
            0.70, 0.72, 0.25,
            0.75, 1.05,
            0.80, 0.20, 0.28, 0.25,
        ],
        "hi_now": 0.38, "hi_mean": 0.42, "hi_std": 0.04,
        "hi_min": 0.35, "hi_slope": -0.0050,
        "raw_features": {
            "rms_mms": 5.8, "temp_mot_c": 88, "i_rms_a": 5.10,
            "i_rms_std_1h": 0.85, "hi": 0.38, "hi_slope_24h": -0.072,
            "corr_t_p": 0.22, "p_mean_kw": 2.05,
        },
    },
]


def _build_feature_vector(sc: dict) -> np.ndarray:
    """Assemble le vecteur 17-D attendu par le RF dans l'ordre de step5."""
    vec = list(sc["sensor_features"])
    vec.extend([sc["hi_now"], sc["hi_mean"], sc["hi_std"],
                sc["hi_min"], sc["hi_slope"]])
    assert len(vec) == 17
    return np.array(vec, dtype=float)


# ──────────────────────────────────────────────────────────────────────────────
# Rendu des 5 briques par scénario
# ──────────────────────────────────────────────────────────────────────────────
def run_scenario(model, sc: dict, has_shap: bool) -> None:
    print("\n" + "═" * 78)
    print(sc["name"])
    print("═" * 78)
    X = _build_feature_vector(sc).reshape(1, -1)

    # ── Brique 1+2 : RUL + IC + badge ─────────────────────────────────────
    pred = predict_with_interval(model, X)
    badge_icon = {"high": "✓", "medium": "~", "low": "!"}[pred.confidence.value]

    print(f"\n  ┌─ RUL ESTIMÉ (items 1 + 2) ───────────────────────────┐")
    print(f"  │  Moyenne (300 arbres)  : {pred.rul_days:>6.1f} jours")
    print(f"  │  Intervalle de conf. 80 % : {pred.format_ui():>10}")
    print(f"  │  CVI (dispersion rel.) : {pred.cvi:>6.3f}")
    print(f"  │  Badge                 : [{badge_icon}] "
          f"{pred.confidence.value.upper()}")
    print(f"  │  Nombre d'arbres       : {pred.n_trees}")
    print(f"  └──────────────────────────────────────────────────────┘")

    # ── Brique 3 : disclaimer ─────────────────────────────────────────────
    print(f"\n  ┌─ DISCLAIMER UI (item 3) ─────────────────────────────┐")
    print(f"  │  {disclaimers.RUL_NATURE}")
    print(f"  └──────────────────────────────────────────────────────┘")

    # ── Brique 4 : diagnostic expert ──────────────────────────────────────
    print(f"\n  ┌─ DIAGNOSTIC (item 4) ────────────────────────────────┐")
    alerts = diagnose(sc["raw_features"])
    for a in alerts:
        icon = {"critical": "🔴", "warning": "🟡", "info": "🟢"}[a.severity.value]
        print(f"  │  {icon} [{a.code:<15}] {a.cause}")
        print(f"  │     {a.detail}")
        print(f"  │     → {a.action}")
        print(f"  │     refs : {', '.join(a.refs)}")
    print(f"  └──────────────────────────────────────────────────────┘")

    # ── Brique 5 : SHAP ───────────────────────────────────────────────────
    if has_shap:
        try:
            result = explain_prediction(model, X, top_k=5, rul_min_to_day=9)
            print(f"\n  ┌─ EXPLICATION SHAP (item 5) ──────────────────────────┐")
            text = format_explanation_text(result)
            for line in text.splitlines():
                print(f"  {line}")
            print(f"  └──────────────────────────────────────────────────────┘")
        except Exception as e:
            print(f"\n  [SHAP] erreur : {e}")
    else:
        print(f"\n  [SHAP] ignoré (shap non installé dans cet env)")


def main() -> int:
    try:
        import joblib
    except ImportError:
        print("✗ joblib non installé. `pip install joblib`")
        return 1

    model_path = ROOT / "prediteq_ml" / "models" / "random_forest_rul.pkl"
    if not model_path.exists():
        print(f"✗ Pickle introuvable : {model_path}")
        print("  Lancer d'abord : python prediteq_ml/steps/step5_rul_model.py")
        return 1

    print(f"Chargement du modèle : {model_path}")
    model = joblib.load(model_path)
    print(f"  → {type(model).__name__} avec {len(model.estimators_)} arbres")

    try:
        import shap  # noqa: F401
        has_shap = True
    except ImportError:
        has_shap = False
        print("  → shap non installé — brique 5 sera ignorée")

    print("\n" + "▓" * 78)
    print("  DÉMO prediteq_ml.diagnostics — 5 améliorations en action")
    print("▓" * 78)

    for sc in SCENARIOS:
        run_scenario(model, sc, has_shap)

    print("\n" + "▓" * 78)
    print("  FIN DE DÉMO — pour intégration API, voir diagnostics/README.md")
    print("▓" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
