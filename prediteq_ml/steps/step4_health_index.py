"""
Étape 4 — Indice de Santé (Health Index)
Transforme les scores d'anomalie hybrides → HI interprétable ∈ [0, 1].
Utilise hybrid_score (ensemble IF + RMS) de l'étape 3.
Sortie : data/processed/hi.csv, models/hi_params.json
"""

import numpy as np
import pandas as pd
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import *

# ─── Chemins ────────────────────────────────────────────────────────────────────────

BASE_DIR   = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IN_SCORES  = os.path.join(BASE_DIR, 'data', 'processed', 'anomaly_scores.csv')
OUT_HI     = os.path.join(BASE_DIR, 'data', 'processed', 'hi.csv')
OUT_PARAMS = os.path.join(BASE_DIR, 'models', 'hi_params.json')

os.makedirs(os.path.join(BASE_DIR, 'data', 'processed'), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, 'models'), exist_ok=True)

# ─── Étiquetage des zones ─────────────────────────────────────────────────────

def get_zone(hi):
    if hi >= HI_EXCELLENT:   return 'Excellent'
    elif hi >= HI_GOOD:      return 'Good'
    elif hi >= HI_CRITICAL:  return 'Degraded'
    else:                    return 'Critical'

# ─── Principal ───────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Chargement de anomaly_scores.csv ...")
    df = pd.read_csv(IN_SCORES)
    print(f"  Chargé {len(df):,} lignes, {df['trajectory_id'].nunique()} trajectoires")

    # ── Étape 4A : utiliser le score hybride (ensemble IF + RMS) ───────────
    # hybrid_score : haut = mauvaise santé (combine anomalie IF + z-score RMS)
    score_anomaly = df['hybrid_score'].values

    # ── Étape 4B : normalisation robuste avec distribution complète du train ──
    # Utilise la distribution complète des trajectoires train pour la normalisation
    mask_train = df['is_train'] == True
    score_train = score_anomaly[mask_train]

    p5  = float(np.percentile(score_train, 5))
    p95 = float(np.percentile(score_train, 95))
    print(f"  Score train p5={p5:.4f}, p95={p95:.4f}")

    # HI_raw
    denom   = p95 - p5 if (p95 - p5) > 1e-8 else 1.0
    hi_raw  = 1.0 - (score_anomaly - p5) / denom
    hi_raw  = np.clip(hi_raw, 0.0, 1.0)

    # ── Étape 4C : lissage — moyenne glissante 120s, sous-échantillonné à 1/min ───
    print("Calcul du HI lissé par trajectoire ...")
    all_hi = []

    for tid in sorted(df['trajectory_id'].unique()):
        mask  = df['trajectory_id'] == tid
        traj  = df[mask].copy().reset_index(drop=True)
        raw   = hi_raw[mask]

        # Moyenne glissante 120 points (adaptative au début)
        s_raw    = pd.Series(raw)
        hi_smooth = s_raw.rolling(
            window=HI_SMOOTH_WINDOW_S, min_periods=1
        ).mean().values

        # ── Sous-échantillonner : garder 1 valeur par minute (toutes les 60s)
        traj['hi_raw']    = raw
        traj['hi_smooth'] = hi_smooth

        # 1 valeur par minute
        traj_min = traj[traj['t_seconds'] % 60 == 0].copy()
        traj_min['zone'] = traj_min['hi_smooth'].apply(get_zone)

        all_hi.append(traj_min)

    hi_df = pd.concat(all_hi, ignore_index=True)

    # ── Statistiques ──────────────────────────────────────────────────────────
    print("\n-- Distribution HI par zone --")
    print(hi_df['zone'].value_counts())

    print("\n-- Statistiques HI lissé par profil --")
    print(hi_df.groupby('profile')['hi_smooth'].describe().round(3))

    print("\n-- Corrélation HI vs simulated_hi --")
    corr = hi_df['hi_smooth'].corr(hi_df['simulated_hi'])
    print(f"  Pearson r(HI_lissé, simulated_hi) = {corr:.4f}")

    # ── Sauvegarde ────────────────────────────────────────────────────────────
    hi_df.to_csv(OUT_HI, index=False)
    print(f"\n✅ HI sauvegardé          -> {OUT_HI}")
    print(f"   Forme : {hi_df.shape}")

    hi_params = {'p5': p5, 'p95': p95}
    with open(OUT_PARAMS, 'w') as f:
        json.dump(hi_params, f, indent=2)
    print(f"✅ Paramètres HI sauvegardés -> {OUT_PARAMS}")
    print(f"   p5={p5:.4f}, p95={p95:.4f}")