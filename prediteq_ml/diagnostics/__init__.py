"""
prediteq_ml.diagnostics
═══════════════════════════════════════════════════════════════════════════════
Module complémentaire du pipeline PrediTeq — n'écrase rien du pipeline existant.

Contient les cinq briques d'amélioration documentées dans
   final_report/annexes/amelioration_diagnostics.md :

    1. rul_confidence.predict_with_interval  — RUL ± IC 80 % (items 1 + 2)
    2. rul_confidence.confidence_badge       — badge vert/orange/rouge
    3. disclaimers                           — textes UI de transparence (item 3)
    4. diagnose.diagnose                     — règles expertes (item 4)
    5. explain.explain_prediction            — attribution SHAP (item 5)
    6. stress.compute_stress_index           — index de stress composite
    7. rul_calibration                       — couche FPT + rythme + L10 (v2)

Chaque sous-module est autonome : aucune modification des fichiers existants
(step1…step7, config.py, prediteq_api/*, prediteq_frontend/*). L'intégration
dans l'API est documentée dans README.md et fait l'objet d'un chapitre
« Perspectives » du mémoire.

Références scientifiques globales :
    - Meinshausen (2006), « Quantile Regression Forests », JMLR 7
    - IEEE 1856-2017, « Prognostics for Systems »
    - Lundberg & Lee (NeurIPS 2017), « A Unified Approach to Interpreting
      Model Predictions »
    - ISO 10816-3:2009, « Mechanical vibration — Evaluation by measurements on
      non-rotating parts »
    - IEC 60034-1:2017, « Rotating electrical machines — Rating and performance »
    - ISO 281:2007, « Roulements — Charges dynamiques de base et durée nominale »
    - Lei et al. (2018), « Machinery health prognostics: a systematic review »,
      MSSP 104:799-834
    - Saxena & Goebel (2008), NASA CMAPSS run-to-failure benchmark

Auteur : Firas Zouari — ISAMM PFE 2026
"""
from .rul_confidence import (
    predict_with_interval,
    confidence_badge,
    RulPrediction,
    ConfidenceLevel,
)
from .diagnose import diagnose, Diagnosis, SeverityLevel
from .explain import explain_prediction, ShapContribution, FEATURE_NAMES
from .stress import (
    compute_stress_index,
    StressIndex,
    StressBand,
    StressComponents,
)
from .rul_calibration import (
    should_show_rul,
    observed_factor,
    convert_min_to_days,
    l10_adjusted_years,
    hi_to_zone,
    ConversionResult,
    L10Result,
    ConversionSource,
    L10Source,
    ANCHOR_CYCLES_PER_DAY,
    DEFAULT_FACTOR,
    CYCLES_PER_SIM_MIN,
    P_NOMINAL_KW,
    L10_NOMINAL_YEARS,
    FPT_HI_THRESHOLD,
    MAINTENANCE_WINDOW,
)
from . import disclaimers

__all__ = [
    "predict_with_interval",
    "confidence_badge",
    "RulPrediction",
    "ConfidenceLevel",
    "diagnose",
    "Diagnosis",
    "SeverityLevel",
    "explain_prediction",
    "ShapContribution",
    "FEATURE_NAMES",
    "compute_stress_index",
    "StressIndex",
    "StressBand",
    "StressComponents",
    # RUL v2 calibration layer (FPT + observed rate + ISO 281)
    # Note : INDUSTRY_TIME_MULTIPLIER retiré (v2.1) — incompatible avec le
    # principe FPT « ne prédire que ce que le modèle a vu » (IEEE 1856-2017).
    "should_show_rul",
    "observed_factor",
    "convert_min_to_days",
    "l10_adjusted_years",
    "hi_to_zone",
    "ConversionResult",
    "L10Result",
    "ConversionSource",
    "L10Source",
    "ANCHOR_CYCLES_PER_DAY",
    "DEFAULT_FACTOR",
    "CYCLES_PER_SIM_MIN",
    "P_NOMINAL_KW",
    "L10_NOMINAL_YEARS",
    "FPT_HI_THRESHOLD",
    "MAINTENANCE_WINDOW",
    "disclaimers",
]

__version__ = "2.1.0"  # 2.1 : retrait ITC, dérivation L10 ISO 281 explicite
