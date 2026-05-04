"""
diagnostics.rul_calibration — Couche de présentation RUL conforme PHM
═══════════════════════════════════════════════════════════════════════════════

Cette couche emballe la sortie brute du Random Forest (qui prédit en
minutes-simulation, plage 0-800) pour la transformer en information honnête,
défendable, et utilisable par un opérateur GMAO sur calendrier réel.

ELLE NE TOUCHE PAS AU MODÈLE. Le RF reste intact (R² mesuré sur le test set,
voir step5_rul_model.py et step6b_cmapss.py pour les chiffres). Seule la
traduction sim-min → jours calendaires change, ainsi que la décision
d'AFFICHER ou non un chiffre.

────────────────────────────────────────────────────────────────────────────
TROIS TRANSFORMATIONS APPLIQUÉES (et SEULEMENT ces trois)
────────────────────────────────────────────────────────────────────────────

1. **FPT gate** (`should_show_rul`)
   Référence : IEEE Std 1856-2017 § 6.2 « Prognostics for Systems »,
               Lei et al. 2018 « Machinery health prognostics: a systematic
               review », Mech. Syst. Signal Process. 104:799-834.
   Principe : un pronostic chiffré n'est calculé QUE lorsqu'un précurseur
   de défaillance est détecté. Avant ce point (FPT = First Predicting Time),
   on affiche la durée de vie statistique du composant (L10 — voir item 3).
   Notre seuil : HI ≥ 0.80 → pas de pronostic chiffré (zone Excellent
   ISO 10816-3 « neuf/remis à neuf »).

   Pourquoi 0.80 et pas une autre valeur ?
   La fonction `hi_to_rms` du simulateur (step1_simulate.py) projette
   HI ≥ 0.8 → RMS ∈ [0.8, 1.5] mm/s = exactement la zone A d'ISO 10816-3
   (machine neuve / remise à neuf). Le seuil HI=0.80 est donc l'image
   directe de la frontière A/B de la norme vibratoire.

2. **Conversion par rythme observé** (`observed_factor`, `convert_min_to_days`)
   Référence : Saxena & Goebel 2008 « Damage propagation modeling for aircraft
               engine run-to-failure simulation », NASA CMAPSS dataset.
   Principe : la calibration originale du pipeline pose la convention
       800 sim-min ↔ 90 jours calendaires (à 654 cycles/jour de référence)
   Cette hypothèse n'est valide QUE si la machine consomme effectivement
   654 cycles/jour. En pratique, l'usage varie (jours fériés, charge usine,
   nuit). On observe donc le rythme réel sur 7 j glissants et on ajuste :
       factor_observé = 9 × (cycles_observés_par_jour / 654)
       rul_jours      = rul_min / factor_observé
   Cohérent quel que soit l'usage (ferré ou en pause).

   Le facteur 9 (= 800/90) et le rythme 654 (= 8 h × 81.8 cycles/h, où
   81.8 = 3600/T_CYCLE_S) sont des CONVENTIONS d'affichage du dataset
   synthétique, PAS des constantes physiques certifiées. La convention
   est documentée dans `disclaimers.RUL_NATURE` et sera recalibrée
   empiriquement après 90 jours d'exploitation Aroteq.

3. **L10 ajusté à la charge réelle** (`l10_adjusted_years`)
   Référence : ISO 281:2007 « Roulements — Charges dynamiques de base et
               durée nominale », formule du cube (§ 7.1) :
                   L10_h = (C / P)^p × 10^6 / (60·n)
                   avec p = 3 pour roulements à billes
                        n = vitesse de rotation (RPM)
                        C = charge dynamique de base (N) [catalogue]
                        P = charge dynamique équivalente (N) [calculée]
   Principe : la durée de vie du roulement de sortie réducteur est
   ajustée à la charge moyenne mesurée sur 30 j de fonctionnement réel
   par la cube law :
       L10_observé = L10_nominal × (P_nominal / P_observée)^3
   Charge plus lourde → vie plus courte (cube law).
   Charge plus légère → vie plus longue.

   La dérivation de L10_nominal pour notre installation est détaillée
   dans le bloc commenté ci-dessous (constantes SKF 6306 + équations).
   On a explicitement vérifié la SENSIBILITÉ : ±20% sur P → ×1.95 / ÷1.95
   sur L10. Donc l'incertitude sur P est dominante ; toute affirmation
   sur L10 doit être présentée comme un ORDRE DE GRANDEUR statistique,
   pas une garantie.

────────────────────────────────────────────────────────────────────────────
CE QUE CETTE COUCHE NE FAIT PAS (intentionnellement)
────────────────────────────────────────────────────────────────────────────

- Pas de multiplicateurs zone-conditionnels (×N en zone Good/Degraded).
  Précédemment expérimenté sous le nom « Industry Time Calibration », ces
  multiplicateurs introduisaient une extrapolation hors-distribution
  d'entraînement ne pouvant être ancrée scientifiquement (NEMA MG-1, ISO
  13374-1 et SAE JA1011 ne prescrivent PAS de tels facteurs). Retirés
  pour respecter le principe IEEE 1856-2017 §6.2 « ne prédire que ce
  que le modèle a vu ».

- Pas d'extrapolation au-delà de la plage d'entraînement. Si le RF sort
  un chiffre dans une zone HI faiblement représentée (ex. HI<0.3), c'est
  affiché TEL QUEL et l'incertitude (CVI) le reflète. Le badge de
  confiance (rul_confidence.confidence_badge) signale automatiquement
  quand l'IC devient large.

UTILISATION
───────────
Module pur. Aucune dépendance Supabase, FastAPI, NumPy, pandas. Importable
et testable isolément. Toutes les fonctions sont déterministes et tolérantes
aux entrées manquantes (None) avec fallback documenté.

Tests inline en bas du fichier (lancer
   python -m prediteq_ml.diagnostics.rul_calibration
pour les exécuter).

Auteur : Firas Zouari — ISAMM PFE 2026
"""
from __future__ import annotations
from typing import Optional, TypedDict, Literal


# ─── Constantes d'ancrage (alignées sur prediteq_ml/config.py) ───────────────

ANCHOR_CYCLES_PER_DAY: float = 654.0
"""Rythme de référence de la calibration originale (cycles/jour).

Dérivation :
    RUL_HOURS_PER_DAY × cycles_par_heure
    = 8 h × (3600 s/h ÷ T_CYCLE_S=44 s) = 8 × 81.82 = 654.5 cycles/jour
Source : config.py — cycle ascensionnel mesuré chez Aroteq (technicien).
Convention d'affichage, pas de mesure terrain Aroteq encore disponible."""

DEFAULT_FACTOR: float = 9.0
"""Facteur de conversion sim-min → jours par défaut.

Dérivation :
    TRAJECTORY_LEN_MIN ÷ jours_de_référence = 800 / 90 ≈ 8.89 → arrondi 9
Le 90 jours est une CONVENTION D'AFFICHAGE héritée de la calibration
initiale du dataset synthétique (analogue à NASA CMAPSS, où 1 cycle =
1 « engine flight »). Pas une dérivation physique. Sera recalibré après
90 jours d'exploitation réelle (cf. `disclaimers.RUL_NATURE`).

Utilisé en mode fallback quand le rythme observé est indisponible
(machine fraîchement connectée, < 7 jours de données)."""

CYCLES_PER_SIM_MIN: float = 73.6
"""Conversion sim-min → cycles physiques.

Dérivation (cohérente avec la convention 90 jours) :
    ANCHOR_CYCLES_PER_DAY × 90 ÷ TRAJECTORY_LEN_MIN
    = 654 × 90 ÷ 800 = 73.575 → arrondi 73.6

Permet d'afficher l'unité PHM standard (cycles d'opération) à côté
des jours calendaires. Le chiffre en cycles est PLUS HONNÊTE que les
jours car il ne dépend pas de l'hypothèse 8h/jour."""


# ─── Paramètres ISO 281 du roulement critique (sortie réducteur) ─────────────
#
# Cible : roulement à billes en sortie de réducteur (côté arbre lent), qui
# subit la charge axiale du câble + la composante radiale du système de
# poulie. C'est le roulement le plus chargé du couple moteur+réducteur.
#
# Roulement modèle : SKF 6306 (rigide à billes, ø interne 30 mm)
#   - Source : SKF General Catalogue 17000/EN, 2020 (édition publique)
#   - C  = 22 500 N (charge dynamique de base)
#   - C0 = 14 600 N (charge statique de base, non utilisée ici)
#   - Vitesse limite avec graisse : 14 000 RPM (largement au-dessus
#     de notre application à 23.5 RPM)
#
# Vitesse n du roulement de sortie :
#   - Moteur SITI FC100L1-4 : 1410 RPM (plaque signalétique)
#   - Réducteur : 1/60 (config.py : REDUCER_RATIO = 1/60)
#   - n_arbre_sortie = 1410 / 60 = 23.5 RPM
#
# Charge équivalente P (estimation) :
#   Le roulement supporte la tension du câble de levage. À pleine charge :
#     - Cabine résidentielle ascensionnelle ~600 kg (estimation conservatrice)
#     - Charge utile nominale : 150 kg (= LOAD_NOMINAL_KG / pleine charge 285 kg)
#     - Contrepoids : 750 kg (typiquement = cabine + 50% charge utile)
#     - Tension nette du câble en montée à pleine charge :
#         F = (m_cabine + m_charge - m_contrepoids) × g
#           = (600 + 150 - 750) × 9.81 = 0 N (équilibré au demi-charge)
#     - La charge bearing résulte donc surtout de FROTTEMENT et VIBRATIONS
#       dynamiques pendant l'accélération/décélération. On retient une
#       estimation conservatrice P ≈ 7 kN sur la base de :
#         couple moteur nom = P_méca / ω = 1510 W / (1410·2π/60) = 10.2 N·m
#         couple sortie = 10.2 × 60 = 612 N·m
#         tension câble équivalente sur poulie ø500 mm : 612/0.25 = 2 450 N
#         + facteur multiplicatif dynamique k_d ≈ 2.8 (chocs cyclic/dém.) →
#         P ≈ 7 000 N
#
# Calcul L10 :
#     L10_h = (C/P)³ × 10^6 / (60·n)
#           = (22500/7000)³ × 10^6 / (60·23.5)
#           = 33.18 × 10^6 / 1410
#           = 23 533 heures
#
#     Conversion en années à 8 h/jour, 365 jours/an :
#       L10_ans = 23 533 / (8 × 365) = 8.06 ans  → ARRONDI à 8 ans
#
# SENSIBILITÉ — c'est CRUCIAL à présenter au jury :
#   La cube law (puissance 3) amplifie l'incertitude sur P.
#       P = 5.6 kN (-20%) → L10 ≈ 15.7 ans
#       P = 7.0 kN        → L10 ≈ 8.1 ans
#       P = 8.4 kN (+20%) → L10 ≈ 4.7 ans
#   Donc : "8 ans" n'est PAS une certitude — c'est l'ordre de grandeur
#   central d'une plage 5-15 ans, dominée par l'incertitude sur P.
#
# C'est pourquoi nous CALCULONS le L10 ajusté en utilisant la PUISSANCE
# moyenne réellement mesurée (proxy de P) — l'opérateur récupère ainsi
# une estimation calibrée sur SON installation, pas une valeur générique.

L10_NOMINAL_YEARS: float = 8.0
"""Durée de vie L10 nominale du roulement SKF 6306, ordre de grandeur.

Calcul ISO 281:2007 §7.1 (p=3, ball bearing) :
    L10_h = (C/P)³ × 10^6 / (60·n)
    avec C=22500 N (catalogue SKF), P=7000 N (estimation conservatrice
    à pleine charge dynamique), n=23.5 RPM (1410÷60 réducteur).
    → L10_h ≈ 23 500 h ≈ 8 ans à 8h/jour

À traiter comme un ORDRE DE GRANDEUR (plage 5-15 ans, sensibilité ±20%
sur P → facteur 1.95). Le L10 ajusté à la charge mesurée
(`l10_adjusted_years`) corrige cette estimation pour l'installation."""

P_NOMINAL_KW: float = 1.51
"""Puissance ascensionnelle nominale du moteur SITI FC100L1-4 à pleine
charge saine (= P_ASCENT_NOM_KW de config.py, 285 kg, HI=1.0).
Sert de référence pour la cube law sur la puissance MOYENNE mesurée
sur 30 j (proxy linéaire de la charge bearing équivalente)."""

FPT_HI_THRESHOLD: float = 0.80
"""Seuil HI au-dessus duquel on ne publie PAS de pronostic chiffré.

Aligné sur la frontière A/B d'ISO 10816-3 zone A (« neuf / remis à
neuf », v_RMS < 1.5 mm/s). La fonction `hi_to_rms` du simulateur
(step1) mappe HI ≥ 0.8 → RMS [0.8, 1.5] mm/s ⇔ exactement zone A.
Le seuil HI=0.80 est donc l'image directe de la frontière vibratoire.

Référence: IEEE Std 1856-2017 § 6.2 (FPT-conditional prognosis)."""

MIN_CYCLES_FOR_OBSERVED_RATE: float = 100.0
"""Rythme minimum observé en-dessous duquel on considère la machine en mode
warm-up (données insuffisantes pour une moyenne 7 j fiable). Sous ce seuil,
on retombe sur DEFAULT_FACTOR = 9.

Justification : 100 cycles/jour ≈ 1.2 h d'opération, en-dessous duquel
le calcul d'une moyenne 7 j perd son sens statistique."""


# ─── Zone helper ─────────────────────────────────────────────────────────────

def hi_to_zone(hi: Optional[float]) -> str:
    """Mappe HI ∈ [0,1] vers nom de zone ISO 10816-3.

    Excellent ≥ 0.80   (zone A — neuf / remis à neuf)
    Good      ≥ 0.60   (zone B — service long terme admissible)
    Degraded  ≥ 0.30   (zone C — maintenance planifiée requise)
    Critical  < 0.30   (zone D — risque imminent, arrêt recommandé)
    Unknown   None     (HI indisponible)

    Note : ces frontières sont l'image directe des seuils vibratoires
    ISO 10816-3 (1.5 / 2.0 / 4.5 mm/s) via la projection `hi_to_rms`
    de step1_simulate.py.
    """
    if hi is None:
        return "Unknown"
    if hi >= 0.80:
        return "Excellent"
    if hi >= 0.60:
        return "Good"
    if hi >= 0.30:
        return "Degraded"
    return "Critical"


# ─── Recommandations maintenance (heuristique métier RCM) ────────────────────

MAINTENANCE_WINDOW: dict[str, str] = {
    # Recommandations qualitatives en langage GMAO. Indépendantes de la
    # sortie du modèle ML : ces strings se basent UNIQUEMENT sur la zone HI.
    #
    # ⚠ Ces fenêtres sont des HEURISTIQUES MÉTIER inspirées des principes
    # RCM (SAE JA1011) et de la pratique industrielle CBM (ISO 13374),
    # PAS des prescriptions normatives chiffrées. Aucune des normes citées
    # ne fixe ces intervalles spécifiques en jours/semaines.
    #
    # Logique :
    #   - Excellent : HI≥0.8, machine saine → suivi routine
    #   - Good      : HI 0.6-0.8, dérive sub-clinique → observation rapprochée
    #   - Degraded  : HI 0.3-0.6, dégradation active → planifier intervention
    #   - Critical  : HI<0.3, défaillance imminente → arrêt préventif

    "Excellent": "Surveillance de routine — prochain contrôle planifié",
    "Good":      "Inspection visuelle sous 30-90 jours • "
                 "Planifier une révision sous 6-12 mois",
    "Degraded":  "Maintenance préventive sous 2-4 semaines • "
                 "Inspecter les roulements et l'alignement",
    "Critical":  "ARRÊT IMMÉDIAT recommandé — "
                 "risque de grippage dans les prochains jours",
    "Unknown":   "Synchronisation des données en cours",
}


# ─── Types de retour ─────────────────────────────────────────────────────────

ConversionSource = Literal["observed", "calibration_default"]
L10Source = Literal["measured", "fallback"]


class ConversionResult(TypedDict):
    rul_days: float
    cycles_remaining: float
    factor_used: float
    cycles_per_day_observed: Optional[float]
    source: ConversionSource


class L10Result(TypedDict):
    years: float
    p_observed_kw: Optional[float]
    p_nominal_kw: float
    source: L10Source


# ─── Fonctions ──────────────────────────────────────────────────────────────

def should_show_rul(hi: Optional[float],
                    threshold: float = FPT_HI_THRESHOLD) -> bool:
    """First Predicting Time — décide si un pronostic chiffré doit être affiché.

    Args:
        hi: Health Index courant ∈ [0, 1], ou None si indisponible.
        threshold: seuil HI au-dessus duquel on supprime l'affichage RUL
                   (par défaut 0.80, conforme ISO 10816-3 zone A).

    Returns:
        True  → afficher RUL chiffré (machine en cours de dégradation).
        False → cacher RUL, afficher la référence L10 statistique à la place
                (machine saine, pas de précurseur détecté).

    Référence : IEEE Std 1856-2017 § 6.2.
    """
    if hi is None:
        return False
    return hi < threshold


def observed_factor(cycles_per_day: Optional[float],
                    anchor: float = ANCHOR_CYCLES_PER_DAY,
                    default: float = DEFAULT_FACTOR,
                    min_cycles: float = MIN_CYCLES_FOR_OBSERVED_RATE
                    ) -> tuple[float, ConversionSource]:
    """Calcule le facteur sim-min → jour calendaire à partir du rythme observé.

    Formule :
        factor = default × (cycles_per_day / anchor)

    La constante `default` (9) correspond à la calibration originale supposant
    `anchor` (654) cycles/jour. Si la machine fait plus de cycles/jour, elle
    consomme sa vie plus vite → facteur plus grand → moins de jours pour le
    même rul_min. Inversement.

    Args:
        cycles_per_day: rythme observé (moyenne 7 j glissants), ou None.
        anchor: rythme calibration originale (654 cycles/jour).
        default: facteur de fallback si données insuffisantes (9).
        min_cycles: seuil sous lequel on considère le rythme insuffisant.

    Returns:
        (factor, source) où source ∈ {"observed", "calibration_default"}.

    Edge cases :
        - cycles_per_day=None         → (9.0, "calibration_default")
        - cycles_per_day < 100        → (9.0, "calibration_default")
        - cycles_per_day = 654        → (9.0, "observed")
        - cycles_per_day = 1308       → (18.0, "observed")
    """
    if cycles_per_day is None or cycles_per_day < min_cycles:
        return (default, "calibration_default")
    if anchor <= 0:
        return (default, "calibration_default")
    return (default * (cycles_per_day / anchor), "observed")


def convert_min_to_days(rul_min: float,
                        cycles_per_day: Optional[float]
                        ) -> ConversionResult:
    """Convertit un RUL en minutes-simulation vers jours calendaires + cycles.

    Pipeline :
        1. Sanitisation (NaN, négatifs → 0)
        2. Conversion sim-min → jours via rythme observé OU défaut
        3. Mêmes opérations sur les cycles pour cohérence d'unité

    AUCUN multiplicateur zone-conditionnel. La sortie reflète exactement
    ce que le RF a prédit, traduit dans l'unité utilisateur (jours, cycles).

    Args:
        rul_min: sortie brute du RF (sim-min, plage typique 0-800).
        cycles_per_day: rythme observé sur 7 j glissants, ou None.

    Returns:
        ConversionResult avec :
          rul_days                  — jours calendaires
          cycles_remaining          — cycles d'usage avant maintenance
          factor_used               — facteur observé (transparence)
          cycles_per_day_observed   — rythme observé (pour disclaimer UI)
          source                    — "observed" ou "calibration_default"

    Garanties :
        - rul_days ≥ 0 (clip)
        - cycles_remaining ≥ 0 (clip)
        - rul_min négatif ou NaN → 0 (sécurité)
    """
    # Sanitisation : rul_min peut être négatif ou NaN si le RF extrapole
    # hors distribution (zone Critique HI < 0.3).
    safe_min = max(0.0, float(rul_min)) if rul_min == rul_min else 0.0  # NaN check

    # Conversion observée (rythme machine vs ÷9 figé)
    factor, source = observed_factor(cycles_per_day)
    rul_days = safe_min / factor if factor > 0 else 0.0
    cycles_remaining = safe_min * CYCLES_PER_SIM_MIN

    return ConversionResult(
        rul_days=round(rul_days, 1),
        cycles_remaining=round(cycles_remaining, 0),
        factor_used=round(factor, 2),
        cycles_per_day_observed=(round(cycles_per_day, 0)
                                  if cycles_per_day is not None else None),
        source=source,
    )


def l10_adjusted_years(power_avg_30j_kw: Optional[float],
                       p_nominal: float = P_NOMINAL_KW,
                       l10_nominal_years: float = L10_NOMINAL_YEARS,
                       cube_exponent: float = 3.0
                       ) -> L10Result:
    """L10 ajusté à la charge moyenne observée (ISO 281:2007 § 7.1, cube law).

    Formule :
        L10_observé = L10_nominal × (P_nominal / P_observé)^3

    Justification : la durée de vie d'un roulement à billes est inversement
    proportionnelle à la puissance trois de la charge dynamique appliquée
    (loi établie par Lundberg & Palmgren 1947, formalisée ISO 281:2007).
    Pour notre installation (SKF 6306, n=23.5 RPM), la dérivation complète
    de L10_nominal=8 ans est dans le bloc commenté en haut du module.

    Cas particuliers :
      - Charge plus légère que la nominale (P_obs < P_nom) → vie ALLONGÉE
      - Charge plus lourde que la nominale (P_obs > P_nom) → vie RACCOURCIE
      - Pas de données 30 j → fallback sur L10 nominal, source="fallback"

    Args:
        power_avg_30j_kw: puissance ascensionnelle moyenne 30 j (kW) ou None.
        p_nominal: puissance nominale (kW), 1.51 pour SITI FC100L1-4.
        l10_nominal_years: L10 dérivé constructeur (ans), 8 pour SKF 6306.
        cube_exponent: 3 pour roulements à billes, 10/3 pour rouleaux
                       (ISO 281 § 7.2).

    Returns:
        L10Result avec years, p_observed_kw, p_nominal_kw, source.

    Bornes de sécurité :
        Le résultat est borné à [0.5, 50] ans pour éviter les valeurs
        aberrantes si P_observé sort des plages plausibles
        (sensor glitch, etc.).

    Sensibilité (cube law amplifie ±20% sur P → ×1.95 sur L10) — c'est
    une LIMITE FONDAMENTALE de la formule, pas une faiblesse du code.
    """
    if power_avg_30j_kw is None or power_avg_30j_kw <= 0:
        return L10Result(
            years=l10_nominal_years,
            p_observed_kw=None,
            p_nominal_kw=p_nominal,
            source="fallback",
        )

    ratio = p_nominal / power_avg_30j_kw
    years = l10_nominal_years * (ratio ** cube_exponent)
    # Bornes physiques : éviter les valeurs aberrantes si capteur défaillant
    years = max(0.5, min(50.0, years))

    return L10Result(
        years=round(years, 1),
        p_observed_kw=round(power_avg_30j_kw, 2),
        p_nominal_kw=p_nominal,
        source="measured",
    )


# ─── Tests inline (run with: python -m prediteq_ml.diagnostics.rul_calibration) ──

def _self_test() -> None:
    """Vérifications de cohérence sur les 3 scénarios machines de démo +
    cas limites. Lève AssertionError si une logique est cassée."""

    # 1. FPT gate
    assert should_show_rul(0.92) is False, "ASC-A1 healthy → hide RUL"
    assert should_show_rul(0.68) is True,  "ASC-B2 onset → show RUL"
    assert should_show_rul(0.22) is True,  "ASC-C3 critical → show RUL"
    assert should_show_rul(None) is False, "Unknown HI → safe default hide"
    assert should_show_rul(0.80) is False, "Boundary 0.80 → hide (≥ threshold)"
    assert should_show_rul(0.7999) is True, "Just below 0.80 → show"

    # 2. Observed factor
    f, src = observed_factor(654)
    assert abs(f - 9.0) < 1e-6 and src == "observed", "Anchor → factor 9"
    f, src = observed_factor(1308)  # double rate
    assert abs(f - 18.0) < 1e-6 and src == "observed", "Double rate → factor 18"
    f, src = observed_factor(None)
    assert f == 9.0 and src == "calibration_default", "None → fallback 9"
    f, src = observed_factor(50)  # below min_cycles
    assert f == 9.0 and src == "calibration_default", "Low rate → fallback"

    # 3. hi_to_zone helper
    assert hi_to_zone(0.92) == "Excellent"
    assert hi_to_zone(0.80) == "Excellent"
    assert hi_to_zone(0.79) == "Good"
    assert hi_to_zone(0.68) == "Good"
    assert hi_to_zone(0.60) == "Good"
    assert hi_to_zone(0.59) == "Degraded"
    assert hi_to_zone(0.30) == "Degraded"
    assert hi_to_zone(0.29) == "Critical"
    assert hi_to_zone(0.0) == "Critical"
    assert hi_to_zone(None) == "Unknown"

    # 4. Convert min to days — scenarios for the 3 demo machines
    # ASC-B2: HI=0.68 (Good zone), RF predicts 480 sim-min, 1100 cycles/day
    # factor = 9 × (1100/654) = 15.14
    # rul_days = 480 / 15.14 = 31.7
    res = convert_min_to_days(480.0, 1100.0)
    assert abs(res["rul_days"] - 31.7) < 0.5, \
        f"ASC-B2 days: {res['rul_days']} ≠ 31.7"
    assert res["source"] == "observed"
    assert abs(res["factor_used"] - 15.14) < 0.05
    # cycles : 480 × 73.6 = 35 328
    assert res["cycles_remaining"] == round(480 * 73.6)

    # ASC-C3: HI=0.22 (Critical zone), 45 sim-min, 400 cycles/day
    # factor = 9 × (400/654) = 5.50, rul_days = 45/5.50 = 8.2
    res = convert_min_to_days(45.0, 400.0)
    assert abs(res["rul_days"] - 8.2) < 0.5, \
        f"ASC-C3: {res['rul_days']} ≠ 8.2"
    assert res["source"] == "observed"

    # Hypothèse Degraded zone : HI=0.45, RF prédit 250 sim-min, 800 cyc/j
    # factor = 9 × (800/654) = 11.0, rul_days = 250/11 = 22.7
    res = convert_min_to_days(250.0, 800.0)
    assert abs(res["rul_days"] - 22.7) < 0.5, \
        f"Degraded: {res['rul_days']} ≠ 22.7"

    # Edge cases
    res = convert_min_to_days(540.0, None)  # warm-up fallback
    assert res["source"] == "calibration_default"
    assert res["rul_days"] == 60.0  # 540/9
    res = convert_min_to_days(-5.0, 1000.0)  # negative safety
    assert res["rul_days"] == 0.0
    res = convert_min_to_days(float('nan'), 1000.0)  # NaN
    assert res["rul_days"] == 0.0

    # Maintenance window pour chaque zone
    assert "Surveillance de routine" in MAINTENANCE_WINDOW["Excellent"]
    assert "30-90 jours" in MAINTENANCE_WINDOW["Good"]
    assert "2-4 semaines" in MAINTENANCE_WINDOW["Degraded"]
    assert "ARRÊT IMMÉDIAT" in MAINTENANCE_WINDOW["Critical"]
    assert "Synchronisation" in MAINTENANCE_WINDOW["Unknown"]

    # 5. L10 adjusted (cube law ISO 281)
    res = l10_adjusted_years(1.51)  # exactly nominal
    assert abs(res["years"] - 8.0) < 0.1, "P=P_nom → L10=8 years"
    assert res["source"] == "measured"

    res = l10_adjusted_years(1.65)  # +9% load
    expected = 8.0 * (1.51 / 1.65) ** 3  # ≈ 6.13 years
    assert abs(res["years"] - 6.1) < 0.3, f"P>P_nom: {res['years']}"

    res = l10_adjusted_years(1.20)  # -21% load
    expected = 8.0 * (1.51 / 1.20) ** 3  # ≈ 15.95 years (cube)
    assert abs(res["years"] - 15.9) < 0.5, f"P<P_nom: {res['years']}"

    # Sensibilité explicite : ±20% sur P → vérifier facteur ~1.95
    res_low = l10_adjusted_years(1.51 * 0.8)  # -20%
    res_high = l10_adjusted_years(1.51 * 1.2)  # +20%
    assert abs(res_low["years"] / 8.0 - 1.95) < 0.05, \
        f"Sensibilité -20% : ratio {res_low['years']/8.0:.2f} ≠ 1.95"
    assert abs(8.0 / res_high["years"] - 1.73) < 0.05, \
        f"Sensibilité +20% : ratio {8.0/res_high['years']:.2f} ≠ 1.73"

    res = l10_adjusted_years(None)
    assert res["source"] == "fallback" and res["years"] == 8.0

    res = l10_adjusted_years(0.0)  # division by zero protection
    assert res["source"] == "fallback"

    res = l10_adjusted_years(0.01)  # extreme low load → bounded to 50 years
    assert res["years"] == 50.0

    print("✅ All rul_calibration self-tests passed")


if __name__ == "__main__":
    _self_test()
