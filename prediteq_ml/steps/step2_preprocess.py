"""
Étape 2 — Prétraitement & Ingénierie des caractéristiques
Flux capteurs bruts → 12 caractéristiques ingéniérées, normalisées.
Sortie : data/processed/features.csv, models/scaler_params.json
"""

import numpy as np
import pandas as pd
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import *

# ─── Chemins ──────────────────────────────────────────────────────────────────

BASE_DIR   = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IN_PATH    = os.path.join(BASE_DIR, 'data', 'raw', 'trajectories.csv')
OUT_FEAT   = os.path.join(BASE_DIR, 'data', 'processed', 'features.csv')
OUT_SCALER = os.path.join(BASE_DIR, 'models', 'scaler_params.json')

os.makedirs(os.path.join(BASE_DIR, 'data', 'processed'), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, 'models'), exist_ok=True)

# ─── Détection de phase ──────────────────────────────────────────────────────────────

ASCENT_THRESHOLD_KW = P_ASCENT_NOM_KW * 0.62  # cohérent avec engine_manager

def detect_phase(power_kw):
    conditions = [
        power_kw < 0.10,
        (power_kw >= 0.10) & (power_kw < ASCENT_THRESHOLD_KW),
        power_kw >= ASCENT_THRESHOLD_KW
    ]
    choices = ['pause', 'descent', 'ascent']
    return np.select(conditions, choices, default='pause')

# ─── Ingénierie des caractéristiques pour une trajectoire ─────────────────────────────

def engineer_features(df):
    df = df.copy().sort_values('t_seconds').reset_index(drop=True)

    rms   = df['rms_mms'].values
    power = df['power_kw'].values
    temp  = df['temp_c'].values
    humid = df['humidity_rh'].values
    t     = df['t_seconds'].values
    n     = len(df)

    phase = detect_phase(power)

    # Fenêtres glissantes (pandas pour la vitesse)
    s_rms   = pd.Series(rms)
    s_power = pd.Series(power)
    s_temp  = pd.Series(temp)
    s_humid = pd.Series(humid)

    # 1. rms_mms — directe
    f1 = rms.copy()

    # 2. drms_dt — différence première
    f2 = np.concatenate([[0], np.diff(rms)])

    # 3. rms_variability — écart-type glissant 60s
    f3 = s_rms.rolling(60, min_periods=1).std().fillna(0).values

    # 4. p_mean_kw — moyenne glissante 60s
    f4 = s_power.rolling(60, min_periods=1).mean().values

    # 5. p_rms_kw — RMS glissant 60s
    f5 = np.sqrt(s_power.pow(2).rolling(60, min_periods=1).mean()).values

    # 6. dp_dt — différence première de la puissance
    f6 = np.concatenate([[0], np.diff(power)])

    # 7. e_cycle_kwh — intégration trapézoïdale par cycle de montée
    f7 = np.zeros(n)
    in_ascent   = False
    ascent_start = 0
    for i in range(n):
        if phase[i] == 'ascent' and not in_ascent:
            in_ascent    = True
            ascent_start = i
        elif phase[i] != 'ascent' and in_ascent:
            in_ascent = False
            seg_t = t[ascent_start:i]
            seg_p = power[ascent_start:i]
            if len(seg_t) > 1:
                e = np.trapezoid(seg_p, seg_t) / 3600.0  # kWh
                f7[ascent_start:i] = e

    # 8. duration_ratio — durée mesurée de la montée / nominale 12s
    f8 = np.zeros(n)
    in_ascent    = False
    ascent_start = 0
    for i in range(n):
        if phase[i] == 'ascent' and not in_ascent:
            in_ascent    = True
            ascent_start = i
        elif phase[i] != 'ascent' and in_ascent:
            in_ascent = False
            duration  = t[i] - t[ascent_start]
            ratio     = duration / T_ASCENT_S
            f8[ascent_start:i] = ratio

    # 9. t_mean_c — moyenne glissante 5 min (300s)
    f9 = s_temp.rolling(300, min_periods=1).mean().values

    # 10. dt_dt — taux de variation de température °C/min
    t_mean_series = pd.Series(f9)
    f10 = (t_mean_series - t_mean_series.shift(60)).fillna(0).values / 60.0

    # 11. hr_std — écart-type glissant 60s de l'humidité
    f11 = s_humid.rolling(60, min_periods=1).std().fillna(0).values

    # 12. corr_t_p — Pearson r(T, P) sur fenêtre glissante 60 min (3600s)
    # Certaines versions de pandas retournent une série de longueur irrégulière
    # lorsqu'une fenêtre présente variance nulle (ex. phase pause prolongée ou
    # température stable) : on reindexe explicitement sur 0..n-1 puis on
    # remplace les NaN par 0 (hypothèse neutre = pas de corrélation linéaire).
    corr_raw = s_temp.rolling(3600, min_periods=60).corr(s_power)
    f12 = (
        pd.Series(corr_raw.to_numpy(), index=range(len(corr_raw)))
        .reindex(range(n))
        .fillna(0)
        .to_numpy()
    )

    # Garde-fou : tous les vecteurs doivent avoir la même longueur n.
    feats = {
        'rms_mms': f1, 'drms_dt': f2, 'rms_variability': f3,
        'p_mean_kw': f4, 'p_rms_kw': f5, 'dp_dt': f6,
        'e_cycle_kwh': f7, 'duration_ratio': f8,
        't_mean_c': f9, 'dt_dt': f10, 'hr_std': f11, 'corr_t_p': f12,
    }
    for name, arr in feats.items():
        if len(arr) != n:
            # Normalisation défensive : tronquer ou padder avec 0.
            if len(arr) > n:
                feats[name] = np.asarray(arr)[:n]
            else:
                feats[name] = np.concatenate([np.asarray(arr), np.zeros(n - len(arr))])

    feat_df = pd.DataFrame({
        'trajectory_id':  df['trajectory_id'].values,
        'profile':        df['profile'].values,
        't_seconds':      t,
        'simulated_hi':   df['simulated_hi'].values,
        'phase':          phase,
        **feats,
    })
    return feat_df

# ─── Normalisation Z-score ────────────────────────────────────────────────────

FEATURE_COLS = [
    'rms_mms', 'drms_dt', 'rms_variability',
    'p_mean_kw', 'p_rms_kw', 'dp_dt',
    'e_cycle_kwh', 'duration_ratio',
    't_mean_c', 'dt_dt', 'hr_std', 'corr_t_p'
]

def compute_scaler(feat_df, train_ids=None):
    """Calcule moyenne/écart-type sur la 1ère heure de données saines (trajectoires train uniquement)."""
    mask = (feat_df['t_seconds'] <= 3600) & (feat_df['simulated_hi'] >= 0.8)
    if train_ids is not None:
        mask = mask & feat_df['trajectory_id'].isin(train_ids)
    healthy = feat_df[mask]
    scaler  = {}
    for col in FEATURE_COLS:
        mean = float(healthy[col].mean())
        std  = float(healthy[col].std())
        std  = std if std > 1e-8 else 1.0  # éviter division par zéro
        scaler[col] = {'mean': mean, 'std': std}
    return scaler

def apply_normalization(feat_df, scaler):
    for col in FEATURE_COLS:
        mean = scaler[col]['mean']
        std  = scaler[col]['std']
        feat_df[col + '_norm'] = (feat_df[col] - mean) / std
    return feat_df

# ─── Principal ───────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Chargement de trajectories.csv ...")
    raw = pd.read_csv(IN_PATH)
    print(f"  Chargé {len(raw):,} lignes, {raw['trajectory_id'].nunique()} trajectoires")

    all_feats = []
    traj_ids  = sorted(raw['trajectory_id'].unique())

    for i, tid in enumerate(traj_ids):
        if i % 10 == 0:
            print(f"  Traitement trajectoire {i+1}/{len(traj_ids)} ...")
        df_traj = raw[raw['trajectory_id'] == tid]
        feats   = engineer_features(df_traj)
        all_feats.append(feats)

    print("Concaténation de toutes les caractéristiques ...")
    feat_df = pd.concat(all_feats, ignore_index=True)

    # Utiliser uniquement les IDs d'entraînement pour le scaler (éviter fuite de données)
    train_ids, _ = get_train_test_ids(traj_ids)
    print(f"Calcul du scaler sur données saines de référence (train uniquement, {len(train_ids)} trajectoires) ...")
    scaler = compute_scaler(feat_df, train_ids=train_ids)

    print("Application de la normalisation Z-score ...")
    feat_df = apply_normalization(feat_df, scaler)

    feat_df.to_csv(OUT_FEAT, index=False)
    print(f"✅ Caractéristiques sauvegardées → {OUT_FEAT}")
    print(f"   Forme : {feat_df.shape}")

    with open(OUT_SCALER, 'w') as f:
        json.dump(scaler, f, indent=2)
    print(f"✅ Scaler sauvegardé  → {OUT_SCALER}")

    print(f"\n   Colonnes de caractéristiques : {FEATURE_COLS}")
    print(f"   Exemple (1ère ligne) :\n{feat_df[FEATURE_COLS].iloc[0]}")