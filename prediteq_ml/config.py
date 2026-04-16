# Moteur — SITI FC100L1-4 (d'après photo plaque signalétique)
# Nr. 19080100484 | Prot. IP 55 | Serv. S1 | Cos.P 0.80 | Is.Cl. F
# IEC EN 60034 | Couplage : Δ/Y à 50 Hz
# ┌────────┬──────────┬────┬────┬──────┬──────┬──────────┐
# │ Config │    V     │ Hz │ HP │  kW  │ RPM  │    A     │
# ├────────┼──────────┼────┼────┼──────┼──────┼──────────┤
# │  Δ/Y   │ 230/400  │ 50 │  3 │ 2.2  │ 1410 │ 8.4/4.85 │
# │  Δ     │   276    │ 60 │3.6 │ 2.64 │ 1692 │   8.4    │
# │  Y     │   480    │ 60 │3.6 │ 2.64 │ 1692 │   4.85   │
# └────────┴──────────┴────┴────┴──────┴──────┴──────────┘
# Tunisie = 50 Hz, 400V entre phases → couplage étoile (Y) → I_nominal = 4.85 A
# Note : le technicien a dit « 380V » à l'oral — ancien nom pour 400V (harmonisation UE).
#        La plaque signalétique indique 400V. On utilise la valeur de la plaque.
MOTOR_SPEED_RPM      = 1410       # Constante — ne varie pas avec la charge
MOTOR_POWER_KW       = 2.2        # Puissance utile sur l'arbre (mécanique)
MOTOR_VOLTAGE_V      = 400        # Tension triphasée (couplage Y, d'après plaque)
MOTOR_COSPHI         = 0.80       # Facteur de puissance (d'après plaque)
REDUCER_RATIO        = 1/60

# Électrique — d'après plaque signalétique
# I = P / (√3 × V × cosφ)  — tension (400V) et vitesse (1410 RPM) sont CONSTANTES
# Le courant est la SEULE variable électrique → pilote la régression
MOTOR_SQRT3_V_COSPHI = (3**0.5) * 400 * 0.80  # = 554.26 — dénominateur pour I
MOTOR_I_RATED_A      = 4.85       # Directement de la plaque (Y à 400V, 50Hz)

# Géométrie machine
N_FLOORS             = 19
LOAD_PER_FLOOR_KG    = 15         # Max 15 kg par étage (d'après technicien)
LOAD_MAX_KG          = 19 * 15    # = 285 kg — 19 étages entièrement chargés
LOAD_NOMINAL_KG      = 10 * 15    # = 150 kg — demi-charge (fonctionnement typique)

# Cas de charge pour la simulation (kg) — d'après discussion technicien
# Tous les scénarios de chargement possibles pour ASC-A1 : 0/19 à 19/19 étages chargés
# Chaque étage supporte jusqu'à 15 kg → 20 cas au total
LOAD_CASES_KG = [
    0,          #  0/19 — à vide
    15,         #  1/19
    30,         #  2/19
    45,         #  3/19
    60,         #  4/19
    75,         #  5/19
    90,         #  6/19
    105,        #  7/19
    120,        #  8/19
    135,        #  9/19
    150,        # 10/19 — demi-charge (≈53%)
    165,        # 11/19
    180,        # 12/19
    195,        # 13/19
    210,        # 14/19
    225,        # 15/19
    240,        # 16/19
    255,        # 17/19
    270,        # 18/19
    285,        # 19/19 — pleine charge (100%)
]
N_LOAD_CASES = len(LOAD_CASES_KG)  # = 20

# Timing du cycle (secondes)
T_ASCENT_S           = 12
T_DESCENT_S          = 12
T_PAUSE_S            = 20
T_CYCLE_S            = 44

# Bruit capteurs
NOISE_VTV122         = 0.015   # 1.5% de la valeur
NOISE_PAC2200        = 0.005   # 0.5% de la valeur
NOISE_TEMP_C         = 0.1     # °C
NOISE_HUMID_RH       = 0.5     # %HR

# Climat — Ben Arous, mars 2026
TEMP_MIN_C           = 14.0
TEMP_MAX_C           = 28.0
HUMID_MIN_RH         = 55.0
HUMID_MAX_RH         = 80.0

# Puissance par phase (kW)
# P_montée dépend de la charge ET de l'état de santé :
#   P = P_VIDE + (P_PLEINE - P_VIDE) × (charge/CHARGE_MAX) + P_DEG × (1 - HI)
# Pleine charge sain :   0.30 + 1.21×1.0 + 0.0 = 1.51 kW  ✓
# Pleine charge dégradé : 0.30 + 1.21×1.0 + 0.65 = 2.16 kW  ✓
# À vide sain :          0.30 + 0.0 + 0.0       = 0.30 kW  ✓
# À vide dégradé :       0.30 + 0.0 + 0.65      = 0.95 kW  ✓
P_PAUSE_KW           = 0.0
P_DESCENT_KW         = 0.35
P_ASCENT_EMPTY_KW    = 0.30       # à vide — friction/inertie uniquement
P_ASCENT_NOM_KW      = 1.51       # pleine charge (285 kg), moteur sain
P_ASCENT_MAX_KW      = 1.91       # surcharge légère
P_ASCENT_DEG_KW      = 2.16       # pleine charge, moteur dégradé (courant max)
P_ASCENT_LOAD_RANGE  = P_ASCENT_NOM_KW - P_ASCENT_EMPTY_KW  # = 1.21 kW plage due à la charge
P_ASCENT_DEG_RANGE   = P_ASCENT_DEG_KW - P_ASCENT_NOM_KW    # = 0.65 kW plage due à la dégradation

# Isolation Forest
IF_N_ESTIMATORS      = 100
IF_CONTAMINATION     = 0.05
IF_RANDOM_STATE      = 42

# Ensemble hybride (IF + RMS)
HYBRID_ALPHA         = 0.6    # poids pour le score IF (1-alpha pour z-score RMS)

# Indice de santé (Health Index)
HI_EXCELLENT         = 0.8
HI_GOOD              = 0.6
HI_CRITICAL          = 0.3
HI_SMOOTH_WINDOW_S   = 120    # 2 min à 1Hz (plus court = moins de retard, meilleure corrélation)

# RUL (Durée de Vie Résiduelle)
RUL_LOOKBACK_MIN     = 60
RUL_HOURS_PER_DAY    = 8
# Conversion simulation → réel :
# 1 trajectoire = 90 jours calendaires d'exploitation réelle (8h/jour, ~80 cycles/h)
# 800 min-sim (48 000 s) représente 90 jours → 1 min-sim ≈ 0.1125 jours réels
# On utilise RUL_MIN_TO_DAY = 800/90 ≈ 8.89, arrondi à 9 pour un mapping propre.
RUL_MIN_TO_DAY       = 9         # min-sim par jour réel (800 min / 90 jours)

# Jeu de données
N_TRAJECTORIES       = 100
N_PROFILES           = 4
TRAJECTORY_LEN_MIN   = 800       # ~13.3h de données capteurs simulées par trajectoire
TRAIN_RATIO          = 0.80
SPLIT_SEED           = 42        # mélange déterministe pour la séparation train/test

def get_train_test_ids(traj_ids):
    """Séparation train/test mélangée déterministe — partagée par TOUTES les étapes.
    Garantit que les 4 profils apparaissent dans train et test."""
    import random
    ids = sorted(traj_ids)
    rng = random.Random(SPLIT_SEED)
    rng.shuffle(ids)
    n_train = int(len(ids) * TRAIN_RATIO)
    return ids[:n_train], ids[n_train:]

# Résonance châssis (optionnelle)
F_CHASSIS_HZ         = 3.0
A_CHASSIS_MMS        = 0.2