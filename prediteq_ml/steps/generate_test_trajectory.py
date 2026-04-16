"""
Génération de trajectoire de test pour ASC-A1 (ascenseur Ben Arous).
Utilise le MÊME modèle physique que l'étape 1 mais un seed DIFFÉRENT (seed=2026),
pour produire des données inédites pour le pipeline ML.

Machine : SITI FC100L1-4, 2.2 kW, 400V triphasé, cos(φ)=0.80, réducteur 1:60
Profil : B_exponential — usure de roulement réducteur (début lent, accélérant)
         HI = 1 − 0.7 × (t/t_fail)²

Sortie : data/raw/test_trajectories.csv  (trajectoire unique, ID 101)
"""

import numpy as np
import pandas as pd
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from config import *

# Seed DIFFÉRENT de l'entraînement (entraînement utilise seed=42)
np.random.seed(2026)

# Uniquement B_exponential — la défaillance la plus réaliste pour un ascenseur à réducteur :
# l'usure des roulements commence imperceptiblement puis accélère à mesure que le jeu augmente.
PROFILE   = 'B_exponential'
TRAJ_ID   = 101
T_FAIL_BASE = TRAJECTORY_LEN_MIN * 60  # secondes


def compute_hi(profile, t_arr, t_fail):
    ratio = t_arr / t_fail
    if profile == 'A_linear':
        return np.clip(1 - 0.7 * ratio, 0, 1)
    elif profile == 'B_exponential':
        return np.clip(1 - 0.7 * ratio**2, 0, 1)
    elif profile == 'C_stepwise':
        step = np.floor(5 * ratio) / 5
        return np.clip(1 - 0.85 * step, 0, 1)
    elif profile == 'D_noisy_linear':
        base  = np.clip(1 - 0.7 * ratio, 0, 1)
        noise = np.random.normal(0, 0.08, size=len(t_arr))
        return np.clip(base + noise, 0, 1)


def hi_to_rms(hi, t_seconds):
    n   = len(hi)
    rms = np.zeros(n)
    for i in range(n):
        h = hi[i]
        if h >= 0.8:
            rms[i] = np.random.uniform(0.8, 1.5)
        elif h >= 0.6:
            rms[i] = np.random.uniform(1.5, 2.0)
        elif h >= 0.3:
            rms[i] = np.random.uniform(2.0, 4.5)
        else:
            rms[i] = np.random.uniform(4.5, 7.5)
    rms += A_CHASSIS_MMS * np.sin(2 * np.pi * F_CHASSIS_HZ * t_seconds)
    rms *= (1 + np.random.normal(0, NOISE_VTV122, size=n))
    return np.clip(rms, 0.1, 10.0)


def compute_power_and_current(hi, t_seconds, load_kg):
    n       = len(t_seconds)
    phase_t = t_seconds % T_CYCLE_S
    power   = np.zeros(n)
    current = np.zeros(n)
    phase   = np.full(n, 'pause', dtype=object)
    load_ratio = load_kg / LOAD_MAX_KG
    for i in range(n):
        pt = phase_t[i]
        h  = hi[i]
        if pt < T_ASCENT_S:
            phase[i] = 'ascent'
            p_load = P_ASCENT_EMPTY_KW + P_ASCENT_LOAD_RANGE * load_ratio
            p_deg  = P_ASCENT_DEG_RANGE * (1 - h)
            power[i] = np.clip(p_load + p_deg, P_ASCENT_EMPTY_KW, P_ASCENT_DEG_KW)
        elif pt < T_ASCENT_S + T_DESCENT_S:
            phase[i] = 'descent'
            power[i] = P_DESCENT_KW
        else:
            phase[i] = 'pause'
            power[i] = P_PAUSE_KW
    power += np.random.normal(0, NOISE_PAC2200 * P_ASCENT_NOM_KW, size=n)
    power = np.clip(power, 0.0, 3.0)
    current = (power * 1000) / MOTOR_SQRT3_V_COSPHI
    return power, current, phase


def compute_temp_humidity(t_seconds, power):
    t_slow = np.arange(0, t_seconds[-1] + 1, 10)
    n_slow = len(t_slow)
    amb_temp   = TEMP_MIN_C + (TEMP_MAX_C - TEMP_MIN_C) * (
        0.5 + 0.5 * np.sin(2 * np.pi * t_slow / (t_seconds[-1] + 1))
    )
    idx_slow   = np.clip(t_slow.astype(int), 0, len(power) - 1)
    motor_heat = 3.5 * (power[idx_slow] / P_ASCENT_DEG_KW)
    temp_slow  = amb_temp + motor_heat + np.random.normal(0, NOISE_TEMP_C, size=n_slow)
    humid_slow = HUMID_MIN_RH + (HUMID_MAX_RH - HUMID_MIN_RH) * (
        0.5 + 0.5 * np.cos(2 * np.pi * t_slow / (t_seconds[-1] + 1))
    ) + np.random.normal(0, NOISE_HUMID_RH, size=n_slow)
    temp_1hz  = np.interp(t_seconds, t_slow, temp_slow)
    humid_1hz = np.interp(t_seconds, t_slow, humid_slow)
    return temp_1hz, np.clip(humid_1hz, HUMID_MIN_RH, HUMID_MAX_RH)


def simulate_trajectory(traj_id, profile, load_kg=LOAD_NOMINAL_KG):
    i_ratio_sq  = (load_kg / LOAD_MAX_KG) ** 2 if LOAD_MAX_KG > 0 else 1.0
    deg_rate    = 0.3 + 0.7 * i_ratio_sq
    t_fail      = T_FAIL_BASE * np.random.uniform(0.75, 0.95) / max(deg_rate, 0.3)
    t_fail      = min(t_fail, T_FAIL_BASE * 0.95)
    t_end       = int(min(t_fail * 1.10, T_FAIL_BASE))
    t_seconds   = np.arange(0, t_end, 1, dtype=float)
    hi               = compute_hi(profile, t_seconds, t_fail)
    rms_mms          = hi_to_rms(hi, t_seconds)
    power_kw, current_a, phase = compute_power_and_current(hi, t_seconds, load_kg)
    temp_c, humid_rh = compute_temp_humidity(t_seconds, power_kw)
    return pd.DataFrame({
        'trajectory_id': traj_id,
        'profile':       profile,
        'load_kg':       load_kg,
        't_seconds':     t_seconds,
        'rms_mms':       rms_mms,
        'power_kw':      power_kw,
        'current_a':     current_a,
        'temp_c':        temp_c,
        'humidity_rh':   humid_rh,
        'simulated_hi':  hi,
        'phase':         phase,
    })


if __name__ == '__main__':
    print(f"Génération de la trajectoire de test pour ASC-A1 Ben Arous (seed=2026)...")
    print(f"  Moteur : SITI FC100L1-4, 2.2 kW, 400V, cos(φ)=0.80, réducteur 1:60")
    print(f"  Profil : {PROFILE} (usure roulement réducteur)")

    # Consommer l'état aléatoire pour la trajectoire 100 (A_linear) pour garder l'alignement,
    # puis générer la trajectoire 101 (B_exponential) — identique à avant.
    _burn_t_fail = T_FAIL_BASE * np.random.uniform(0.8, 1.2)  # traj 100 t_fail
    _burn_t = np.arange(0, int(_burn_t_fail), 1, dtype=float)
    _burn_hi = compute_hi('A_linear', _burn_t, _burn_t_fail)
    _burn_rms = hi_to_rms(_burn_hi, _burn_t)
    _burn_pwr, _, _ = compute_power_and_current(_burn_hi, _burn_t, LOAD_NOMINAL_KG)
    _burn_tmp, _burn_hum = compute_temp_humidity(_burn_t, _burn_pwr)

    df = simulate_trajectory(TRAJ_ID, PROFILE)
    print(f"  → {len(df):,} rows, {df.t_seconds.iloc[-1]/3600:.1f} hours")
    print(f"  → HI: {df.simulated_hi.iloc[0]:.3f} → {df.simulated_hi.iloc[-1]:.3f}")

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            '..', 'data', 'raw', 'test_trajectories.csv')
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    df.to_csv(out_path, index=False)

    print(f"\n  Sauvegardé → {out_path}")
    print(f"  INÉDIT par les modèles entraînés (seed=2026 vs seed d'entraînement=42).")
