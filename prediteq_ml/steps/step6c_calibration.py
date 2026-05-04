"""
step6c_calibration.py — Diagramme de calibration des intervalles de confiance
══════════════════════════════════════════════════════════════════════════════

OBJECTIF
────────
Vérifier empiriquement que les intervalles de confiance à 80 % publiés par
notre modèle Random Forest correspondent réellement à 80 % de couverture
sur le test set. Si on promet « IC80 », il faut que dans 80 % des cas la
valeur vraie tombe effectivement dans l'intervalle prédit. Sinon le modèle
sur-estime sa confiance (intervalles trop étroits) ou la sous-estime
(intervalles trop larges).

FONDEMENT SCIENTIFIQUE
──────────────────────
- Niculescu-Mizil & Caruana (2005), « Predicting Good Probabilities with
  Supervised Learning », ICML — méthodologie originale des reliability diagrams.
- Guo et al. (2017), « On Calibration of Modern Neural Networks », ICML —
  réintroduction du concept dans la communauté ML moderne.
- Kuleshov, Fenner & Ermon (2018), « Accurate Uncertainties for Deep Learning
  Using Calibrated Regression », ICML — extension explicite aux régressions.
- IEEE Std 1856-2017 §5.4 — exige une « uncertainty quantification » validée
  pour tout système de pronostics.

MÉTHODOLOGIE
────────────
On dispose pour chaque prédiction du test set (~21 k lignes) :
  rul_true_days  — vérité terrain (étiquette)
  rul_pred_days  — moyenne des 300 arbres
  ci_low_days    — percentile 10 des arbres (borne IC80 basse)
  ci_high_days   — percentile 90 des arbres (borne IC80 haute)

Couverture empirique IC80 :
    coverage_80 = #{i : ci_low ≤ rul_true ≤ ci_high} / N

Idéalement coverage_80 ≈ 0.80. Écart > 0.05 → calibration imparfaite.

Pour produire un VRAI diagramme de fiabilité (couverture nominale vs
empirique sur plusieurs niveaux), on reconstruit des intervalles à
différents niveaux de confiance via la dispersion estimée des arbres :
    σ_pred ≈ (ci_high - ci_low) / 2 / z_0.90, avec z_0.90 ≈ 1.282
puis pour chaque niveau α ∈ {0.50, 0.60, 0.70, 0.80, 0.90, 0.95} :
    CI_α = [pred - z_α × σ_pred, pred + z_α × σ_pred]
    coverage_α = #{i : CI_α_low ≤ rul_true ≤ CI_α_high} / N

Hypothèse : la distribution des erreurs est approximativement gaussienne
autour de la moyenne des arbres. Vérifiable a posteriori via histogramme
des erreurs standardisées (deuxième sous-figure).

SORTIES
───────
  outputs/plots/plot7_calibration.png  — Figure 2-panel :
      (a) Reliability diagram (couverture empirique vs nominale)
      (b) Histogramme erreurs standardisées (z-scores)
  outputs/calibration_metrics.json     — Métriques numériques détaillées
                                          (pour insertion dans le mémoire)

USAGE
─────
    python -m prediteq_ml.steps.step6c_calibration

Ne touche à AUCUN fichier du pipeline existant. Lecture seule sur
`data/processed/rul_predictions.csv`. À lancer une fois pour générer la
figure du mémoire.

Auteur : Firas Zouari — ISAMM PFE 2026
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # backend non interactif (CI / serveurs sans display)
import matplotlib.pyplot as plt

# ─── Helpers gaussiens (évite la dépendance scipy) ──────────────────────────

# Table des valeurs critiques z = Φ⁻¹(0.5 + level/2) pour les niveaux usuels.
# Chiffres de référence : NIST Handbook of Statistical Methods §1.3.6.7.1.
# On hardcode parce qu'on n'a besoin que de ces 6 valeurs ; pas la peine
# d'embarquer scipy juste pour ça.
_Z_TABLE = {
    0.50: 0.6745,   # Φ⁻¹(0.75)
    0.60: 0.8416,   # Φ⁻¹(0.80)
    0.70: 1.0364,   # Φ⁻¹(0.85)
    0.80: 1.2816,   # Φ⁻¹(0.90)
    0.90: 1.6449,   # Φ⁻¹(0.95)
    0.95: 1.9600,   # Φ⁻¹(0.975)
}


def _z_critical(level: float) -> float:
    """Demi-largeur z = Φ⁻¹(0.5 + level/2) pour un IC bilatéral à `level`."""
    if level not in _Z_TABLE:
        raise ValueError(
            f"Level {level} non supporté — utiliser une valeur de _Z_TABLE."
        )
    return _Z_TABLE[level]


def _norm_pdf(x):
    """Densité de N(0,1). x peut être scalaire ou array (équiv. scipy.stats.norm.pdf)."""
    return np.exp(-0.5 * np.asarray(x) ** 2) / np.sqrt(2 * np.pi)

# ─── Chemins ────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "processed" / "rul_predictions.csv"
OUTPUT_PLOT = ROOT / "outputs" / "plots" / "plot7_calibration.png"
OUTPUT_JSON = ROOT / "outputs" / "calibration_metrics.json"

# ─── Niveaux de confiance évalués ───────────────────────────────────────────

CONFIDENCE_LEVELS = [0.50, 0.60, 0.70, 0.80, 0.90, 0.95]

# ─── Calcul ─────────────────────────────────────────────────────────────────


def empirical_coverage(true: np.ndarray,
                       lo: np.ndarray,
                       hi: np.ndarray) -> float:
    """% de cas où true ∈ [lo, hi]."""
    inside = (true >= lo) & (true <= hi)
    return float(np.mean(inside))


def reconstruct_ci(pred: np.ndarray,
                   sigma: np.ndarray,
                   level: float) -> tuple[np.ndarray, np.ndarray]:
    """Reconstruit les bornes d'un IC à `level` de couverture nominale,
    sous hypothèse gaussienne autour de la prédiction moyenne."""
    z = _z_critical(level)  # ex: level=0.80 → z=1.2816
    return pred - z * sigma, pred + z * sigma


def compute_metrics(df: pd.DataFrame) -> dict:
    """Calcule les métriques de calibration sur le DataFrame complet."""
    true = df["rul_true_days"].values.astype(float)
    pred = df["rul_pred_days"].values.astype(float)
    ci_low = df["ci_low_days"].values.astype(float)
    ci_high = df["ci_high_days"].values.astype(float)

    n = len(true)

    # Estimation de σ par prédiction depuis l'IC80 publié.
    # IC80 → z = 1.2816 (table NIST), donc demi-largeur = z × σ
    z_80 = _z_critical(0.80)
    sigma = (ci_high - ci_low) / (2.0 * z_80)
    # Garde-fou : σ doit être positif
    sigma = np.clip(sigma, 1e-6, None)

    # Couverture empirique pour chaque niveau nominal
    coverage_per_level = {}
    for level in CONFIDENCE_LEVELS:
        lo, hi = reconstruct_ci(pred, sigma, level)
        cov = empirical_coverage(true, lo, hi)
        coverage_per_level[f"{int(level*100)}"] = round(cov, 4)

    # Couverture observée à partir des bornes IC80 originales
    coverage_native_80 = empirical_coverage(true, ci_low, ci_high)

    # Erreurs standardisées : (true - pred) / σ
    z_errors = (true - pred) / sigma
    z_mean = float(np.mean(z_errors))
    z_std = float(np.std(z_errors))
    # Si bien calibré : z_mean ≈ 0, z_std ≈ 1, distribution N(0,1)

    # Métriques globales
    rmse = float(np.sqrt(np.mean((pred - true) ** 2)))
    mae = float(np.mean(np.abs(pred - true)))
    bias = float(np.mean(pred - true))

    # Calibration error (Expected Calibration Error analogue)
    ece = float(np.mean([
        abs(coverage_per_level[f"{int(l*100)}"] - l)
        for l in CONFIDENCE_LEVELS
    ]))

    return {
        "n_predictions": int(n),
        "rmse_days": round(rmse, 3),
        "mae_days": round(mae, 3),
        "bias_days": round(bias, 3),
        "coverage_native_80": round(coverage_native_80, 4),
        "coverage_per_level": coverage_per_level,
        "expected_calibration_error": round(ece, 4),
        "z_error_mean": round(z_mean, 4),
        "z_error_std": round(z_std, 4),
        "z_error_n_outliers_3sigma": int(np.sum(np.abs(z_errors) > 3)),
        "interpretation": _interpret_calibration(coverage_per_level, z_mean, z_std),
    }


def _interpret_calibration(coverage: dict, z_mean: float, z_std: float) -> str:
    """Génère un résumé en français pour le mémoire."""
    cov_80 = coverage["80"]
    if abs(cov_80 - 0.80) < 0.03:
        cal_msg = "calibration excellente (écart < 3 %)"
    elif abs(cov_80 - 0.80) < 0.08:
        cal_msg = "calibration acceptable (écart < 8 %)"
    elif cov_80 > 0.80:
        cal_msg = "intervalles légèrement larges (sur-couverture)"
    else:
        cal_msg = "intervalles trop étroits (sous-couverture)"

    return (
        f"À niveau nominal 80 %, la couverture empirique est {cov_80:.1%} → "
        f"{cal_msg}. Z-score moyen {z_mean:+.3f} (idéal 0), "
        f"écart-type {z_std:.3f} (idéal 1)."
    )


# ─── Plot ───────────────────────────────────────────────────────────────────


def plot_calibration(metrics: dict, df: pd.DataFrame) -> None:
    """Figure 2-panel : reliability diagram + histogramme z-scores."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.5))

    # ─── Panel A : Reliability diagram ──────────────────────────────────
    nominal = np.array(CONFIDENCE_LEVELS)
    empirical = np.array([
        metrics["coverage_per_level"][f"{int(l*100)}"] for l in CONFIDENCE_LEVELS
    ])

    # Diagonale parfaite
    ax1.plot([0.4, 1.0], [0.4, 1.0], "--", color="gray",
             linewidth=1.0, label="Calibration parfaite", alpha=0.6)

    # Zone d'acceptabilité ± 5 %
    ax1.fill_between(
        [0.4, 1.0], [0.35, 0.95], [0.45, 1.05],
        color="green", alpha=0.08, label="Tolérance ±5 %"
    )

    # Courbe empirique
    ax1.plot(nominal, empirical, "o-", color="#1f4068",
             linewidth=2.2, markersize=9, label="PrediTeq RF (300 arbres)")
    # Annoter chaque point
    for n, e in zip(nominal, empirical):
        ax1.annotate(f"{e:.1%}",
                     (n, e), xytext=(5, 8), textcoords="offset points",
                     fontsize=8, color="#1f4068", fontweight="bold")

    ax1.set_xlabel("Niveau de confiance nominal", fontsize=11)
    ax1.set_ylabel("Couverture empirique sur test set", fontsize=11)
    ax1.set_title(
        "Diagramme de fiabilité — calibration des IC RF\n"
        f"ECE = {metrics['expected_calibration_error']:.3f}  "
        f"(Niculescu-Mizil & Caruana 2005)",
        fontsize=11
    )
    ax1.set_xlim(0.4, 1.0)
    ax1.set_ylim(0.4, 1.05)
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="lower right", fontsize=9)
    ax1.set_aspect("equal")

    # ─── Panel B : Distribution des z-scores ────────────────────────────
    true = df["rul_true_days"].values.astype(float)
    pred = df["rul_pred_days"].values.astype(float)
    ci_low = df["ci_low_days"].values.astype(float)
    ci_high = df["ci_high_days"].values.astype(float)
    z_80 = _z_critical(0.80)
    sigma = np.clip((ci_high - ci_low) / (2.0 * z_80), 1e-6, None)
    z_errors = (true - pred) / sigma

    # Filtrer les outliers extrêmes pour le visuel (mais on les compte)
    z_clip = np.clip(z_errors, -5, 5)

    ax2.hist(z_clip, bins=60, density=True, color="#3a7ca5",
             alpha=0.7, edgecolor="white", linewidth=0.5,
             label=f"Erreurs standardisées (n={len(z_errors):,})".replace(",", " "))

    # Normale théorique N(0,1) en pointillé
    x = np.linspace(-5, 5, 200)
    ax2.plot(x, _norm_pdf(x), "--", color="red",
             linewidth=1.8, label="N(0, 1) théorique")

    # Statistiques en annotation
    stats_text = (
        f"μ = {metrics['z_error_mean']:+.3f}\n"
        f"σ = {metrics['z_error_std']:.3f}\n"
        f"n outliers (|z| > 3) = {metrics['z_error_n_outliers_3sigma']}"
    )
    ax2.text(0.97, 0.97, stats_text, transform=ax2.transAxes,
             fontsize=9, verticalalignment="top", horizontalalignment="right",
             bbox=dict(boxstyle="round,pad=0.4", facecolor="white",
                        edgecolor="gray", alpha=0.9))

    ax2.set_xlabel("Erreur standardisée  z = (true - pred) / σ",
                   fontsize=11)
    ax2.set_ylabel("Densité empirique", fontsize=11)
    ax2.set_title(
        "Distribution des erreurs standardisées\n"
        "(devrait suivre N(0,1) si σ bien calibré)",
        fontsize=11
    )
    ax2.legend(loc="upper left", fontsize=9)
    ax2.grid(True, alpha=0.3)
    ax2.set_xlim(-5, 5)

    plt.tight_layout()
    OUTPUT_PLOT.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(OUTPUT_PLOT, dpi=150, bbox_inches="tight")
    plt.close()


# ─── Main ───────────────────────────────────────────────────────────────────


def main() -> None:
    if not DATA_FILE.exists():
        print(f"❌ {DATA_FILE} introuvable — exécuter d'abord step5_rul_model.py")
        sys.exit(1)

    print(f"📊 Lecture de {DATA_FILE.name}…")
    df = pd.read_csv(DATA_FILE)
    print(f"   {len(df):,} prédictions chargées ({df['profile'].nunique()} profils)".replace(",", " "))

    print()
    print("🔬 Calcul des métriques de calibration…")
    metrics = compute_metrics(df)

    print()
    print("📈 Génération du diagramme de fiabilité…")
    plot_calibration(metrics, df)
    print(f"   → {OUTPUT_PLOT}")

    print()
    print("💾 Sauvegarde des métriques…")
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
    print(f"   → {OUTPUT_JSON}")

    print()
    print("─" * 70)
    print("RÉSUMÉ POUR LE MÉMOIRE")
    print("─" * 70)
    print(f"  N prédictions test  : {metrics['n_predictions']:,}".replace(",", " "))
    print(f"  RMSE                : {metrics['rmse_days']:.2f} jours")
    print(f"  MAE                 : {metrics['mae_days']:.2f} jours")
    print(f"  Biais (pred - true) : {metrics['bias_days']:+.2f} jours")
    print(f"  Couverture native 80% : {metrics['coverage_native_80']:.1%}")
    print(f"  ECE (calibration)   : {metrics['expected_calibration_error']:.3f}")
    print()
    print("  Couverture empirique par niveau nominal :")
    for level, cov in metrics["coverage_per_level"].items():
        delta = float(cov) - float(level) / 100.0
        marker = "✓" if abs(delta) < 0.05 else "⚠"
        print(f"    {marker}  Nominal {level}% → empirique {float(cov)*100:5.1f}%  (Δ={delta:+.3f})")
    print()
    print(f"  Conclusion : {metrics['interpretation']}")
    print("─" * 70)


if __name__ == "__main__":
    main()
