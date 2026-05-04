"""
Étape 3 — Isolation Forest + Ensemble hybride
Entraîne un détecteur de nouveauté sur données saines uniquement → scores d'anomalie.
Approche hybride : combinaison pondérée du score IF + z-score RMS
pour réduire les faux positifs tout en maintenant la détection précoce.
Sortie : data/processed/anomaly_scores.csv, models/isolation_forest.pkl,
         models/hybrid_params.json
"""

import numpy as np
import pandas as pd
import joblib
import json
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import *
from sklearn.ensemble import IsolationForest
from sklearn.metrics import precision_score, recall_score, f1_score

# ─── Chemins ────────────────────────────────────────────────────────────────────────

BASE_DIR      = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IN_FEAT       = os.path.join(BASE_DIR, 'data', 'processed', 'features.csv')
OUT_SCORES    = os.path.join(BASE_DIR, 'data', 'processed', 'anomaly_scores.csv')
OUT_MODEL     = os.path.join(BASE_DIR, 'models', 'isolation_forest.pkl')
OUT_HYBRID    = os.path.join(BASE_DIR, 'models', 'hybrid_params.json')

os.makedirs(os.path.join(BASE_DIR, 'data', 'processed'), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, 'models'), exist_ok=True)

# ─── Colonnes de caractéristiques normalisées ─────────────────────────────────────

NORM_COLS = [
    'rms_mms_norm', 'drms_dt_norm', 'rms_variability_norm',
    'p_mean_kw_norm', 'p_rms_kw_norm', 'dp_dt_norm',
    'e_cycle_kwh_norm', 'duration_ratio_norm',
    't_mean_c_norm', 'dt_dt_norm', 'hr_std_norm', 'corr_t_p_norm'
]

# ─── Principal ───────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Chargement de features.csv ...")
    df = pd.read_csv(IN_FEAT)
    print(f"  Chargé {len(df):,} lignes, {df['trajectory_id'].nunique()} trajectoires")

    # ── Séparation train/test par trajectoire (80/20 stratifié par profil) ──
    traj_ids = df['trajectory_id'].unique()
    traj_profile_map = (
        df.drop_duplicates('trajectory_id')
          .set_index('trajectory_id')['profile']
          .to_dict()
    )
    train_ids, test_ids = get_train_test_ids(traj_ids, traj_profile_map=traj_profile_map)

    df_train = df[df['trajectory_id'].isin(train_ids)]
    df_test  = df[df['trajectory_id'].isin(test_ids)]

    print(f"  Trajectoires train : {len(train_ids)} | Test : {len(test_ids)}")

    # ── Données saines d'entraînement : 1ère heure + HI >= 0.8 ───────────
    mask_healthy = (
        (df_train['t_seconds'] <= 3600) &
        (df_train['simulated_hi'] >= 0.8)
    )
    X_healthy = df_train[mask_healthy][NORM_COLS].values
    print(f"  Échantillons sains d'entraînement : {len(X_healthy):,}")

    # ── Entraînement Isolation Forest ───────────────────────────────────
    print("Entraînement Isolation Forest ...")
    model = IsolationForest(
        n_estimators=IF_N_ESTIMATORS,      # 100
        contamination=IF_CONTAMINATION,    # 0.05
        random_state=IF_RANDOM_STATE       # 42
    )
    model.fit(X_healthy)
    print("  Entraînement terminé.")

    # ── Scorer TOUTES les données ───────────────────────────────────────
    print("Scoring de tous les pas de temps ...")
    X_all      = df[NORM_COLS].values
    if_scores  = model.score_samples(X_all)

    scores_df  = df[['trajectory_id', 'profile', 't_seconds', 'simulated_hi', 'phase']].copy()
    scores_df['if_score']      = if_scores
    scores_df['score_anomaly'] = -if_scores   # inversion : haut = mauvaise santé
    scores_df['is_train']      = df['trajectory_id'].isin(train_ids)

    # ── Référence : seuil fixe RMS (μ + 3σ sur données saines) ───────────────
    rms_healthy = df_train[mask_healthy]['rms_mms'].values
    rms_mean    = float(rms_healthy.mean())
    rms_std     = float(rms_healthy.std())
    rms_thresh  = rms_mean + 3 * rms_std
    scores_df['rms_flag']  = (df['rms_mms'] > rms_thresh).astype(int)
    print(f"  Seuil fixe RMS : {rms_thresh:.3f} mm/s")

    # ── Drapeau anomalie IF (score < 0) ────────────────────────────────────────
    scores_df['if_flag'] = (if_scores < 0).astype(int)

    # ══════════════════════════════════════════════════════════════════════════
    # ENSEMBLE HYBRIDE : score anomalie IF + z-score RMS
    # ══════════════════════════════════════════════════════════════════════
    print("\n── Construction de l'ensemble hybride (IF + RMS) ──")

    # 1. Z-score RMS (haut = mauvaise santé, même direction que score_anomaly)
    rms_zscore = (df['rms_mms'].values - rms_mean) / rms_std
    scores_df['rms_zscore'] = rms_zscore

    # 2. Normaliser les deux composantes à [0, 1] via percentiles robustes sur train
    train_mask = scores_df['is_train'] == True
    sa_train = scores_df.loc[train_mask, 'score_anomaly']
    sa_min   = float(sa_train.quantile(0.01))
    sa_max   = float(sa_train.quantile(0.99))
    sa_norm  = np.clip((scores_df['score_anomaly'].values - sa_min) / (sa_max - sa_min + 1e-8), 0.0, 1.0)

    rz_train = scores_df.loc[train_mask, 'rms_zscore']
    rz_min   = float(rz_train.quantile(0.01))
    rz_max   = float(rz_train.quantile(0.99))
    rz_norm  = np.clip((rms_zscore - rz_min) / (rz_max - rz_min + 1e-8), 0.0, 1.0)

    scores_df['if_norm']  = sa_norm
    scores_df['rms_norm'] = rz_norm

    # 3. Score hybride pondéré : alpha * IF_norm + (1-alpha) * RMS_norm
    # α a été recalibré sur le train pour maximiser la fidélité du HI lissé.
    alpha = HYBRID_ALPHA
    scores_df['hybrid_score'] = alpha * sa_norm + (1 - alpha) * rz_norm
    print(f"  Hybrid alpha={alpha} (IF={alpha:.0%}, RMS={1-alpha:.0%})")

    # 4. Drapeaux hybrides
    #    AND : les deux doivent s'accorder → haute précision
    #    OR  : l'un ou l'autre → haute sensibilité / alerte précoce
    scores_df['hybrid_and_flag'] = (scores_df['if_flag'] & scores_df['rms_flag']).astype(int)
    scores_df['hybrid_or_flag']  = (scores_df['if_flag'] | scores_df['rms_flag']).astype(int)

    # 5. Drapeau hybride basé sur seuil : optimisé sur les données d'entraînement
    #    Trouver le seuil sur hybrid_score qui maximise le F1 sur train
    train_scores = scores_df[train_mask].copy()
    y_train_true = (train_scores['simulated_hi'] < 0.6).astype(int).values
    best_f1, best_thresh = 0.0, 0.5
    for thr in np.arange(0.20, 0.85, 0.01):
        y_pred_tmp = (train_scores['hybrid_score'].values >= thr).astype(int)
        f1_tmp = f1_score(y_train_true, y_pred_tmp, zero_division=0)
        if f1_tmp > best_f1:
            best_f1, best_thresh = f1_tmp, thr

    scores_df['hybrid_flag'] = (scores_df['hybrid_score'] >= best_thresh).astype(int)
    print(f"  Seuil hybride optimal : {best_thresh:.2f} (F1 train={best_f1:.3f})")

    # ── Évaluation sur le jeu de test ─────────────────────────────────────
    print("\n── Évaluation sur trajectoires de test ──")
    df_test_scores = scores_df[scores_df['trajectory_id'].isin(test_ids)].copy()

    # Vérité terrain : dégradé = simulated_hi < 0.6
    y_true = (df_test_scores['simulated_hi'] < 0.6).astype(int).values
    y_if   = df_test_scores['if_flag'].values
    y_rms  = df_test_scores['rms_flag'].values
    y_hyb  = df_test_scores['hybrid_flag'].values
    y_and  = df_test_scores['hybrid_and_flag'].values

    def safe_metric(fn, y_t, y_p):
        try:
            return round(float(fn(y_t, y_p, zero_division=0)), 4)
        except Exception:
            return 0.0

    print(f"  Isolation Forest (IF seul) :")
    print(f"    Précision : {safe_metric(precision_score, y_true, y_if)}")
    print(f"    Rappel    : {safe_metric(recall_score,    y_true, y_if)}")
    print(f"    F1        : {safe_metric(f1_score,        y_true, y_if)}")
    print(f"  Seuil fixe RMS :")
    print(f"    Précision : {safe_metric(precision_score, y_true, y_rms)}")
    print(f"    Rappel    : {safe_metric(recall_score,    y_true, y_rms)}")
    print(f"    F1        : {safe_metric(f1_score,        y_true, y_rms)}")
    print(f"  Hybride AND (IF & RMS) :")
    print(f"    Précision : {safe_metric(precision_score, y_true, y_and)}")
    print(f"    Rappel    : {safe_metric(recall_score,    y_true, y_and)}")
    print(f"    F1        : {safe_metric(f1_score,        y_true, y_and)}")
    print(f"  Hybride pondéré (seuil={best_thresh:.2f}) :")
    print(f"    Précision : {safe_metric(precision_score, y_true, y_hyb)}")
    print(f"    Rappel    : {safe_metric(recall_score,    y_true, y_hyb)}")
    print(f"    F1        : {safe_metric(f1_score,        y_true, y_hyb)}")

    # ── Temps d'avance de détection précoce ────────────────────────────
    print("\n── Temps d'avance de détection (trajectoires de test) ──")
    lead_times_if  = []
    lead_times_hyb = []
    for tid in test_ids:
        traj = scores_df[scores_df['trajectory_id'] == tid].sort_values('t_seconds')
        t_rms_detect = traj[traj['rms_flag']    == 1]['t_seconds']
        t_if_detect  = traj[traj['if_flag']     == 1]['t_seconds']
        t_hyb_detect = traj[traj['hybrid_flag'] == 1]['t_seconds']
        if len(t_rms_detect) > 0 and len(t_if_detect) > 0:
            lead_if = (t_rms_detect.iloc[0] - t_if_detect.iloc[0]) / 60.0
            lead_times_if.append(lead_if)
        if len(t_rms_detect) > 0 and len(t_hyb_detect) > 0:
            lead_hyb = (t_rms_detect.iloc[0] - t_hyb_detect.iloc[0]) / 60.0
            lead_times_hyb.append(lead_hyb)

    if lead_times_if:
        print(f"  Avance IF sur RMS :      {np.mean(lead_times_if):.1f} min")
    if lead_times_hyb:
        print(f"  Avance hybride sur RMS : {np.mean(lead_times_hyb):.1f} min")

    # ── Analyse de sensibilité ─────────────────────────────────────────
    print("\n── Analyse de sensibilité (contamination) ──")
    for cont in [0.01, 0.05, 0.10]:
        m = IsolationForest(
            n_estimators=100, contamination=cont,
            random_state=42
        )
        m.fit(X_healthy)
        X_test_norm = df[df['trajectory_id'].isin(test_ids)][NORM_COLS].values
        scores_tmp  = m.score_samples(X_test_norm)
        y_tmp       = (scores_tmp < 0).astype(int)
        prec = safe_metric(precision_score, y_true, y_tmp)
        rec  = safe_metric(recall_score,    y_true, y_tmp)
        fp   = int(((y_tmp == 1) & (y_true == 0)).sum())
        print(f"  contamination={cont}: Précision={prec} Rappel={rec} FP={fp}")

    # ── Sauvegarder modèle + scores ───────────────────────────────────────────────
    scores_df.to_csv(OUT_SCORES, index=False)
    joblib.dump(model, OUT_MODEL)

    # ── Sauvegarder paramètres hybrides (pour le moteur de production) ──────────
    hybrid_params = {
        'hybrid_alpha':    alpha,
        'hybrid_threshold': float(best_thresh),
        'calibration_objective': 'train-only smoothed HI correlation',
        'if_norm':  {'min': sa_min, 'max': sa_max},
        'rms_norm': {'min': rz_min, 'max': rz_max},
        'rms_healthy_mean': rms_mean,
        'rms_healthy_std':  rms_std,
    }
    with open(OUT_HYBRID, 'w') as f:
        json.dump(hybrid_params, f, indent=2)

    print(f"\nOK: Scores d'anomalie sauvegardes -> {OUT_SCORES}")
    print(f"OK: Modele IF sauvegarde        -> {OUT_MODEL}")
    print(f"OK: Parametres hybrides sauvegardes -> {OUT_HYBRID}")
    print(f"   Plage de scores : [{if_scores.min():.4f}, {if_scores.max():.4f}]")
    print(f"   Plage de scores hybrides : [{scores_df['hybrid_score'].min():.4f}, "
          f"{scores_df['hybrid_score'].max():.4f}]")
