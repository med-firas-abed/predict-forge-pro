"""
Étape 1 — Simulation de données
Génère 100 trajectoires de dégradation physiquement contraintes.
Chaque trajectoire a un cas de charge qui détermine l'appel de courant.
Sortie : data/raw/trajectories.csv

Chaîne de dégradation (d'après technicien) :
  charge ↑ → puissance ↑ → courant ↑ → échauffement bobines ↑ → dégradation ↑
  La variable de régression est le COURANT (tension 400V et vitesse 1410 RPM constantes).
"""

import numpy as np
import pandas as pd
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from config import *

np.random.seed(42)

PROFILE_NAMES = ['A_linear', 'B_exponential', 'C_stepwise', 'D_noisy_linear']
T_FAIL_BASE   = TRAJECTORY_LEN_MIN * 60  # secondes

# ─── HI par profil ─────────────────────────────────────────────────────────────────────

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

# ─── RMS à partir du HI ──────────────────────────────────────────────────────

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

    # Résonance châssis (optionnelle)
    rms += A_CHASSIS_MMS * np.sin(2 * np.pi * F_CHASSIS_HZ * t_seconds)

    # Bruit capteur multiplicatif (1.5%)
    rms *= (1 + np.random.normal(0, NOISE_VTV122, size=n))
    return np.clip(rms, 0.1, 10.0)

# ─── Puissance & Courant à partir du HI + Charge ───────────────────────────────────────
# Chaîne de dégradation : charge ↑ → P ↑ → I ↑ → échauffement I²R bobines → dégradation
# La tension (400V) et la vitesse (1410 RPM) sont CONSTANTES (plaque signalétique).
# Le courant est la SEULE variable électrique → pilote la régression.

def compute_power_and_current(hi, t_seconds, load_kg):
    n       = len(t_seconds)
    phase_t = t_seconds % T_CYCLE_S
    power   = np.zeros(n)
    current = np.zeros(n)
    phase   = np.full(n, 'pause', dtype=object)

    load_ratio = load_kg / LOAD_MAX_KG  # 0.0 (à vide) → 1.0 (pleine charge)

    for i in range(n):
        pt = phase_t[i]
        h  = hi[i]
        if pt < T_ASCENT_S:
            phase[i] = 'ascent'
            # Puissance = base (friction) + composante charge + composante dégradation
            # P = P_vide + P_plage_charge × (charge/max) + P_plage_deg × (1 - HI)
            p_load = P_ASCENT_EMPTY_KW + P_ASCENT_LOAD_RANGE * load_ratio
            p_deg  = P_ASCENT_DEG_RANGE * (1 - h)
            power[i] = np.clip(p_load + p_deg, P_ASCENT_EMPTY_KW, P_ASCENT_DEG_KW)
        elif pt < T_ASCENT_S + T_DESCENT_S:
            phase[i] = 'descent'
            power[i] = P_DESCENT_KW
        else:
            phase[i] = 'pause'
            power[i] = P_PAUSE_KW

    # Bruit capteur
    power += np.random.normal(0, NOISE_PAC2200 * P_ASCENT_NOM_KW, size=n)
    power = np.clip(power, 0.0, 3.0)

    # Courant : I = P / (√3 × V × cosφ)  — tension constante à 400V
    current = (power * 1000) / MOTOR_SQRT3_V_COSPHI  # kW → W, puis / dénominateur

    return power, current, phase

# ─── Température & Humidité ───────────────────────────────────────────────────

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

# ─── Simuler une trajectoire ──────────────────────────────────────────────────

def simulate_trajectory(traj_id, profile, load_kg):
    # Les charges plus lourdes accélèrent la dégradation (plus de courant → plus d'échauffement)
    # Le taux de dégradation varie avec I² par rapport au I² nominal
    i_ratio_sq  = (load_kg / LOAD_MAX_KG) ** 2 if LOAD_MAX_KG > 0 else 1.0
    # Pleine charge : taux = 1.0, à vide : taux ≈ 0.3 (usure de base)
    deg_rate    = 0.3 + 0.7 * i_ratio_sq

    # t_fail doit rester DANS la trajectoire pour que TOUTES atteignent HI < 0.3.
    # Les charges lourdes tombent en panne plus tôt (deg_rate ↑ → t_fail ↓).
    # Les charges légères tombent en panne plus tard mais avant la fin.
    t_fail_adj  = T_FAIL_BASE * np.random.uniform(0.75, 0.95) / max(deg_rate, 0.3)
    # Plafonner t_fail à 95% de la longueur pour garantir la défaillance
    t_max       = T_FAIL_BASE
    t_fail_adj  = min(t_fail_adj, t_max * 0.95)
    # La trajectoire continue 10% après la défaillance pour capturer la zone critique
    t_end       = int(min(t_fail_adj * 1.10, t_max))
    t_seconds   = np.arange(0, t_end, 1, dtype=float)

    hi                       = compute_hi(profile, t_seconds, t_fail_adj)
    rms_mms                  = hi_to_rms(hi, t_seconds)
    power_kw, current_a, phase = compute_power_and_current(hi, t_seconds, load_kg)
    temp_c, humid_rh         = compute_temp_humidity(t_seconds, power_kw)

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

# ─── Principal ──────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    all_dfs  = []
    traj_id  = 0
    n_each   = N_TRAJECTORIES // N_PROFILES  # 25 par profil

    # Répartir les cas de charge entre les trajectoires de chaque profil :
    # 25 trajectoires par profil × 4 profils = 100 au total
    # 20 cas de charge → 1 trajectoire par cas + 5 cas répétés
    load_list = LOAD_CASES_KG * (n_each // N_LOAD_CASES) + \
                LOAD_CASES_KG[:n_each % N_LOAD_CASES]
    load_list = sorted(load_list)  # ordre déterministe

    for profile in PROFILE_NAMES:
        loads_for_profile = load_list[:n_each]
        print(f"  Simulation {profile} ({n_each} trajectoires, "
              f"charges: {sorted(set(loads_for_profile))} kg)...")
        for i in range(n_each):
            load_kg = loads_for_profile[i]
            df = simulate_trajectory(traj_id, profile, load_kg)
            all_dfs.append(df)
            traj_id += 1

    trajectories = pd.concat(all_dfs, ignore_index=True)

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'raw', 'trajectories.csv')
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    trajectories.to_csv(out_path, index=False)

    print(f"\n✅ Étape 1 terminée — {traj_id} trajectoires, {len(trajectories):,} lignes")
    print(f"   Sauvegardé → {out_path}")
    print(f"\n   Répartition par profil :")
    print(trajectories.groupby('profile')['trajectory_id'].nunique())
    print(f"\n   Répartition par cas de charge :")
    print(trajectories.groupby('load_kg')['trajectory_id'].nunique())
    print(f"\n   Current range during ascent:")
    asc = trajectories[trajectories['phase'] == 'ascent']
    print(f"   Min: {asc['current_a'].min():.2f} A  |  "
          f"Mean: {asc['current_a'].mean():.2f} A  |  "
          f"Max: {asc['current_a'].max():.2f} A")