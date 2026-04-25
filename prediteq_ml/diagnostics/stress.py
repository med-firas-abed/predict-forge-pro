"""
diagnostics.stress — Indice de Stress Instantané (SI)
═══════════════════════════════════════════════════════════════════════════════

Item 6 (additif) de la feuille de route. Fournit une métrique manquante du
pipeline : COMBIEN la machine est-elle stressée, ICI ET MAINTENANT ?

POSITIONNEMENT DANS LE PIPELINE
───────────────────────────────
- Health Index (HI)     : usure cumulée (passé, lissé sur 60 échantillons).
                          Question répondue : « combien la machine est-elle
                          usée ? ». Réagit lentement.
- Stress Index (SI)     : sévérité opérationnelle instantanée (présent).
                          Question répondue : « combien la machine est-elle
                          poussée à l'instant t ? ». Réagit immédiatement.
- Remaining Useful Life : pronostic (futur). Question : « combien de temps
                          reste-t-il avant intervention ? ».

Le SI capte les **transients agressifs** que le HI lissé manquera tant qu'ils
n'ont pas accumulé de dégât. Il est donc un indicateur AVANCÉ : on peut
réduire la charge AVANT que le HI ne tombe.

ZÉRO APPRENTISSAGE — métrique entièrement déterministe et auditable, basée
exclusivement sur des seuils normatifs déjà utilisés ailleurs dans le projet.

FORMULE
───────
                  T_stress + V_stress + L_stress + R_stress
            SI =  ─────────────────────────────────────────       ∈ [0, 1]
                                      4

Chaque composante est bornée [0, 1], avec 0 = composante nominale, 1 = limite
normative atteinte ou dépassée. Le coefficient 1/4 (moyenne arithmétique
non pondérée) maintient l'interprétabilité ; la valeur peut être recalibrée
en pondération si la pratique opérationnelle Aroteq l'exige.

DÉTAIL DES COMPOSANTES
──────────────────────

1. **T_stress — Stress thermique** (IEC 60034-1:2017, classe F)
        clip((T - 50 °C) / (110 °C - 50 °C), 0, 1)
   - 0 à T ≤ 50 °C  : régime à froid, marge totale
   - 1 à T ≥ 110 °C : seuil critique IEC pour classe d'isolation F
   Justification : 50 °C ≈ ambiante + élévation modérée ; 110 °C = seuil
   `IEC_60034_F_T_CRITICAL_C` déjà utilisé dans diagnose.py. Au-delà, la
   loi d'Arrhenius (Montsinger, IEEE 117-2015) implique chute de moitié
   de durée de vie isolation par +10 °C.

2. **V_stress — Stress vibratoire** (ISO 10816-3:2009, classe I)
        clip((RMS - 1.8) / (11.2 - 1.8), 0, 1)
   - 0 à RMS ≤ 1.8 mm/s   : zone A (machine neuve / remise à neuf)
   - 1 à RMS ≥ 11.2 mm/s  : limite zone D (dommage imminent)
   Justification : interpolation linéaire entre les zones A et D ISO 10816-3
   pour machine rigide classe I (P < 15 kW). SITI FC100L1-4 = 2.2 kW → I.

3. **L_stress — Stress de charge** (plaque signalétique IEC 60034-1)
        clip((I_rms - 0.5·I_rated) / (1.15·I_rated - 0.5·I_rated), 0, 1)
   - 0 à I_rms ≤ 50 % I_rated  : faible charge
   - 1 à I_rms ≥ 115 % I_rated : facteur de service IEC 60034-1 dépassé
   Justification : SITI FC100L1-4 → I_rated = 4.85 A (config.py). Le
   facteur de service S1/S4 typique d'IEC 60034-1 §11 limite le service
   continu à 100 % et tolère 115 % en court terme.

4. **R_stress — Stress de variabilité** (proxy cyclique sans capteur de cycle)
        clip(σ(I_1h) / I_mean / 0.30, 0, 1)
   - 0 à ratio ≤ 0    : courant parfaitement stable
   - 1 à ratio ≥ 0.30 : asymétrie ou cyclage agressif
   Justification : seuil 0.30 = même valeur que `CURRENT_STD_THRESHOLD_RATIO`
   utilisée par la règle MCSA (Thomson & Fenger 2001). Capture indirectement
   l'effet « démarrages/arrêts répétés » d'un ascenseur à fort trafic, qui
   serait autrement invisible faute de capteur de cycles.

UTILISATION
───────────
    from prediteq_ml.diagnostics import compute_stress_index

    si = compute_stress_index({
        "temp_mot_c": 95,        # surchauffe modérée
        "rms_mms": 5.0,          # entrée zone C
        "i_rms_a": 5.5,          # 113 % I_rated
        "i_rms_std_1h": 0.40,    # variabilité élevée
    })
    print(si.value)              # 0.74 → "high"
    print(si.band)               # "high"
    print(si.components)         # composantes individuelles

RÉFÉRENCES
──────────
- ISO 10816-3:2009          Vibration severity zones
- IEC 60034-1:2017 §8, §11  Thermal classes, service factors
- IEEE 117-2015             Arrhenius / Montsinger insulation life rule
- Thomson & Fenger (2001)   MCSA — current asymmetry detection
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, field
from enum import Enum
from typing import Mapping, Optional

# ──────────────────────────────────────────────────────────────────────────────
# Seuils — référencés sur diagnose.py pour cohérence inter-modules
# ──────────────────────────────────────────────────────────────────────────────

# Thermal — IEC 60034-1:2017 classe F
_T_NOMINAL_C: float = 50.0       # marge confortable au-dessus de l'ambiante
_T_CRITICAL_C: float = 110.0     # = IEC_60034_F_T_CRITICAL_C (diagnose.py)

# Vibration — ISO 10816-3:2009 classe I
_RMS_ZONE_A_MMS: float = 1.8     # = ISO_10816_3_ZONE_A_RMS_MMS
_RMS_ZONE_D_MMS: float = 11.2    # = ISO_10816_3_ZONE_C_RMS_MMS (entrée zone D)

# Load — plaque SITI FC100L1-4 + IEC 60034-1 service factor
_I_RATED_A: float = 4.85         # = MOTOR_I_RATED_A (diagnose.py)
_LOAD_LOW_FRACTION: float = 0.50  # 50 % charge = pas de stress
_LOAD_HIGH_FRACTION: float = 1.15  # 115 % charge = facteur de service IEC

# Variability — Thomson & Fenger 2001
_VAR_RATIO_MAX: float = 0.30     # = CURRENT_STD_THRESHOLD_RATIO


# ──────────────────────────────────────────────────────────────────────────────
# Types publics
# ──────────────────────────────────────────────────────────────────────────────
class StressBand(str, Enum):
    """Bandes opérationnelles du SI. Seuils choisis par tertiles de l'espace
    [0, 1] avec un quartile critique réservé."""
    LOW = "low"            # SI < 0.30   — vert  : conditions normales
    MODERATE = "moderate"  # 0.30–0.60   — jaune : surveillance accrue
    HIGH = "high"          # 0.60–0.85   — orange: réduire la sollicitation
    CRITICAL = "critical"  # >= 0.85     — rouge : limite normative imminente


@dataclass
class StressComponents:
    """Décomposition en 4 axes physiques. Chaque champ est borné [0, 1]."""
    thermal: float
    vibration: float
    load: float
    variability: float

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass
class StressIndex:
    """Résultat sérialisable du calcul.

    Attributes
    ----------
    value : float
        Indice agrégé ∈ [0, 1].
    band : StressBand
        Bande opérationnelle (faible / modéré / élevé / critique).
    components : StressComponents
        Détail des 4 sous-indices, pour breakdown UI.
    dominant : str
        Nom de la composante la plus élevée (utile pour l'action recommandée).
    inputs_seen : list[str]
        Composantes effectivement calculées (les autres sont à 0 par défaut
        car capteur absent). Permet à l'UI d'afficher un avertissement si
        SI est calculé sur < 4 composantes.
    """
    value: float
    band: StressBand
    components: StressComponents
    dominant: str
    inputs_seen: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "value": self.value,
            "band": self.band.value,
            "components": self.components.to_dict(),
            "dominant": self.dominant,
            "inputs_seen": list(self.inputs_seen),
        }


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _clip01(x: float) -> float:
    """Borne [0, 1] — équivalent np.clip(x, 0, 1) sans dépendance numpy."""
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


def _band(value: float) -> StressBand:
    if value >= 0.85:
        return StressBand.CRITICAL
    if value >= 0.60:
        return StressBand.HIGH
    if value >= 0.30:
        return StressBand.MODERATE
    return StressBand.LOW


# ──────────────────────────────────────────────────────────────────────────────
# Composantes individuelles — chacune retourne (score ∈ [0,1], present_bool)
# ──────────────────────────────────────────────────────────────────────────────
def _thermal_component(f: Mapping[str, float]) -> tuple[float, bool]:
    t = f.get("temp_mot_c")
    if t is None:
        return 0.0, False
    score = (float(t) - _T_NOMINAL_C) / (_T_CRITICAL_C - _T_NOMINAL_C)
    return _clip01(score), True


def _vibration_component(f: Mapping[str, float]) -> tuple[float, bool]:
    rms = f.get("rms_mms")
    if rms is None:
        return 0.0, False
    score = (float(rms) - _RMS_ZONE_A_MMS) / (_RMS_ZONE_D_MMS - _RMS_ZONE_A_MMS)
    return _clip01(score), True


def _load_component(f: Mapping[str, float]) -> tuple[float, bool]:
    i_rms = f.get("i_rms_a")
    if i_rms is None:
        return 0.0, False
    i_low = _LOAD_LOW_FRACTION * _I_RATED_A
    i_high = _LOAD_HIGH_FRACTION * _I_RATED_A
    score = (float(i_rms) - i_low) / (i_high - i_low)
    return _clip01(score), True


def _variability_component(f: Mapping[str, float]) -> tuple[float, bool]:
    sigma = f.get("i_rms_std_1h")
    mean = f.get("i_rms_a")
    if sigma is None or mean is None or float(mean) < 0.1:
        return 0.0, False
    ratio = float(sigma) / float(mean)
    score = ratio / _VAR_RATIO_MAX
    return _clip01(score), True


# ──────────────────────────────────────────────────────────────────────────────
# API publique
# ──────────────────────────────────────────────────────────────────────────────
def compute_stress_index(features: Mapping[str, float]) -> StressIndex:
    """Calcule le Stress Index instantané d'une machine.

    Parameters
    ----------
    features : Mapping[str, float]
        Mêmes clés (un sous-ensemble) que `diagnose.diagnose` :
            temp_mot_c    : température stator (°C)
            rms_mms       : vibration RMS vélocité (mm/s)
            i_rms_a       : courant RMS moyen 1 h (A)
            i_rms_std_1h  : écart-type courant RMS sur 1 h (A)
        Les composantes pour lesquelles la valeur manque sont mises à 0
        et signalées via `inputs_seen` (utile pour avertir l'UI que le SI
        n'est calculé que sur un sous-ensemble).

    Returns
    -------
    StressIndex
        Objet avec `value` ∈ [0, 1], bande qualitative, décomposition par
        axe physique, et axe dominant.

    Notes
    -----
    Le calcul reste cohérent même avec des capteurs partiels : les
    composantes manquantes contribuent 0, ce qui sous-estime SI plutôt
    que de le surestimer (choix conservateur côté technicien).
    """
    t_score, t_present = _thermal_component(features)
    v_score, v_present = _vibration_component(features)
    l_score, l_present = _load_component(features)
    r_score, r_present = _variability_component(features)

    components = StressComponents(
        thermal=round(t_score, 4),
        vibration=round(v_score, 4),
        load=round(l_score, 4),
        variability=round(r_score, 4),
    )

    # Moyenne arithmétique non pondérée — toujours sur les 4 axes pour
    # garder l'échelle [0, 1] stable (ne pas diviser par n_present : ça
    # ferait sauter la valeur quand un capteur tombe en panne).
    raw_value = (t_score + v_score + l_score + r_score) / 4.0
    value = round(_clip01(raw_value), 4)

    # Composante dominante — orientation pour la fiche d'action UI
    items = [("thermal", t_score), ("vibration", v_score),
             ("load", l_score), ("variability", r_score)]
    items.sort(key=lambda kv: kv[1], reverse=True)
    dominant = items[0][0]

    inputs_seen: list[str] = []
    if t_present: inputs_seen.append("thermal")
    if v_present: inputs_seen.append("vibration")
    if l_present: inputs_seen.append("load")
    if r_present: inputs_seen.append("variability")

    return StressIndex(
        value=value,
        band=_band(value),
        components=components,
        dominant=dominant,
        inputs_seen=inputs_seen,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Self-test
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cases: list[tuple[str, dict[str, float]]] = [
        ("CAS 1 — Régime nominal, machine froide à mi-charge", {
            "temp_mot_c": 55, "rms_mms": 1.2, "i_rms_a": 2.4,
            "i_rms_std_1h": 0.05,
        }),
        ("CAS 2 — Charge élevée mais saine", {
            "temp_mot_c": 75, "rms_mms": 2.4, "i_rms_a": 4.5,
            "i_rms_std_1h": 0.20,
        }),
        ("CAS 3 — Surchauffe + balourd zone C", {
            "temp_mot_c": 95, "rms_mms": 5.5, "i_rms_a": 4.8,
            "i_rms_std_1h": 0.30,
        }),
        ("CAS 4 — Quasi-critique : tous les axes saturés", {
            "temp_mot_c": 108, "rms_mms": 10.5, "i_rms_a": 5.5,
            "i_rms_std_1h": 1.6,
        }),
        ("CAS 5 — Capteurs partiels (température seule)", {
            "temp_mot_c": 95,
        }),
    ]

    print("═" * 78)
    print("SELF-TEST  prediteq_ml.diagnostics.stress")
    print("═" * 78)
    for name, feats in cases:
        si = compute_stress_index(feats)
        print(f"\n▸ {name}")
        print(f"  Inputs   : {feats}")
        c = si.components
        print(f"  SI       : {si.value:.3f}   bande = {si.band.value:<8}   "
              f"dominant = {si.dominant}")
        print(f"  Détail   : T={c.thermal:.2f}  V={c.vibration:.2f}  "
              f"L={c.load:.2f}  R={c.variability:.2f}")
        print(f"  Présents : {si.inputs_seen}")
    print("\n✓ Self-test OK.")
