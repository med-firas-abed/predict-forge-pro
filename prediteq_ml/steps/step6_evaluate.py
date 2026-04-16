"""
Étape 6 — Évaluation & Visualisation
Toutes les métriques et graphiques pour le jury PFE.
Sortie : outputs/metrics.json + 5 graphiques dans outputs/plots/
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import json
import os
import sys
import joblib

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import *
from sklearn.metrics import precision_score, recall_score, f1_score
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import shap

# ─── Chemins ──────────────────────────────────────────────────────────────────

BASE_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IN_HI       = os.path.join(BASE_DIR, 'data', 'processed', 'hi.csv')
IN_SCORES   = os.path.join(BASE_DIR, 'data', 'processed', 'anomaly_scores.csv')
IN_PREDS    = os.path.join(BASE_DIR, 'data', 'processed', 'rul_predictions.csv')
IN_FEATS    = os.path.join(BASE_DIR, 'data', 'processed', 'features.csv')
IN_RF       = os.path.join(BASE_DIR, 'models', 'random_forest_rul.pkl')
OUT_METRICS = os.path.join(BASE_DIR, 'outputs', 'metrics.json')
PLOTS_DIR   = os.path.join(BASE_DIR, 'outputs', 'plots')

os.makedirs(PLOTS_DIR, exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, 'outputs'), exist_ok=True)

# ─── Style ───────────────────────────────────────────────────────────────────────────

sns.set_theme(style='whitegrid', font_scale=1.1)
ZONE_COLORS = {
    'Excellent': '#2ecc71',
    'Good':      '#f1c40f',
    'Degraded':  '#e67e22',
    'Critical':  '#e74c3c',
}
PROFILE_COLORS = {
    'A_linear':       '#3498db',
    'B_exponential':  '#9b59b6',
    'C_stepwise':     '#e67e22',
    'D_noisy_linear': '#e74c3c',
}

# ─── Graphique 1 — Courbes HI pour tous les profils ──────────────────────────

def plot_hi_curves(hi_df):
    fig, axes = plt.subplots(2, 2, figsize=(14, 8), sharex=False)
    axes = axes.flatten()
    profiles = sorted(hi_df['profile'].unique())

    for ax, prof in zip(axes, profiles):
        trajs = hi_df[hi_df['profile'] == prof]['trajectory_id'].unique()
        sample_trajs = trajs[:5]  # 5 par profil pour la clarté

        for tid in sample_trajs:
            t = hi_df[hi_df['trajectory_id'] == tid]
            ax.plot(
                t['t_seconds'] / 3600,
                t['hi_smooth'],
                alpha=0.6, linewidth=1.2,
                color=PROFILE_COLORS[prof]
            )

        # Bandes de zone
        ax.axhspan(0.8, 1.0, alpha=0.08, color='#2ecc71')
        ax.axhspan(0.6, 0.8, alpha=0.08, color='#f1c40f')
        ax.axhspan(0.3, 0.6, alpha=0.08, color='#e67e22')
        ax.axhspan(0.0, 0.3, alpha=0.08, color='#e74c3c')
        ax.axhline(0.8, color='#2ecc71', linewidth=0.8, linestyle='--')
        ax.axhline(0.6, color='#f1c40f', linewidth=0.8, linestyle='--')
        ax.axhline(0.3, color='#e74c3c', linewidth=0.8, linestyle='--')

        ax.set_title(f'Profil {prof}', fontweight='bold')
        ax.set_xlabel('Temps (heures)')
        ax.set_ylabel('Indice de Santé')
        ax.set_ylim(0, 1)

    fig.suptitle('Courbes d\'Indice de Santé — Tous les Profils', fontsize=14, fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot1_hi_curves.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Sauvegardé : {path}')

# ─── Graphique 2 — RUL Prédit vs Réel ────────────────────────────────────────

def plot_rul_scatter(preds_df):
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Gauche : tous les profils colorés
    ax = axes[0]
    for prof, color in PROFILE_COLORS.items():
        mask = preds_df['profile'] == prof
        if mask.sum() == 0:
            continue
        ax.scatter(
            preds_df[mask]['rul_true_days'],
            preds_df[mask]['rul_pred_days'],
            alpha=0.4, s=8, color=color, label=prof
        )

    lim = max(preds_df['rul_true_days'].max(), preds_df['rul_pred_days'].max()) * 1.05
    ax.plot([0, lim], [0, lim], 'k--', linewidth=1.5, label='Prédiction parfaite')
    ax.set_xlabel('RUL Réel (jours)')
    ax.set_ylabel('RUL Prédit (jours)')
    ax.set_title('RUL Prédit vs Réel', fontweight='bold')
    ax.legend(markerscale=3, fontsize=9)

    # Droite : avec ombrage IC par profil
    ax2 = axes[1]
    for prof, color in PROFILE_COLORS.items():
        mask = preds_df['profile'] == prof
        if mask.sum() == 0:
            continue
        sub = preds_df[mask].sort_values('rul_true_days')
        ax2.fill_between(
            sub['rul_true_days'],
            sub['ci_low_days'],
            sub['ci_high_days'],
            alpha=0.15, color=color
        )
        ax2.scatter(
            sub['rul_true_days'],
            sub['rul_pred_days'],
            alpha=0.5, s=8, color=color, label=prof
        )

    ax2.plot([0, lim], [0, lim], 'k--', linewidth=1.5)
    ax2.set_xlabel('RUL Réel (jours)')
    ax2.set_ylabel('RUL Prédit (jours)')
    ax2.set_title('RUL Prédit vs Réel avec IC', fontweight='bold')
    ax2.legend(markerscale=3, fontsize=9)

    rmse = np.sqrt(mean_squared_error(preds_df['rul_true_days'], preds_df['rul_pred_days']))
    r2   = r2_score(preds_df['rul_true_days'], preds_df['rul_pred_days'])
    fig.suptitle(f'Régression RUL  |  RMSE={rmse:.2f} jours  R²={r2:.3f}',
                 fontsize=13, fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot2_rul_scatter.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Sauvegardé : {path}')

# ─── Graphique 3 — Chronologie des anomalies ─────────────────────────────────

def plot_anomaly_timeline(scores_df, hi_df):
    # Une trajectoire représentative par profil
    fig, axes = plt.subplots(4, 1, figsize=(14, 12), sharex=False)
    profiles  = sorted(scores_df['profile'].unique())

    for ax, prof in zip(axes, profiles):
        tid   = scores_df[scores_df['profile'] == prof]['trajectory_id'].iloc[0]
        sc    = scores_df[scores_df['trajectory_id'] == tid].sort_values('t_seconds')
        hi    = hi_df[hi_df['trajectory_id'] == tid].sort_values('t_seconds')

        t_h   = sc['t_seconds'].values / 3600
        t_hi  = hi['t_seconds'].values / 3600

        ax2 = ax.twinx()
        ax.plot(t_h,  sc['score_anomaly'], color='#e74c3c',
                alpha=0.6, linewidth=0.8, label='Score anomalie IF')
        ax.plot(t_h,  sc['rms_flag'] * sc['score_anomaly'].max(),
                color='#3498db', alpha=0.5, linewidth=0.8,
                linestyle='--', label='Drapeau RMS')
        ax2.plot(t_hi, hi['hi_smooth'], color='#2ecc71',
                 linewidth=1.5, label='HI lissé')

        ax.set_ylabel('Score d\'anomalie', color='#e74c3c')
        ax2.set_ylabel('Indice de Santé', color='#2ecc71')
        ax2.set_ylim(0, 1)
        ax.set_title(f'Profil {prof} — Traj {tid}', fontweight='bold')
        ax.set_xlabel('Temps (heures)')

        lines1, labels1 = ax.get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        ax.legend(lines1 + lines2, labels1 + labels2, fontsize=8, loc='upper right')

    fig.suptitle('Chronologie des Anomalies : Score IF vs Seuil RMS vs HI',
                 fontsize=13, fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot3_anomaly_timeline.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Sauvegardé : {path}')

# ─── Graphique 4 — Résumé SHAP ──────────────────────────────────────────────

def plot_shap(rf_model, hi_df, train_ids, feats_df=None):
    print('  Calcul des valeurs SHAP ...')

    # Le modèle RF attend 17 caractéristiques :
    # 12 capteurs normalisés + hi_now + hi_mean + hi_std + hi_min + hi_slope
    # Reconstruire un petit échantillon d'entrées test depuis hi + features

    NORM_COLS_LOCAL = [
        'rms_mms_norm', 'drms_dt_norm', 'rms_variability_norm',
        'p_mean_kw_norm', 'p_rms_kw_norm', 'dp_dt_norm',
        'e_cycle_kwh_norm', 'duration_ratio_norm',
        't_mean_c_norm', 'dt_dt_norm', 'hr_std_norm', 'corr_t_p_norm'
    ]

    _, test_ids = get_train_test_ids(hi_df['trajectory_id'].unique())

    if feats_df is None:
        feats_df  = pd.read_csv(os.path.join(BASE_DIR, 'data', 'processed', 'features.csv'), low_memory=False)
    feat_1min = feats_df[feats_df['t_seconds'] % 60 == 0].copy()

    samples = []
    for tid in test_ids[:5]:
        traj = hi_df[hi_df['trajectory_id'] == tid].sort_values('t_seconds').reset_index(drop=True)
        traj_feat = feat_1min[feat_1min['trajectory_id'] == tid].sort_values('t_seconds').reset_index(drop=True)
        merged = traj.merge(traj_feat[['trajectory_id', 't_seconds'] + NORM_COLS_LOCAL],
                            on=['trajectory_id', 't_seconds'], how='inner').reset_index(drop=True)

        # Utiliser simulated_hi (vérité terrain) pour détection de défaillance — comme étape 5
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

        for i in range(RUL_LOOKBACK_MIN, min(t_fail_idx, RUL_LOOKBACK_MIN + 50)):
            window = merged.loc[i - RUL_LOOKBACK_MIN:i - 1, 'hi_smooth'].values
            if len(window) < RUL_LOOKBACK_MIN:
                continue
            sensor_feats = merged.loc[i, NORM_COLS_LOCAL].values.astype(float)
            hi_now   = hi_vals[i]
            hi_mean  = np.mean(window)
            hi_std   = np.std(window)
            hi_min   = np.min(window)
            hi_slope = np.polyfit(np.arange(len(window)), window, 1)[0]
            row = np.concatenate([sensor_feats, [hi_now, hi_mean, hi_std, hi_min, hi_slope]])
            samples.append(row)

    if len(samples) == 0:
        print('  Aucun échantillon SHAP disponible — ignoré.')
        return

    X_shap = np.array(samples[:100])  # limiter à 100 pour la vitesse
    feat_names = NORM_COLS_LOCAL + ['hi_now', 'hi_mean', 'hi_std', 'hi_min', 'hi_slope']

    explainer = shap.TreeExplainer(rf_model)
    shap_vals = explainer.shap_values(X_shap, check_additivity=False)

    shap.summary_plot(
        shap_vals, X_shap,
        feature_names=feat_names,
        show=False, max_display=17
    )
    plt.title('Importance des Caractéristiques SHAP — Prédiction RUL', fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot4_shap_summary.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close('all')
    print(f'  Sauvegardé : {path}')

# ─── Principal ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import gc

    NORM_COLS = [
        'rms_mms_norm', 'drms_dt_norm', 'rms_variability_norm',
        'p_mean_kw_norm', 'p_rms_kw_norm', 'dp_dt_norm',
        'e_cycle_kwh_norm', 'duration_ratio_norm',
        't_mean_c_norm', 'dt_dt_norm', 'hr_std_norm', 'corr_t_p_norm'
    ]

    # ── Étape 1 : Charger petits fichiers + scores (métriques IF & graphiques 1-3) ──
    print('Chargement hi / preds / modèle ...')
    hi_df     = pd.read_csv(IN_HI)
    preds_df  = pd.read_csv(IN_PREDS)
    rf_model  = joblib.load(IN_RF)

    train_ids, test_ids = get_train_test_ids(hi_df['trajectory_id'].unique())

    print('Chargement de anomaly_scores.csv ...')
    scores_df = pd.read_csv(IN_SCORES, low_memory=False)

    # ── Métriques IF ──────────────────────────────────────────────────────
    print('\n-- Métriques de détection d\'anomalies --')
    df_test_scores = scores_df[scores_df['trajectory_id'].isin(test_ids)]
    y_true = (df_test_scores['simulated_hi'] < 0.6).astype(int).values
    y_if   = df_test_scores['if_flag'].values
    y_rms  = df_test_scores['rms_flag'].values
    y_hyb  = df_test_scores['hybrid_flag'].values if 'hybrid_flag' in df_test_scores.columns else y_if
    y_and  = df_test_scores['hybrid_and_flag'].values if 'hybrid_and_flag' in df_test_scores.columns else y_if

    if_prec = float(precision_score(y_true, y_if,  zero_division=0))
    if_rec  = float(recall_score(y_true,    y_if,  zero_division=0))
    if_f1   = float(f1_score(y_true,        y_if,  zero_division=0))
    rms_prec= float(precision_score(y_true, y_rms, zero_division=0))
    rms_rec = float(recall_score(y_true,    y_rms, zero_division=0))
    rms_f1  = float(f1_score(y_true,        y_rms, zero_division=0))
    hyb_prec= float(precision_score(y_true, y_hyb, zero_division=0))
    hyb_rec = float(recall_score(y_true,    y_hyb, zero_division=0))
    hyb_f1  = float(f1_score(y_true,        y_hyb, zero_division=0))
    and_prec= float(precision_score(y_true, y_and, zero_division=0))
    and_rec = float(recall_score(y_true,    y_and, zero_division=0))
    and_f1  = float(f1_score(y_true,        y_and, zero_division=0))

    print(f'  IF seul    — Précision:{if_prec:.3f} Rappel:{if_rec:.3f} F1:{if_f1:.3f}')
    print(f'  RMS seul   — Précision:{rms_prec:.3f} Rappel:{rms_rec:.3f} F1:{rms_f1:.3f}')
    print(f'  Hybride AND— Précision:{and_prec:.3f} Rappel:{and_rec:.3f} F1:{and_f1:.3f}')
    print(f'  Hybride wt — Précision:{hyb_prec:.3f} Rappel:{hyb_rec:.3f} F1:{hyb_f1:.3f}')

    # ── Métriques RUL ─────────────────────────────────────────────────────
    print('\n-- Métriques RUL --')
    rmse = float(np.sqrt(mean_squared_error(preds_df['rul_true_days'], preds_df['rul_pred_days'])))
    mae  = float(mean_absolute_error(preds_df['rul_true_days'], preds_df['rul_pred_days']))
    r2   = float(r2_score(preds_df['rul_true_days'], preds_df['rul_pred_days']))
    print(f'  RMSE={rmse:.3f} jours | MAE={mae:.3f} jours | R2={r2:.4f}')

    # ── Sauvegarder les métriques ────────────────────────────────────────────────
    metrics = {
        'isolation_forest': {
            'precision': if_prec, 'recall': if_rec, 'f1': if_f1
        },
        'rms_baseline': {
            'precision': rms_prec, 'recall': rms_rec, 'f1': rms_f1
        },
        'hybrid_ensemble': {
            'precision': hyb_prec, 'recall': hyb_rec, 'f1': hyb_f1
        },
        'hybrid_and': {
            'precision': and_prec, 'recall': and_rec, 'f1': and_f1
        },
        'rul_regression': {
            'rmse_days': rmse, 'mae_days': mae, 'r2': r2
        }
    }
    with open(OUT_METRICS, 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f'\n✅ Métriques sauvegardées -> {OUT_METRICS}')

    # ── Graphiques 1-3 (utilise hi_df, preds_df, scores_df) ─────────────
    print('\nGénération des graphiques ...')
    print('  Graphique 1 — Courbes HI ...')
    plot_hi_curves(hi_df)

    print('  Graphique 2 — Nuage RUL ...')
    plot_rul_scatter(preds_df)

    print('  Graphique 3 — Chronologie anomalies ...')
    plot_anomaly_timeline(scores_df, hi_df)

    # Libérer scores_df (le plus gros) avant de charger feats_df
    del scores_df, df_test_scores, preds_df
    gc.collect()

    # ── Étape 2 : Charger caractéristiques pour SHAP & sensibilité (graphiques 4-5) ──
    print('  Chargement de features.csv pour SHAP ...')
    feats_df  = pd.read_csv(IN_FEATS, low_memory=False)

    print('  Graphique 4 — SHAP ...')
    plot_shap(rf_model, hi_df, train_ids, feats_df=feats_df)

    print('  Graphique 5 — Carte de sensibilité ...')

    # Analyse de sensibilité inline (pas besoin de module séparé)
    from sklearn.ensemble import IsolationForest as IFModel
    contams = [0.01, 0.05, 0.10]
    sens_results = []
    mask_healthy = (
        (feats_df['trajectory_id'].isin(train_ids)) &
        (feats_df['t_seconds'] <= 3600) &
        (feats_df['simulated_hi'] >= 0.8)
    )
    X_healthy    = feats_df[mask_healthy][NORM_COLS].values
    df_test_f    = feats_df[feats_df['trajectory_id'].isin(test_ids)]
    y_true_f     = (df_test_f['simulated_hi'] < 0.6).astype(int).values

    for cont in contams:
        m      = IFModel(n_estimators=100, contamination=cont, random_state=42)
        m.fit(X_healthy)
        sc     = m.score_samples(df_test_f[NORM_COLS].values)
        y_pred = (sc < 0).astype(int)
        sens_results.append({
            'contamination':  cont,
            'precision':      float(precision_score(y_true_f, y_pred, zero_division=0)),
            'recall':         float(recall_score(y_true_f,    y_pred, zero_division=0)),
            'false_positives':int(((y_pred == 1) & (y_true_f == 0)).sum())
        })

    TITLE_MAP = {'precision': 'Précision', 'recall': 'Rappel', 'false_positives': 'Faux Positifs'}
    res_df = pd.DataFrame(sens_results).set_index('contamination')
    fig, axes = plt.subplots(1, 3, figsize=(14, 4))
    for ax, col in zip(axes, ['precision', 'recall', 'false_positives']):
        vals = res_df[[col]].T
        sns.heatmap(vals, annot=True,
                    fmt='.3f' if col != 'false_positives' else '.0f',
                    cmap='RdYlGn' if col != 'false_positives' else 'RdYlGn_r',
                    ax=ax, linewidths=0.5)
        ax.set_title(TITLE_MAP[col], fontweight='bold')
        ax.set_xlabel('Contamination')
    fig.suptitle('Analyse de Sensibilité IF', fontsize=13, fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot5_sensitivity_heatmap.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Sauvegardé : {path}')

    print(f'\n✅ Étape 6 terminée — tous les graphiques dans {PLOTS_DIR}')