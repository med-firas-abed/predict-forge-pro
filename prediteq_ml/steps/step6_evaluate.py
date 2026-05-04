"""
Step 6 — Evaluation & Visualization
All metrics and plots for PFE jury.
Output: outputs/metrics.json + 5 plots in outputs/plots/
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import json
import os
import sys
import joblib
import datetime
import subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import *
from sklearn.metrics import precision_score, recall_score, f1_score
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import shap

# Partage : même formulation sans-fuite que step5 (franchissement hi_smooth).
# On supporte les deux modes d'exécution (`python -m steps.step6_evaluate` et
# `python steps\step6_evaluate.py`) en essayant d'abord l'import qualifié.
try:
    from steps.step5_rul_model import find_threshold_crossing
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from step5_rul_model import find_threshold_crossing

# ─── Paths ────────────────────────────────────────────────────────────────────

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

# ─── Style ────────────────────────────────────────────────────────────────────

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

# ─── Plot 1 — HI curves for all profiles ──────────────────────────────────────

def plot_hi_curves(hi_df):
    fig, axes = plt.subplots(2, 2, figsize=(14, 8), sharex=False)
    axes = axes.flatten()
    profiles = sorted(hi_df['profile'].unique())

    for ax, prof in zip(axes, profiles):
        trajs = hi_df[hi_df['profile'] == prof]['trajectory_id'].unique()
        sample_trajs = trajs[:5]  # plot 5 per profile for clarity

        for tid in sample_trajs:
            t = hi_df[hi_df['trajectory_id'] == tid]
            ax.plot(
                t['t_seconds'] / 3600,
                t['hi_smooth'],
                alpha=0.6, linewidth=1.2,
                color=PROFILE_COLORS[prof]
            )

        # Zone bands
        ax.axhspan(0.8, 1.0, alpha=0.08, color='#2ecc71')
        ax.axhspan(0.6, 0.8, alpha=0.08, color='#f1c40f')
        ax.axhspan(0.3, 0.6, alpha=0.08, color='#e67e22')
        ax.axhspan(0.0, 0.3, alpha=0.08, color='#e74c3c')
        ax.axhline(0.8, color='#2ecc71', linewidth=0.8, linestyle='--')
        ax.axhline(0.6, color='#f1c40f', linewidth=0.8, linestyle='--')
        ax.axhline(0.3, color='#e74c3c', linewidth=0.8, linestyle='--')

        ax.set_title(f'Profile {prof}', fontweight='bold')
        ax.set_xlabel('Time (hours)')
        ax.set_ylabel('Health Index')
        ax.set_ylim(0, 1)

    fig.suptitle('Health Index Curves — All Profiles', fontsize=14, fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot1_hi_curves.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Saved: {path}')

# ─── Plot 2 — Predicted vs True RUL ──────────────────────────────────────────

def plot_rul_scatter(preds_df):
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Left: all profiles colored
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
    ax.plot([0, lim], [0, lim], 'k--', linewidth=1.5, label='Perfect prediction')
    ax.set_xlabel('True RUL (days)')
    ax.set_ylabel('Predicted RUL (days)')
    ax.set_title('Predicted vs True RUL', fontweight='bold')
    ax.legend(markerscale=3, fontsize=9)

    # Right: with CI shading per profile
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
    ax2.set_xlabel('True RUL (days)')
    ax2.set_ylabel('Predicted RUL (days)')
    ax2.set_title('Predicted vs True RUL with CI', fontweight='bold')
    ax2.legend(markerscale=3, fontsize=9)

    rmse = np.sqrt(mean_squared_error(preds_df['rul_true_days'], preds_df['rul_pred_days']))
    r2   = r2_score(preds_df['rul_true_days'], preds_df['rul_pred_days'])
    fig.suptitle(f'RUL Regression  |  RMSE={rmse:.2f} days  R²={r2:.3f}',
                 fontsize=13, fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot2_rul_scatter.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Saved: {path}')

# ─── Plot 3 — Anomaly timeline ────────────────────────────────────────────────

def plot_anomaly_timeline(scores_df, hi_df):
    # Pick one representative trajectory per profile
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
                alpha=0.6, linewidth=0.8, label='IF anomaly score')
        ax.plot(t_h,  sc['rms_flag'] * sc['score_anomaly'].max(),
                color='#3498db', alpha=0.5, linewidth=0.8,
                linestyle='--', label='RMS flag')
        ax2.plot(t_hi, hi['hi_smooth'], color='#2ecc71',
                 linewidth=1.5, label='HI smooth')

        ax.set_ylabel('Anomaly score', color='#e74c3c')
        ax2.set_ylabel('Health Index', color='#2ecc71')
        ax2.set_ylim(0, 1)
        ax.set_title(f'Profile {prof} — Traj {tid}', fontweight='bold')
        ax.set_xlabel('Time (hours)')

        lines1, labels1 = ax.get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        ax.legend(lines1 + lines2, labels1 + labels2, fontsize=8, loc='upper right')

    fig.suptitle('Anomaly Timeline: IF Score vs RMS Threshold vs HI',
                 fontsize=13, fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot3_anomaly_timeline.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Saved: {path}')

# ─── Plot 4 — SHAP summary ────────────────────────────────────────────────────

def plot_shap(rf_model, hi_df, train_ids, feats_df=None):
    print('  Computing SHAP values ...')

    # The RF model expects 17 features:
    # 12 normalized sensor features + hi_now + hi_mean + hi_std + hi_min + hi_slope
    # Use the predictions file which has the test samples already built
    # Rebuild a small sample of test inputs from hi + features

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

        # Cible dérivée de hi_smooth (observable) — même formulation que step5
        # pas de fuite via simulated_hi.
        hi_vals = merged['hi_smooth'].values
        t_fail_idx = find_threshold_crossing(
            hi_vals, HI_CRITICAL, RUL_CROSSING_PERSISTENCE
        )
        if t_fail_idx is None:
            continue

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
        print('  No SHAP samples available — skipping.')
        return

    X_shap = np.array(samples[:100])  # limit to 100 for speed
    feat_names = NORM_COLS_LOCAL + ['hi_now', 'hi_mean', 'hi_std', 'hi_min', 'hi_slope']

    explainer = shap.TreeExplainer(rf_model)
    shap_vals = explainer.shap_values(X_shap, check_additivity=False)

    fig, ax = plt.subplots(figsize=(10, 8))
    shap.summary_plot(
        shap_vals, X_shap,
        feature_names=feat_names,
        show=False, max_display=17
    )
    plt.title('SHAP Feature Importance — RUL Prediction', fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot4_shap_summary.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Saved: {path}')

# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import gc

    NORM_COLS = [
        'rms_mms_norm', 'drms_dt_norm', 'rms_variability_norm',
        'p_mean_kw_norm', 'p_rms_kw_norm', 'dp_dt_norm',
        'e_cycle_kwh_norm', 'duration_ratio_norm',
        't_mean_c_norm', 'dt_dt_norm', 'hr_std_norm', 'corr_t_p_norm'
    ]

    # ── Stage 1: Load small files + scores (for IF metrics & plots 1-3) ──────
    print('Loading hi / preds / model ...')
    hi_df     = pd.read_csv(IN_HI)
    preds_df  = pd.read_csv(IN_PREDS)
    rf_model  = joblib.load(IN_RF)

    train_ids, test_ids = get_train_test_ids(hi_df['trajectory_id'].unique())

    print('Loading anomaly_scores.csv ...')
    scores_df = pd.read_csv(IN_SCORES, low_memory=False)

    # ── IF metrics ────────────────────────────────────────────────────────────
    print('\n-- Anomaly detection metrics --')
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

    print(f'  IF only   — Precision:{if_prec:.3f} Recall:{if_rec:.3f} F1:{if_f1:.3f}')
    print(f'  RMS only  — Precision:{rms_prec:.3f} Recall:{rms_rec:.3f} F1:{rms_f1:.3f}')
    print(f'  Hybrid AND— Precision:{and_prec:.3f} Recall:{and_rec:.3f} F1:{and_f1:.3f}')
    print(f'  Hybrid wt — Precision:{hyb_prec:.3f} Recall:{hyb_rec:.3f} F1:{hyb_f1:.3f}')

    # ── RUL metrics ───────────────────────────────────────────────────────────
    print('\n-- RUL metrics --')
    rmse = float(np.sqrt(mean_squared_error(preds_df['rul_true_days'], preds_df['rul_pred_days'])))
    mae  = float(mean_absolute_error(preds_df['rul_true_days'], preds_df['rul_pred_days']))
    r2   = float(r2_score(preds_df['rul_true_days'], preds_df['rul_pred_days']))
    print(f'  RMSE={rmse:.3f} days | MAE={mae:.3f} days | R2={r2:.4f}')

    # ── Charger résumé CV (écrit par step5) ───────────────────────────────────
    cv_path = os.path.join(BASE_DIR, 'outputs', 'rul_cv_scores.json')
    cv_block        = None
    baselines_block = None
    balance_block   = None
    if os.path.exists(cv_path):
        with open(cv_path) as f:
            cv_summary = json.load(f)
        cv_block        = cv_summary.get('cross_validation_groupkfold')
        baselines_block = cv_summary.get('baselines_holdout')
        balance_block   = cv_summary.get('profile_balance')

    # ── Save metrics (avec versionnage et traçabilité) ────────────────────────
    try:
        commit = subprocess.check_output(
            ['git', '-C', BASE_DIR, 'rev-parse', '--short', 'HEAD'],
            stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        commit = 'n/a'

    train_pct = int(round(TRAIN_RATIO * 100))
    test_pct = 100 - train_pct

    metrics = {
        'generated_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'pipeline_version': '2.0-no-leakage',
        'git_commit':       commit,
        'methodology': {
            'rul_target_source': 'hi_smooth (signal observable, franchissement persistant)',
            'rul_crossing_persistence': RUL_CROSSING_PERSISTENCE,
            'train_test_split':  f"{train_pct}/{test_pct} group-based (no leakage)",
            'iso_reference':     'ISO 10816-3:2009 — severity zones A/B/C/D',
            'prognostic_reference': 'IEEE Std 1856-2017 — Prognostics for Systems',
        },
        'anomaly_detection': {
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
        },
        'rul_regression': {
            'holdout': {
                'rmse_days': rmse, 'mae_days': mae, 'r2': r2
            },
            'cross_validation':   cv_block,
            'baselines_holdout':  baselines_block,
            'profile_balance':    balance_block,
        },
        # Alias plats pour compatibilité avec outils/frontend existants qui
        # consomment metrics.json en lecture seule. Ne pas retirer.
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
    }
    metrics['rul_regression']['rmse_days'] = rmse
    metrics['rul_regression']['mae_days']  = mae
    metrics['rul_regression']['r2']        = r2

    with open(OUT_METRICS, 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f'\nOK: Metrics saved -> {OUT_METRICS}')

    # ── Plots 1-3 (use hi_df, preds_df, scores_df) ───────────────────────────
    print('\nGenerating plots ...')
    print('  Plot 1 — HI curves ...')
    plot_hi_curves(hi_df)

    print('  Plot 2 — RUL scatter ...')
    plot_rul_scatter(preds_df)

    print('  Plot 3 — Anomaly timeline ...')
    plot_anomaly_timeline(scores_df, hi_df)

    # Free scores_df (largest so far) before loading feats_df
    del scores_df, df_test_scores, preds_df
    gc.collect()

    # ── Stage 2: Load features for SHAP & sensitivity (plots 4-5) ────────────
    print('  Loading features.csv for SHAP ...')
    feats_df  = pd.read_csv(IN_FEATS, low_memory=False)

    print('  Plot 4 — SHAP ...')
    plot_shap(rf_model, hi_df, train_ids, feats_df=feats_df)

    print('  Plot 5 — Sensitivity heatmap ...')

    # Inline sensitivity (no separate module needed)
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

    res_df = pd.DataFrame(sens_results).set_index('contamination')
    fig, axes = plt.subplots(1, 3, figsize=(14, 4))
    for ax, col in zip(axes, ['precision', 'recall', 'false_positives']):
        vals = res_df[[col]].T
        sns.heatmap(vals, annot=True,
                    fmt='.3f' if col != 'false_positives' else '.0f',
                    cmap='RdYlGn' if col != 'false_positives' else 'RdYlGn_r',
                    ax=ax, linewidths=0.5)
        ax.set_title(col.replace('_', ' ').title(), fontweight='bold')
        ax.set_xlabel('Contamination')
    fig.suptitle('IF Sensitivity Analysis', fontsize=13, fontweight='bold')
    plt.tight_layout()
    path = os.path.join(PLOTS_DIR, 'plot5_sensitivity_heatmap.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'  Saved: {path}')

    print(f'\nOK: Step 6 done - all plots in {PLOTS_DIR}')
