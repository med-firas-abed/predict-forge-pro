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

# ─────────────────────────────────────────────────────────────────────────────
# Isolation Forest — Liu, Ting & Zhou, "Isolation Forest", ICDM 2008
#   n_estimators=100 : valeur par défaut sklearn (bon compromis vitesse/précision,
#                       Pedregosa et al., JMLR 2011).
#   contamination=0.05 : proportion attendue d'anomalies dans les données saines
#                       de référence ; calibré empiriquement (cf. plot5_sensitivity).
# ─────────────────────────────────────────────────────────────────────────────
IF_N_ESTIMATORS      = 100
IF_CONTAMINATION     = 0.05
IF_RANDOM_STATE      = 42

# Ensemble hybride (IF + RMS) — pondération basée sur validation empirique
#   α=0.6  → IF reçoit 60% du poids, RMS-zscore 40%.
#   Justification : IF capte la dérive multivariée (12 features), RMS seule
#   capte l'amplitude vibratoire. L'ensemble pondéré dominé par IF améliore
#   la précision de détection précoce sans sacrifier le rappel.
HYBRID_ALPHA         = 0.6

# ─────────────────────────────────────────────────────────────────────────────
# Indice de santé (Health Index ∈ [0, 1]) — zones inspirées ISO 10816-3
# Zone A (healthy)    : HI ≥ 0.8   — « neuf / remis à neuf »
# Zone B (acceptable) : 0.6 ≤ HI < 0.8 — « service long terme admissible »
# Zone C (degraded)   : 0.3 ≤ HI < 0.6 — « maintenance planifiée requise »
# Zone D (critical)   : HI < 0.3   — « risque imminent, arrêt recommandé »
# ─────────────────────────────────────────────────────────────────────────────
HI_EXCELLENT         = 0.8
HI_GOOD              = 0.6
HI_CRITICAL          = 0.3
# Lissage temporel : moyenne glissante 120s à 1Hz.
# Justification : supprime le bruit capteur VT-V122 (±1.5%) tout en conservant
# la dynamique de dégradation (constante de temps thermique moteur ~5-10 min,
# IEC 60034-1 §8.5).
HI_SMOOTH_WINDOW_S   = 120

# ─────────────────────────────────────────────────────────────────────────────
# RUL — Remaining Useful Life
# Convention temporelle (dataset synthétique, analogue à NASA CMAPSS / FEMTO-ST) :
#   1 trajectoire simulée = 1 cycle de dégradation accéléré compressé.
#   TRAJECTORY_LEN_MIN = 800 min-sim (48 000 échantillons à 1 Hz).
#   Mapping conventionnel d'affichage : 800 min-sim ↔ 90 jours calendaires
#   d'exploitation réelle (ascenseur 8 h/jour × ~80 cycles/h → ~57 600 cycles,
#   ordre de grandeur L10 bearing ISO 281 pour SKF 6306 à charge nominale).
#   → facteur de conversion : 800 / 90 = 8.89, arrondi à 9 pour affichage UI.
# IMPORTANT : RUL_MIN_TO_DAY est une CONVENTION D'AFFICHAGE, pas une constante
# physique. Le modèle régresse en minutes-simulation ; la division par 9 sert
# uniquement à l'interprétation humaine (« 45 jours restants » plutôt que
# « 405 min »).
# ─────────────────────────────────────────────────────────────────────────────
RUL_LOOKBACK_MIN     = 60        # 60 pts = 1 h historique HI avant l'instant t
RUL_HOURS_PER_DAY    = 8         # cycle ascenseur résidentiel (hypothèse technicien)
RUL_MIN_TO_DAY       = 9         # conversion d'affichage (voir bloc ci-dessus)

# Persistance anti-bruit pour détection de franchissement du seuil critique
# (best-practice IEEE Std 1856-2017 §6.3 — « Prognostics for Systems »).
# Un point isolé sous HI_CRITICAL n'est pas considéré comme défaillance :
# on exige N échantillons consécutifs pour confirmer le franchissement.
RUL_CROSSING_PERSISTENCE = 3

# Jeu de données
# N_TRAJECTORIES = 200 : dimensionnement statistique
#   - 50 trajectoires par profil × 4 profils couvre toute la plage de charge
#     (20 cas 0-285 kg, répétés ~2.5×) et stabilise la variance CV
#   - Ordre de grandeur similaire à CMAPSS FD001 (100 unités) et FEMTO-ST PRONOSTIA
#     (17 roulements run-to-failure), Saxena & Goebel 2008
N_TRAJECTORIES       = 200
N_PROFILES           = 4
TRAJECTORY_LEN_MIN   = 800       # ~13.3 h à 1Hz (analogue CMAPSS : 200-362 cycles par unité)
TRAIN_RATIO          = 0.80      # 80/20 standard (sklearn default, Hastie et al. 2009)
SPLIT_SEED           = 42        # reproductibilité (graine déterministe)

# Validation croisée RUL (GroupKFold par trajectoire) — Kuhn & Johnson 2013
# Évite la fuite inter-groupes : une trajectoire est entièrement dans train ou test.
RUL_CV_FOLDS         = 5

# ─────────────────────────────────────────────────────────────────────────────
# Random Forest RUL (Prediteq, step5) — Breiman 2001
#   n_estimators=300 : convergence de l'OOB error atteinte sur ~4k échantillons
#                      d'entraînement (4 profils × 40 trajectoires × 800 min).
#   max_depth=12, min_samples_leaf=10 : régularisation contre overfitting
#                      (Hastie, Tibshirani & Friedman 2009, §15.3).
# Validation NASA CMAPSS FD001 (step6b) — dataset ~13k échantillons
#   n_estimators=500 : plus grand dataset justifie plus d'arbres pour saturer
#                      la capacité du modèle sans overfitting (Probst & Boulesteix
#                      2018, "Hyperparameters and Tuning Strategies for RF").
# ─────────────────────────────────────────────────────────────────────────────
RUL_N_ESTIMATORS     = 300
CMAPSS_N_ESTIMATORS  = 500

# Profil D — bruit capteur amplifié (au niveau SIGNAL, pas sur le HI cible)
# Le HI cible reste linéaire propre (identique au profil A) ; le capteur VT-V122
# voit un bruit ×3 par rapport au niveau nominal (±1.5% → ±4.5%), simulant
# un capteur en fin de vie ou un environnement EMI élevé.
PROFILE_D_NOISE_MULT = 3.0

def get_train_test_ids(traj_ids, traj_profile_map=None):
    """Séparation train/test déterministe — stratifiée par profil si possible.

    Si `traj_profile_map` est fourni (dict trajectory_id → profile), le split
    est stratifié : chaque profil est divisé indépendamment selon TRAIN_RATIO,
    garantissant ~20% de CHAQUE profil dans le test. Sans mapping, fallback
    shuffle uniforme (compatibilité descendante).

    Référence : Kuhn & Johnson 2013, Applied Predictive Modeling §4.2 —
    stratified sampling for heterogeneous populations.
    """
    import random
    rng = random.Random(SPLIT_SEED)
    if traj_profile_map is None:
        ids = sorted(traj_ids)
        rng.shuffle(ids)
        n_train = int(len(ids) * TRAIN_RATIO)
        return ids[:n_train], ids[n_train:]
    # Split stratifié par profil
    by_profile = {}
    for tid in sorted(traj_ids):
        by_profile.setdefault(traj_profile_map[tid], []).append(tid)
    train_ids, test_ids = [], []
    for profile, ids in sorted(by_profile.items()):
        rng.shuffle(ids)
        n_train = int(len(ids) * TRAIN_RATIO)
        train_ids.extend(ids[:n_train])
        test_ids.extend(ids[n_train:])
    return sorted(train_ids), sorted(test_ids)

# Résonance châssis (optionnelle)
F_CHASSIS_HZ         = 3.0
A_CHASSIS_MMS        = 0.2