"""
Étape 5 — Jeu de données RUL & Régresseur RandomForest
Construction du dataset RUL -> entraînement du régresseur -> prédiction RUL avec intervalle de confiance.
Sortie : data/processed/rul_predictions.csv, models/random_forest_rul.pkl
"""

import numpy as np
import pandas as pd
import joblib
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import *
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

# ─── Chemins ────────────────────────────────────────────────────────────────────────

BASE_DIR  = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IN_HI     = os.path.join(BASE_DIR, 'data', 'processed', 'hi.csv')
IN_FEAT   = os.path.join(BASE_DIR, 'data', 'processed', 'features.csv')
OUT_PREDS = os.path.join(BASE_DIR, 'data', 'processed', 'rul_predictions.csv')
OUT_MODEL = os.path.join(BASE_DIR, 'models', 'random_forest_rul.pkl')

os.makedirs(os.path.join(BASE_DIR, 'data', 'processed'), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, 'models'), exist_ok=True)

NORM_COLS = [
    'rms_mms_norm', 'drms_dt_norm', 'rms_variability_norm',
    'p_mean_kw_norm', 'p_rms_kw_norm', 'dp_dt_norm',
    'e_cycle_kwh_norm', 'duration_ratio_norm',
    't_mean_c_norm', 'dt_dt_norm', 'hr_std_norm', 'corr_t_p_norm'
]

# ─── Construction du jeu de données RUL ─────────────────────────────────────────

def build_rul_dataset(hi_df, feat_df, traj_ids):
    """Construit le dataset RUL avec caractéristiques capteurs + fenêtre d'historique HI."""
    X_list, y_list, meta = [], [], []

    # Sous-échantillonner les caractéristiques à 1/min pour correspondre à hi_df
    feat_1min = feat_df[feat_df['t_seconds'] % 60 == 0].copy()

    for tid in traj_ids:
        traj = hi_df[hi_df['trajectory_id'] == tid].sort_values('t_seconds').reset_index(drop=True)
        traj_feat = feat_1min[feat_1min['trajectory_id'] == tid].sort_values('t_seconds').reset_index(drop=True)

        # Aligner sur t_seconds
        merged = traj.merge(traj_feat[['trajectory_id', 't_seconds'] + NORM_COLS],
                            on=['trajectory_id', 't_seconds'], how='inner').reset_index(drop=True)

        # Trouver le point de défaillance avec la VÉRITÉ TERRAIN simulated_hi (étiquettes propres).
        # En production, le modèle utilise hi_smooth (dérivé IF) comme caractéristiques,
        # mais les cibles d'entraînement doivent être aussi propres que possible.
        sim_hi = merged['simulated_hi'].values
        hi_vals = merged['hi_smooth'].values  # utilisé pour les caractéristiques uniquement

        healthy_mask = sim_hi >= HI_CRITICAL
        if not healthy_mask.any():
            continue

        first_healthy = int(np.argmax(healthy_mask))
        sub_fail = sim_hi[first_healthy:] < HI_CRITICAL
        if not sub_fail.any():
            continue

        t_fail_idx = first_healthy + int(np.argmax(sub_fail))
        t_fail_min = merged.loc[t_fail_idx, 't_seconds'] / 60.0

        for i in range(RUL_LOOKBACK_MIN, t_fail_idx):
            window = hi_vals[max(0, i - RUL_LOOKBACK_MIN):i]
            if len(window) < RUL_LOOKBACK_MIN:
                continue

            t_now_min = merged.loc[i, 't_seconds'] / 60.0
            rul_min   = t_fail_min - t_now_min

            if rul_min <= 0:
                continue

            # Caractéristiques capteurs courantes (12 normalisées)
            sensor_feats = merged.loc[i, NORM_COLS].values.astype(float)
            # Statistiques résumées HI (depuis hi_smooth dérivé IF — ce que le modèle voit en prod)
            hi_mean  = np.mean(window)
            hi_std   = np.std(window)
            hi_min   = np.min(window)
            hi_slope = np.polyfit(np.arange(len(window)), window, 1)[0]
            hi_now   = hi_vals[i]

            # Combiner : 12 caractéristiques capteurs + 5 stats HI = 17 caractéristiques
            row = np.concatenate([sensor_feats, [hi_now, hi_mean, hi_std, hi_min, hi_slope]])
            X_list.append(row)
            y_list.append(rul_min)
            meta.append({
                'trajectory_id': tid,
                'profile':       merged.loc[i, 'profile'],
                't_seconds':     merged.loc[i, 't_seconds'],
                'simulated_hi':  merged.loc[i, 'simulated_hi'],
            })

    X = np.array(X_list)
    y = np.array(y_list)
    return X, y, pd.DataFrame(meta)

# ─── Principal ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Loading hi.csv ...")
    hi_df = pd.read_csv(IN_HI)
    print(f"  Loaded {len(hi_df):,} rows, {hi_df['trajectory_id'].nunique()} trajectories")

    print("Loading features.csv ...")
    feat_df = pd.read_csv(IN_FEAT)
    print(f"  Loaded {len(feat_df):,} feature rows")

    # ── Séparation train/test par trajectoires complètes ─────────────────────
    # Utilise la séparation déterministe partagée de config — identique pour toutes les étapes.
    traj_ids  = hi_df['trajectory_id'].unique()
    train_ids, test_ids = get_train_test_ids(traj_ids)
    print(f"  Train: {len(train_ids)} trajectories | Test: {len(test_ids)}")

    # ── Build datasets ────────────────────────────────────────────────────────
    print("Building RUL dataset (train) ...")
    X_train, y_train, meta_train = build_rul_dataset(hi_df, feat_df, train_ids)
    print(f"  Train samples: {len(X_train):,}")

    print("Building RUL dataset (test) ...")
    X_test, y_test, meta_test = build_rul_dataset(hi_df, feat_df, test_ids)
    print(f"  Test samples : {len(X_test):,}")

    if len(X_train) == 0:
        print("ERROR: No training samples built. Check HI critical threshold.")
        sys.exit(1)

    # ── Train RandomForest ────────────────────────────────────────────────────
    print("\nTraining RandomForestRegressor ...")
    model = RandomForestRegressor(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=10,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)
    print("  Entraînement terminé.")

    # ── Prédiction avec intervalles de confiance ─────────────────────
    print("Prédiction RUL sur le jeu de test ...")
    tree_preds = np.array([tree.predict(X_test) for tree in model.estimators_])
    rul_mean   = np.mean(tree_preds, axis=0)
    ci_low     = np.percentile(tree_preds, 10, axis=0)
    ci_high    = np.percentile(tree_preds, 90, axis=0)

    # Convertir minutes -> jours
    rul_days    = rul_mean  / RUL_MIN_TO_DAY
    ci_low_days = ci_low    / RUL_MIN_TO_DAY
    ci_high_days= ci_high   / RUL_MIN_TO_DAY
    y_test_days = y_test    / RUL_MIN_TO_DAY

    # ── Metrics ───────────────────────────────────────────────────────────────
    rmse = float(np.sqrt(mean_squared_error(y_test, rul_mean)))
    mae  = float(mean_absolute_error(y_test, rul_mean))
    r2   = float(r2_score(y_test, rul_mean))

    print(f"\n-- RUL Regression Metrics (minutes) --")
    print(f"  RMSE : {rmse:.2f} min")
    print(f"  MAE  : {mae:.2f} min")
    print(f"  R2   : {r2:.4f}")
    print(f"\n-- RUL Regression Metrics (days) --")
    print(f"  RMSE : {rmse/RUL_MIN_TO_DAY:.2f} days")
    print(f"  MAE  : {mae/RUL_MIN_TO_DAY:.2f} days")
    print(f"  R2   : {r2:.4f}")
    print(f"  (target: RMSE in [12-22 min cycles], R2 > 0.85)")

    # ── Prédiction sur train aussi (vérification de cohérence) ────────────────
    y_train_pred = model.predict(X_train)
    r2_train     = r2_score(y_train, y_train_pred)
    print(f"\n  Train R2 (sanity): {r2_train:.4f}")

    # ── Per-profile metrics ───────────────────────────────────────────────────
    print("\n-- Per-profile metrics (test) --")
    meta_test['rul_true_days'] = y_test_days
    meta_test['rul_pred_days'] = rul_days
    for prof in sorted(meta_test['profile'].unique()):
        mask = meta_test['profile'] == prof
        rmse_p = float(np.sqrt(mean_squared_error(
            meta_test[mask]['rul_true_days'],
            meta_test[mask]['rul_pred_days']
        )))
        r2_p = float(r2_score(
            meta_test[mask]['rul_true_days'],
            meta_test[mask]['rul_pred_days']
        ))
        print(f"  {prof}: RMSE={rmse_p:.3f} jours, R2={r2_p:.4f}")

    # ── Sauvegarder les prédictions ──────────────────────────────────────────────
    results_df = meta_test.copy()
    results_df['rul_true_min']  = y_test
    results_df['rul_pred_min']  = rul_mean
    results_df['ci_low_min']    = ci_low
    results_df['ci_high_min']   = ci_high
    results_df['rul_true_days'] = y_test_days
    results_df['rul_pred_days'] = rul_days
    results_df['ci_low_days']   = ci_low_days
    results_df['ci_high_days']  = ci_high_days

    results_df.to_csv(OUT_PREDS, index=False)
    joblib.dump(model, OUT_MODEL)

    print(f"\n\u2705 RUL predictions saved -> {OUT_PREDS}")
    print(f"\u2705 RF model saved   -> {OUT_MODEL}")
    print(f"   Prediction sample: RUL = {rul_days[0]:.1f} days "
          f"[{ci_low_days[0]:.1f} - {ci_high_days[0]:.1f}]")