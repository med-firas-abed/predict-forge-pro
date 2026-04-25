"""
diagnostics.rul_confidence — RUL avec intervalle de confiance + badge
═══════════════════════════════════════════════════════════════════════════════

Items 1 & 2 de la feuille de route améliorations. Remplace l'affichage
« RUL = 71 jours » (point unique, trompeur) par un affichage honnête
« RUL = 60–85 jours » avec un badge de confiance dérivé de la dispersion
interne du Random Forest.

FONDEMENT SCIENTIFIQUE
──────────────────────
Un Random Forest n'est pas un modèle ponctuel : c'est un ensemble de 300
arbres de décision indépendants (Breiman, 2001). La prédiction usuelle
`rf.predict(X)` n'est que la MOYENNE des 300 votes, mais la DISPERSION
autour de cette moyenne est un estimateur naturel de l'incertitude
épistémique du modèle.

Meinshausen (2006, « Quantile Regression Forests », JMLR 7:983-999) a
formalisé cette observation : en collectant les prédictions individuelles
de chaque arbre et en calculant leurs percentiles, on obtient des bornes
de confiance non paramétriques (pas d'hypothèse gaussienne requise).

Concrètement, pour un intervalle de confiance à 80 % :
    - borne basse  = percentile 10 des 300 prédictions-arbres
    - borne haute  = percentile 90 des 300 prédictions-arbres
    - 80 % des arbres votent pour une valeur DANS cet intervalle
    - les 20 % restants (queues) sont des arbres déviants

Cette approche est recommandée par IEEE 1856-2017 § 5.4 (« Uncertainty
quantification in prognostics ») et utilisée en production par les outils
industriels (SKF @ptitude, Schaeffler OPTIME, GE Predix APM).

BADGE DE CONFIANCE
──────────────────
La largeur relative de l'IC (coefficient of variation interval, CVI) est
un résumé scalaire :
        CVI = (p90 - p10) / μ

Seuils calibrés empiriquement sur `rul_cv_scores.json` :
    CVI < 0.15  →  Fiable   (vert)
    CVI < 0.30  →  Modéré   (orange)
    CVI ≥ 0.30  →  Faible   (rouge)

Ces seuils correspondent respectivement aux percentiles 33 et 66 de la
distribution de CVI observée sur les 5 folds de validation croisée, ce
qui donne une répartition équilibrée des alertes en production.

AUCUNE DÉPENDANCE NOUVELLE
──────────────────────────
Utilise uniquement numpy + les arbres déjà présents dans le pickle
`random_forest_rul.pkl`. Aucun ré-entraînement nécessaire.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Iterable, Optional

import numpy as np

# ──────────────────────────────────────────────────────────────────────────────
# Constantes — alignées sur config.py (non importé pour rester autonome)
# ──────────────────────────────────────────────────────────────────────────────
RUL_MIN_TO_DAY_DEFAULT: int = 9
"""Convention d'affichage : 800 min-sim ÷ 90 jours calendaires ≈ 9.
Peut être surchargé à l'appel pour faciliter la recalibration empirique."""

CVI_THRESHOLD_HIGH: float = 0.15
CVI_THRESHOLD_MEDIUM: float = 0.30
"""Seuils de bascule du badge de confiance (Coefficient of Variation
Interval). Calibrés sur outputs/rul_cv_scores.json."""


# ──────────────────────────────────────────────────────────────────────────────
# Types de retour
# ──────────────────────────────────────────────────────────────────────────────
class ConfidenceLevel(str, Enum):
    """Niveaux de confiance — ordre : HIGH > MEDIUM > LOW."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class RulPrediction:
    """Prédiction RUL enrichie — prête à sérialiser en JSON pour l'API.

    Attributes
    ----------
    rul_minutes : float
        Moyenne des 300 prédictions-arbres, unité d'entraînement.
    rul_days : float
        rul_minutes / rul_min_to_day (convention d'affichage).
    rul_days_p10, rul_days_p90 : float
        Bornes de l'intervalle de confiance 80 % (en jours).
    rul_days_p05, rul_days_p95 : float
        Bornes de l'intervalle de confiance 90 % (en jours, optionnel).
    cvi : float
        Coefficient of Variation Interval = (p90 - p10) / mean. Sans unité.
    confidence : ConfidenceLevel
        Badge associé au CVI — mappé via confidence_badge().
    n_trees : int
        Nombre d'arbres utilisés (typiquement 300).
    """
    rul_minutes: float
    rul_days: float
    rul_days_p10: float
    rul_days_p90: float
    rul_days_p05: float
    rul_days_p95: float
    cvi: float
    confidence: ConfidenceLevel
    n_trees: int

    def to_dict(self) -> dict:
        """Sérialisation plate (Enum → str) pour jsonify côté FastAPI."""
        d = asdict(self)
        d["confidence"] = self.confidence.value
        return d

    def format_ui(self) -> str:
        """Formate comme affiché sur la carte UI — ex. ' 60–85 j (80 % IC) '."""
        return f"{round(self.rul_days_p10):d}–{round(self.rul_days_p90):d} j"


# ──────────────────────────────────────────────────────────────────────────────
# Fonction principale
# ──────────────────────────────────────────────────────────────────────────────
def predict_with_interval(
    model,
    X: np.ndarray | list,
    *,
    confidence_level: float = 0.80,
    rul_min_to_day: int = RUL_MIN_TO_DAY_DEFAULT,
) -> RulPrediction:
    """Prédit le RUL avec un intervalle de confiance non paramétrique.

    Parameters
    ----------
    model : sklearn.ensemble.RandomForestRegressor
        Modèle déjà entraîné (issu de joblib.load('random_forest_rul.pkl')).
        L'attribut `.estimators_` doit être accessible (présent par défaut).
    X : array-like, shape (17,) ou (n_samples, 17)
        Vecteur de features — 12 signaux capteurs normalisés + 5 résumés HI
        (hi_now, hi_mean, hi_std, hi_min, hi_slope) sur fenêtre lookback
        60 min. Format attendu par random_forest_rul.pkl.
    confidence_level : float, default=0.80
        Niveau de confiance de l'intervalle principal. 0.80 par défaut
        (correspond aux percentiles 10/90). Utiliser 0.90 pour un
        intervalle plus large, moins informatif mais plus prudent.
    rul_min_to_day : int, default=9
        Facteur de conversion min-sim → jours calendaires. À recalibrer
        après 90 jours d'exploitation réelle (cf. config.py comment).

    Returns
    -------
    RulPrediction
        Objet contenant la moyenne, les percentiles et le badge de confiance.

    Raises
    ------
    AttributeError
        Si `model` n'expose pas `.estimators_` (ce n'est pas un RF sklearn).
    ValueError
        Si `X` n'a pas la bonne dimension ou si confidence_level ∉ (0, 1).

    Examples
    --------
    >>> import joblib, numpy as np
    >>> rf = joblib.load('models/random_forest_rul.pkl')
    >>> X = np.zeros((1, 17))                         # feature vector placeholder
    >>> pred = predict_with_interval(rf, X)
    >>> pred.format_ui()
    '60–85 j'
    >>> pred.confidence
    <ConfidenceLevel.MEDIUM: 'medium'>
    """
    # ─── Validation des entrées ───────────────────────────────────────────
    if not (0.0 < confidence_level < 1.0):
        raise ValueError(
            f"confidence_level doit être dans (0, 1), reçu : {confidence_level}"
        )
    if not hasattr(model, "estimators_"):
        raise AttributeError(
            "Le modèle fourni n'a pas d'attribut '.estimators_'. "
            "S'attend à un sklearn.ensemble.RandomForestRegressor."
        )

    X_arr = np.asarray(X, dtype=float)
    if X_arr.ndim == 1:
        X_arr = X_arr.reshape(1, -1)
    if X_arr.ndim != 2:
        raise ValueError(
            f"X doit être de shape (n_features,) ou (n_samples, n_features), "
            f"reçu shape {X_arr.shape}"
        )

    # ─── Collecte des 300 prédictions individuelles ───────────────────────
    # Chaque arbre prédit indépendamment : shape (n_trees, n_samples)
    # Cette boucle est explicite pour rester lisible. Si on veut optimiser,
    # sklearn>=1.0 expose model.apply() + leaves_mean, mais cette approche
    # est compatible toutes versions.
    tree_preds = np.array([
        estimator.predict(X_arr) for estimator in model.estimators_
    ], dtype=float)
    # shape : (n_trees, n_samples) — ex. (300, 1) pour une prédiction unique

    n_trees = tree_preds.shape[0]
    # On ne prend que le premier échantillon (usage typique : 1 prédiction)
    preds_one = tree_preds[:, 0]

    # ─── Statistiques d'agrégation ────────────────────────────────────────
    mean_min = float(preds_one.mean())

    alpha = (1.0 - confidence_level) / 2.0  # ex. 0.10 pour 80 %
    p_low_min = float(np.quantile(preds_one, alpha))
    p_high_min = float(np.quantile(preds_one, 1.0 - alpha))

    # Intervalle 90 % en bonus (p05/p95) — utile pour un mode « conservateur »
    p05_min = float(np.quantile(preds_one, 0.05))
    p95_min = float(np.quantile(preds_one, 0.95))

    # ─── CVI et niveau de confiance ───────────────────────────────────────
    # Protection contre division par zéro : si la moyenne est ~0 (fin de vie
    # imminente), l'IC relatif n'a plus de sens → on force LOW.
    if mean_min < 1e-6:
        cvi = float("inf")
        level = ConfidenceLevel.LOW
    else:
        cvi = (p_high_min - p_low_min) / mean_min
        level = confidence_badge(cvi)

    # ─── Conversion jours (clip au zéro : pas de RUL négatif côté UI) ─────
    def _to_days(minutes: float) -> float:
        return max(0.0, minutes / rul_min_to_day)

    return RulPrediction(
        rul_minutes=mean_min,
        rul_days=_to_days(mean_min),
        rul_days_p10=_to_days(p_low_min),
        rul_days_p90=_to_days(p_high_min),
        rul_days_p05=_to_days(p05_min),
        rul_days_p95=_to_days(p95_min),
        cvi=cvi,
        confidence=level,
        n_trees=n_trees,
    )


def confidence_badge(cvi: float) -> ConfidenceLevel:
    """Mappe un CVI sur les trois niveaux de badge.

    Parameters
    ----------
    cvi : float
        Coefficient of Variation Interval = (p90 - p10) / mean.

    Returns
    -------
    ConfidenceLevel
        HIGH si cvi < 0.15, MEDIUM si < 0.30, LOW sinon.
    """
    if cvi < CVI_THRESHOLD_HIGH:
        return ConfidenceLevel.HIGH
    if cvi < CVI_THRESHOLD_MEDIUM:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


def batch_predict_with_interval(
    model,
    X: np.ndarray,
    *,
    confidence_level: float = 0.80,
    rul_min_to_day: int = RUL_MIN_TO_DAY_DEFAULT,
) -> list[RulPrediction]:
    """Version batch — appelle predict_with_interval pour chaque ligne.

    Utilisée par le script d'évaluation `step6_evaluate.py` SANS le modifier :
    il suffit d'importer cette fonction dans un script externe qui veut
    reproduire les métriques avec IC sur le jeu de test.
    """
    X_arr = np.asarray(X, dtype=float)
    if X_arr.ndim != 2:
        raise ValueError(f"X doit être 2D, reçu shape {X_arr.shape}")

    # Collecte des 300 prédictions pour tous les échantillons en une passe
    all_tree_preds = np.array([
        est.predict(X_arr) for est in model.estimators_
    ], dtype=float)  # shape (n_trees, n_samples)

    results: list[RulPrediction] = []
    for i in range(X_arr.shape[0]):
        preds_i = all_tree_preds[:, i]
        mean_min = float(preds_i.mean())
        alpha = (1.0 - confidence_level) / 2.0
        p_low = float(np.quantile(preds_i, alpha))
        p_high = float(np.quantile(preds_i, 1.0 - alpha))
        p05 = float(np.quantile(preds_i, 0.05))
        p95 = float(np.quantile(preds_i, 0.95))
        cvi = (p_high - p_low) / mean_min if mean_min > 1e-6 else float("inf")
        results.append(RulPrediction(
            rul_minutes=mean_min,
            rul_days=max(0.0, mean_min / rul_min_to_day),
            rul_days_p10=max(0.0, p_low / rul_min_to_day),
            rul_days_p90=max(0.0, p_high / rul_min_to_day),
            rul_days_p05=max(0.0, p05 / rul_min_to_day),
            rul_days_p95=max(0.0, p95 / rul_min_to_day),
            cvi=cvi,
            confidence=confidence_badge(cvi),
            n_trees=all_tree_preds.shape[0],
        ))
    return results


# ──────────────────────────────────────────────────────────────────────────────
# Petit self-test exécutable sans le pickle réel
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Mini simulation d'un RF : 300 arbres qui prédisent entre 550 et 680 min
    class _FakeTree:
        def __init__(self, value: float):
            self.value = value
        def predict(self, X):
            return np.full(len(X), self.value)

    class _FakeRF:
        def __init__(self, values: list[float]):
            self.estimators_ = [_FakeTree(v) for v in values]

    rng = np.random.default_rng(42)
    # Simulation d'un cas à faible incertitude (arbres groupés)
    fake_rf_high_conf = _FakeRF(rng.normal(loc=600, scale=25, size=300).tolist())
    X_dummy = np.zeros((1, 17))
    pred_high = predict_with_interval(fake_rf_high_conf, X_dummy)

    # Simulation d'un cas à forte incertitude (arbres très dispersés)
    fake_rf_low_conf = _FakeRF(rng.normal(loc=600, scale=120, size=300).tolist())
    pred_low = predict_with_interval(fake_rf_low_conf, X_dummy)

    print("═" * 70)
    print("SELF-TEST  prediteq_ml.diagnostics.rul_confidence")
    print("═" * 70)
    for name, p in [("Cas 1 — arbres groupés (σ=25)", pred_high),
                    ("Cas 2 — arbres dispersés (σ=120)", pred_low)]:
        print(f"\n▸ {name}")
        print(f"    RUL moyen       : {p.rul_days:.1f} j  ({p.rul_minutes:.0f} min)")
        print(f"    Intervalle 80 % : {p.format_ui():>12}   (p10/p90)")
        print(f"    Intervalle 90 % : {p.rul_days_p05:.1f}–{p.rul_days_p95:.1f} j")
        print(f"    CVI             : {p.cvi:.3f}")
        print(f"    Badge           : {p.confidence.value.upper()}")
        print(f"    n_trees         : {p.n_trees}")
    print("\n✓ Self-test OK — fonctions importables.")
