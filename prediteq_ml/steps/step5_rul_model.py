"""
Étape 5 — Jeu de données RUL & Régresseur RandomForest
═══════════════════════════════════════════════════════════════════════════════
Objectif : prédire le RUL (Remaining Useful Life) à partir des SIGNAUX CAPTEURS
OBSERVABLES, pas à partir de la vérité terrain cachée du simulateur.

Définition de l'EoL (End-of-Life) — formulation sans fuite d'étiquettes :
  t_fail = premier instant où le HI OBSERVÉ (hi_smooth, dérivé IF+RMS)
           tombe sous HI_CRITICAL pendant RUL_CROSSING_PERSISTENCE points
           consécutifs.

Justification scientifique :
  En Prognostics & Health Management (PHM), la cible d'apprentissage doit
  être dérivée des MÊMES signaux que ceux disponibles en production
  (Saxena et al. 2010 — "Metrics for evaluating performance of prognostic
  techniques"). Utiliser la vérité terrain cachée 'simulated_hi' produit
  une fuite d'étiquettes (Kaufman et al., KDD 2012 §3) qui gonfle le R²
  artificiellement. La présente formulation est équivalente aux cibles
  CMAPSS (Saxena & Goebel 2008) et FEMTO-ST PRONOSTIA.

Validation :
  - Holdout 80/20 par trajectoire (GroupSplit → pas de fuite inter-groupes)
  - Validation croisée GroupKFold (K=RUL_CV_FOLDS) reportée dans metrics.json

Sortie : data/processed/rul_predictions.csv, models/random_forest_rul.pkl
"""

import numpy as np
import pandas as pd
import joblib
import json
import os
import sys
import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import *
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.dummy import DummyRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

# ─── Chemins ────────────────────────────────────────────────────────────────────────

BASE_DIR  = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IN_HI     = os.path.join(BASE_DIR, 'data', 'processed', 'hi.csv')
IN_FEAT   = os.path.join(BASE_DIR, 'data', 'processed', 'features.csv')
OUT_PREDS = os.path.join(BASE_DIR, 'data', 'processed', 'rul_predictions.csv')
OUT_MODEL = os.path.join(BASE_DIR, 'models', 'random_forest_rul.pkl')
OUT_CV    = os.path.join(BASE_DIR, 'outputs', 'rul_cv_scores.json')

os.makedirs(os.path.join(BASE_DIR, 'data', 'processed'), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, 'models'), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, 'outputs'), exist_ok=True)

NORM_COLS = [
    'rms_mms_norm', 'drms_dt_norm', 'rms_variability_norm',
    'p_mean_kw_norm', 'p_rms_kw_norm', 'dp_dt_norm',
    'e_cycle_kwh_norm', 'duration_ratio_norm',
    't_mean_c_norm', 'dt_dt_norm', 'hr_std_norm', 'corr_t_p_norm'
]

# ─── Détection de franchissement avec persistance ────────────────────────────

def find_threshold_crossing(signal, threshold, min_consecutive):
    """Retourne l'index du premier franchissement confirmé du seuil.

    Un franchissement est confirmé quand `min_consecutive` points successifs
    du signal sont sous le seuil. Standard IEEE 1856-2017 §6.3 pour prognostic
    signal conditioning — supprime les faux franchissements dus au bruit.

    Retourne None si aucun franchissement confirmé.
    """
    below = signal < threshold
    # convolution avec fenêtre constante pour détecter N points consécutifs
    if len(below) < min_consecutive:
        return None
    kernel = np.ones(min_consecutive, dtype=int)
    count  = np.convolve(below.astype(int), kernel, mode='valid')
    hits   = np.where(count == min_consecutive)[0]
    if len(hits) == 0:
        return None
    # hits[0] est le début de la première fenêtre N-consécutive sous-seuil
    return int(hits[0])

# ─── Construction du jeu de données RUL ─────────────────────────────────────────

def build_rul_dataset(hi_df, feat_df, traj_ids):
    """Construit le dataset RUL depuis les signaux OBSERVABLES uniquement.

    Target (RUL) = temps jusqu'au franchissement confirmé de HI_CRITICAL par
    hi_smooth (le HI reconstruit par le pipeline IF+RMS, accessible en prod).
    ⚠ Ne pas utiliser 'simulated_hi' comme source de target → fuite d'étiquettes.
    """
    X_list, y_list, meta, groups = [], [], [], []

    # feat_df est déjà sous-échantillonné à 1/min (sélection à la lecture)
    feat_1min = feat_df

    n_skipped_no_cross = 0
    n_skipped_early    = 0

    for tid in traj_ids:
        traj = hi_df[hi_df['trajectory_id'] == tid].sort_values('t_seconds').reset_index(drop=True)
        traj_feat = feat_1min[feat_1min['trajectory_id'] == tid].sort_values('t_seconds').reset_index(drop=True)

        merged = traj.merge(traj_feat[['trajectory_id', 't_seconds'] + NORM_COLS],
                            on=['trajectory_id', 't_seconds'], how='inner').reset_index(drop=True)

        # ─── CIBLE DÉRIVÉE DU SIGNAL OBSERVABLE hi_smooth (pas simulated_hi) ──
        # hi_smooth est la sortie du pipeline IF + HI (step3+step4) — c'est le
        # seul signal disponible en production sur un moteur réel.
        hi_obs = merged['hi_smooth'].values

        # Franchissement confirmé : N points consécutifs sous le seuil critique
        t_fail_idx = find_threshold_crossing(
            hi_obs, HI_CRITICAL, RUL_CROSSING_PERSISTENCE
        )
        if t_fail_idx is None:
            n_skipped_no_cross += 1
            continue

        t_fail_min = merged.loc[t_fail_idx, 't_seconds'] / 60.0

        # Générer des échantillons RUL du début (après la fenêtre lookback)
        # jusqu'à l'instant de défaillance.
        for i in range(RUL_LOOKBACK_MIN, t_fail_idx):
            window = hi_obs[max(0, i - RUL_LOOKBACK_MIN):i]
            if len(window) < RUL_LOOKBACK_MIN:
                continue

            t_now_min = merged.loc[i, 't_seconds'] / 60.0
            rul_min   = t_fail_min - t_now_min
            if rul_min <= 0:
                n_skipped_early += 1
                continue

            sensor_feats = merged.loc[i, NORM_COLS].values.astype(float)
            hi_now   = hi_obs[i]
            hi_mean  = np.mean(window)
            hi_std   = np.std(window)
            hi_min   = np.min(window)
            hi_slope = np.polyfit(np.arange(len(window)), window, 1)[0]

            row = np.concatenate([sensor_feats, [hi_now, hi_mean, hi_std, hi_min, hi_slope]])
            X_list.append(row)
            y_list.append(rul_min)
            groups.append(tid)
            meta.append({
                'trajectory_id': tid,
                'profile':       merged.loc[i, 'profile'],
                't_seconds':     merged.loc[i, 't_seconds'],
                'simulated_hi':  merged.loc[i, 'simulated_hi'],  # pour diagnostic uniquement
                'hi_smooth':     hi_obs[i],
            })

    if n_skipped_no_cross > 0:
        print(f"  [info] {n_skipped_no_cross} trajectoires sans franchissement HI confirmé (HI_smooth reste > {HI_CRITICAL})")
    if n_skipped_early > 0:
        print(f"  [info] {n_skipped_early} points après franchissement (RUL ≤ 0, exclus)")

    X = np.array(X_list) if X_list else np.zeros((0, len(NORM_COLS) + 5))
    y = np.array(y_list) if y_list else np.array([])
    g = np.array(groups) if groups else np.array([])
    return X, y, pd.DataFrame(meta), g

# ─── Validation croisée GroupKFold ─────────────────────────────────────────────

def cross_validate_rul(X, y, groups, n_splits, rf_params):
    """GroupKFold : chaque fold garde des trajectoires entières en validation.
    Évite la fuite intra-trajectoire (Kuhn & Johnson 2013, §4.3)."""
    if len(X) == 0 or len(np.unique(groups)) < n_splits:
        print(f"  [warn] Pas assez de groupes pour GroupKFold k={n_splits}")
        return []

    gkf = GroupKFold(n_splits=n_splits)
    fold_scores = []
    for fold_idx, (tr_idx, va_idx) in enumerate(gkf.split(X, y, groups), 1):
        m = RandomForestRegressor(**rf_params)
        m.fit(X[tr_idx], y[tr_idx])
        pred = m.predict(X[va_idx])
        r2v  = r2_score(y[va_idx], pred)
        rmse = float(np.sqrt(mean_squared_error(y[va_idx], pred)))
        mae  = float(mean_absolute_error(y[va_idx], pred))
        fold_scores.append({
            'fold':      fold_idx,
            'n_train':   int(len(tr_idx)),
            'n_val':     int(len(va_idx)),
            'r2':        float(r2v),
            'rmse_min':  rmse,
            'mae_min':   mae,
            'rmse_days': rmse / RUL_MIN_TO_DAY,
            'mae_days':  mae  / RUL_MIN_TO_DAY,
        })
        print(f"    Fold {fold_idx}/{n_splits} : R²={r2v:.4f}  RMSE={rmse:.2f} min "
              f"({rmse/RUL_MIN_TO_DAY:.2f} j)  n_val={len(va_idx)}")
    return fold_scores

# ─── Principal ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Chargement de hi.csv ...")
    hi_df = pd.read_csv(IN_HI)
    print(f"  {len(hi_df):,} lignes, {hi_df['trajectory_id'].nunique()} trajectoires")

    # Chargement mémoire-efficace : seulement les colonnes nécessaires + filtrer t%60==0
    print("Chargement de features.csv (colonnes nécessaires uniquement) ...")
    cols_needed = ['trajectory_id', 't_seconds'] + NORM_COLS
    # Lire par chunks et filtrer directement t_seconds % 60 == 0 pour réduire RAM
    chunks = []
    for chunk in pd.read_csv(IN_FEAT, usecols=cols_needed, chunksize=500_000):
        chunks.append(chunk[chunk['t_seconds'] % 60 == 0])
    feat_df = pd.concat(chunks, ignore_index=True)
    del chunks
    print(f"  {len(feat_df):,} lignes (déjà sous-échantillonnées à 1/min)")

    # ── Séparation train/test STRATIFIÉE par profil ──────────────────────────
    # Chaque profil (A/B/C/D) est divisé indépendamment en 80/20, de sorte
    # que train et test contiennent tous les profils dans la bonne proportion.
    # Évite qu'un profil soit sur-représenté en validation (biais d'évaluation).
    traj_ids  = hi_df['trajectory_id'].unique()
    traj_profile_map = (
        hi_df.drop_duplicates('trajectory_id')
             .set_index('trajectory_id')['profile']
             .to_dict()
    )
    train_ids, test_ids = get_train_test_ids(traj_ids, traj_profile_map=traj_profile_map)
    print(f"  Train : {len(train_ids)} trajectoires | Test : {len(test_ids)} (split stratifié par profil)")
    # Rapport de répartition par profil
    from collections import Counter
    train_profiles = Counter(traj_profile_map[t] for t in train_ids)
    test_profiles  = Counter(traj_profile_map[t] for t in test_ids)
    for prof in sorted(set(traj_profile_map.values())):
        print(f"    {prof:18s}: train={train_profiles[prof]:3d}  test={test_profiles[prof]:3d}")

    # ── Construction du dataset (cible DÉRIVÉE DE hi_smooth) ─────────────────
    print("\nConstruction dataset RUL (train) — target dérivée du HI OBSERVABLE")
    X_train, y_train, meta_train, g_train = build_rul_dataset(hi_df, feat_df, train_ids)
    print(f"  Échantillons train : {len(X_train):,}")

    print("\nConstruction dataset RUL (test)")
    X_test, y_test, meta_test, g_test = build_rul_dataset(hi_df, feat_df, test_ids)
    print(f"  Échantillons test  : {len(X_test):,}")

    if len(X_train) == 0:
        print("ERREUR : pas d'échantillons d'entraînement (HI_smooth ne croise pas le seuil).")
        sys.exit(1)

    # ── Hyperparamètres RF ────────────────────────────────────────────────────
    # 300 arbres : bon plateau empirique (Breiman 2001, Probst et al. 2019
    # "Tunability: Importance of Hyperparameters of Machine Learning Algorithms")
    # max_depth=12 : compromis biais/variance pour 17 features × ~N×400 échantillons
    # min_samples_leaf=10 : évite le sur-apprentissage sur petites cohortes
    rf_params = dict(
        n_estimators=300, max_depth=12, min_samples_leaf=10,
        random_state=42, n_jobs=-1
    )

    # ── Validation croisée GroupKFold (avant modèle final) ────────────────────
    print(f"\n── Validation croisée GroupKFold (k={RUL_CV_FOLDS}) ──")
    cv_scores = cross_validate_rul(X_train, y_train, g_train, RUL_CV_FOLDS, rf_params)
    if cv_scores:
        cv_r2_mean   = float(np.mean([s['r2']        for s in cv_scores]))
        cv_r2_std    = float(np.std ([s['r2']        for s in cv_scores]))
        cv_rmse_mean = float(np.mean([s['rmse_days'] for s in cv_scores]))
        cv_rmse_std  = float(np.std ([s['rmse_days'] for s in cv_scores]))
        print(f"  Moyenne CV : R² = {cv_r2_mean:.4f} ± {cv_r2_std:.4f} | "
              f"RMSE = {cv_rmse_mean:.2f} ± {cv_rmse_std:.2f} jours")
    else:
        cv_r2_mean = cv_r2_std = cv_rmse_mean = cv_rmse_std = None

    # ── Modèle final sur l'ensemble train complet ─────────────────────────────
    print("\nEntraînement du modèle RandomForest final (train complet) ...")
    model = RandomForestRegressor(**rf_params)
    model.fit(X_train, y_train)
    print("  Terminé.")

    # ── Prédiction + intervalles de confiance (non-paramétriques) ─────────────
    print("Prédiction RUL sur test ...")
    tree_preds = np.array([tree.predict(X_test) for tree in model.estimators_])
    rul_mean   = np.mean(tree_preds, axis=0)
    ci_low     = np.percentile(tree_preds, 10, axis=0)
    ci_high    = np.percentile(tree_preds, 90, axis=0)

    rul_days    = rul_mean  / RUL_MIN_TO_DAY
    ci_low_days = ci_low    / RUL_MIN_TO_DAY
    ci_high_days= ci_high   / RUL_MIN_TO_DAY
    y_test_days = y_test    / RUL_MIN_TO_DAY

    # ── Métriques holdout ─────────────────────────────────────────────────────
    rmse = float(np.sqrt(mean_squared_error(y_test, rul_mean)))
    mae  = float(mean_absolute_error(y_test, rul_mean))
    r2   = float(r2_score(y_test, rul_mean))

    print(f"\n── Métriques RUL (holdout 20%) ──")
    print(f"  RMSE : {rmse:.2f} min  ({rmse/RUL_MIN_TO_DAY:.2f} jours)")
    print(f"  MAE  : {mae:.2f} min  ({mae/RUL_MIN_TO_DAY:.2f} jours)")
    print(f"  R²   : {r2:.4f}")

    y_train_pred = model.predict(X_train)
    r2_train     = float(r2_score(y_train, y_train_pred))
    print(f"  R² train (cohérence) : {r2_train:.4f}")

    # ── Baselines : prouver que Random Forest est nécessaire ─────────────────
    # Baseline #1 : DummyRegressor (moyenne constante) — plancher absolu.
    # Baseline #2 : Régression linéaire multivariée — plancher « simple ».
    # Un modèle Random Forest n'est justifié que s'il bat ces deux baselines.
    print("\n── Baselines (justification du choix Random Forest) ──")
    baseline_results = {}
    for name, est in [
        ('dummy_mean',       DummyRegressor(strategy='mean')),
        ('linear_regression', LinearRegression()),
    ]:
        est.fit(X_train, y_train)
        pred_b = est.predict(X_test)
        r2_b   = float(r2_score(y_test, pred_b))
        rmse_b = float(np.sqrt(mean_squared_error(y_test, pred_b)))
        mae_b  = float(mean_absolute_error(y_test, pred_b))
        baseline_results[name] = {
            'r2':        r2_b,
            'rmse_min':  rmse_b,
            'rmse_days': rmse_b / RUL_MIN_TO_DAY,
            'mae_min':   mae_b,
            'mae_days':  mae_b  / RUL_MIN_TO_DAY,
        }
        print(f"  {name:20s} : R²={r2_b:+.4f}  RMSE={rmse_b/RUL_MIN_TO_DAY:6.2f} j  "
              f"MAE={mae_b/RUL_MIN_TO_DAY:5.2f} j")
    print(f"  {'random_forest':20s} : R²={r2:+.4f}  RMSE={rmse/RUL_MIN_TO_DAY:6.2f} j  "
          f"MAE={mae/RUL_MIN_TO_DAY:5.2f} j  ← modèle final")

    # ── Métriques par profil ──────────────────────────────────────────────────
    print("\n── Métriques par profil (test) ──")
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
        print(f"  {prof}: RMSE={rmse_p:.3f} jours, R²={r2_p:.4f}")

    # ── Sauvegardes ───────────────────────────────────────────────────────────
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

    # Répartition profils parmi les trajectoires RETENUES (après filtre
    # persistance) — vérifie que les 4 profils restent représentés.
    kept_train_ids   = list(np.unique(g_train))
    kept_test_ids    = list(np.unique(g_test))
    kept_train_profs = Counter(traj_profile_map[t] for t in kept_train_ids)
    kept_test_profs  = Counter(traj_profile_map[t] for t in kept_test_ids)
    profile_balance  = {
        prof: {
            'train_total':      int(train_profiles[prof]),
            'train_kept':       int(kept_train_profs[prof]),
            'test_total':       int(test_profiles[prof]),
            'test_kept':        int(kept_test_profs[prof]),
        }
        for prof in sorted(set(traj_profile_map.values()))
    }

    cv_summary = {
        'generated_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'config': {
            'target_source':            'hi_smooth (signal observable)',
            'crossing_persistence':     RUL_CROSSING_PERSISTENCE,
            'hi_critical':              HI_CRITICAL,
            'lookback_min':             RUL_LOOKBACK_MIN,
            'cv_folds':                 RUL_CV_FOLDS,
            'n_trajectories':           N_TRAJECTORIES,
            'train_ratio':              TRAIN_RATIO,
            'split_strategy':           'stratified by profile',
            'rf_params':                rf_params,
        },
        'holdout': {
            'n_train_samples':   int(len(X_train)),
            'n_test_samples':    int(len(X_test)),
            'n_train_groups':    int(len(np.unique(g_train))),
            'n_test_groups':     int(len(np.unique(g_test))),
            'rmse_min':          rmse,
            'mae_min':           mae,
            'rmse_days':         rmse / RUL_MIN_TO_DAY,
            'mae_days':          mae  / RUL_MIN_TO_DAY,
            'r2_test':           r2,
            'r2_train':          r2_train,
        },
        'baselines_holdout': baseline_results,  # dummy + linear, preuve que RF > plancher
        'profile_balance':    profile_balance,  # répartition A/B/C/D train/test + retenues
        'cross_validation_groupkfold': {
            'n_splits':     RUL_CV_FOLDS,
            'r2_mean':      cv_r2_mean,
            'r2_std':       cv_r2_std,
            'rmse_days_mean': cv_rmse_mean,
            'rmse_days_std':  cv_rmse_std,
            'per_fold':     cv_scores,
        },
    }
    with open(OUT_CV, 'w') as f:
        json.dump(cv_summary, f, indent=2)

    print(f"\n✅ Prédictions RUL sauvegardées → {OUT_PREDS}")
    print(f"✅ Modèle RF sauvegardé         → {OUT_MODEL}")
    print(f"✅ Résumé CV sauvegardé         → {OUT_CV}")
    if len(rul_days) > 0:
        print(f"   Exemple : RUL = {rul_days[0]:.1f} jours "
              f"[{ci_low_days[0]:.1f} – {ci_high_days[0]:.1f}]")
