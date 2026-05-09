"""Shared demo-machine scenarios for simulator and machine endpoints.

These scenarios are intentionally explicit because they are part of the PFE
storytelling: each machine demonstrates a different operating regime and a
different health outcome, not just a different random seed.
"""

from __future__ import annotations

from typing import TypedDict


class DemoScenario(TypedDict):
    site: str
    health_state: str
    health_label: str
    usage_case: str
    explanation: str
    profile: str
    base_load_kg: int
    load_pattern: str
    load_band_kg: tuple[int, int]
    target_hi: float
    public_ticks: int
    cycles_per_day: float
    power_avg_30j_kw: float
    temp_bias_c: float
    humidity_bias_rh: float
    usage_intensity: float
    wear_level: float
    thermal_stress: float
    humidity_stress: float
    load_variability: float
    vibration_bias_mms: float
    overload_bias: float
    reference_rul_days: int | None


DEMO_MACHINE_SCENARIOS: dict[str, DemoScenario] = {
    "ASC-A1": {
        "site": "Ben Arous",
        "health_state": "good",
        "health_label": "Opérationnel",
        "usage_case": "Cycle modéré, charges légères et installation protégée",
        "explanation": (
            "Même génération de machine, mais usage plus calme : service "
            "journalier plus court, charges plus légères, environnement plus "
            "sec et presque aucun historique de surcharge."
        ),
        "profile": "A_linear",
        "base_load_kg": 42,
        "load_pattern": "light_to_medium",
        "load_band_kg": (0, 85),
        "target_hi": 0.96,
        "public_ticks": 7200,
        "cycles_per_day": 280.0,
        "power_avg_30j_kw": 1.18,
        "temp_bias_c": -1.4,
        "humidity_bias_rh": -8.0,
        "usage_intensity": 0.24,
        "wear_level": 0.08,
        "thermal_stress": 0.12,
        "humidity_stress": 0.14,
        "load_variability": 0.08,
        "vibration_bias_mms": 0.03,
        "overload_bias": 0.00,
        "reference_rul_days": None,
    },
    "ASC-B2": {
        "site": "Sfax",
        "health_state": "surveillance",
        "health_label": "Sous surveillance",
        "usage_case": "Trafic mixte régulier avec demi-charges et pics aux heures de pointe",
        "explanation": (
            "Même âge que les autres, avec des conditions moyennes : rythme "
            "de service normal, charges mixtes, quelques périodes plus "
            "chargées et stress ambiant modéré."
        ),
        "profile": "C_stepwise",
        "base_load_kg": 135,
        "load_pattern": "mixed_half_load",
        "load_band_kg": (70, 190),
        "target_hi": 0.62,
        "public_ticks": 7200,
        "cycles_per_day": 480.0,
        "power_avg_30j_kw": 1.62,
        "temp_bias_c": 3.0,
        "humidity_bias_rh": 14.0,
        "usage_intensity": 0.58,
        "wear_level": 0.46,
        "thermal_stress": 0.42,
        "humidity_stress": 0.36,
        "load_variability": 0.46,
        "vibration_bias_mms": 0.20,
        "overload_bias": 0.16,
        "reference_rul_days": 118,
    },
    "ASC-C3": {
        "site": "Sousse",
        "health_state": "critical",
        "health_label": "Critique",
        "usage_case": "Ligne intensive avec charges lourdes et ambiance sévère",
        "explanation": (
            "Même âge que les autres, mais une vie beaucoup plus sévère : "
            "longue amplitude journalière, charges proches du maximum, "
            "environnement plus chaud et humide, épisodes répétés de "
            "quasi-surcharge et dérive vibratoire plus marquée."
        ),
        "profile": "D_noisy_linear",
        "base_load_kg": 235,
        "load_pattern": "heavy_near_max",
        "load_band_kg": (180, 285),
        "target_hi": 0.10,
        "public_ticks": 7200,
        "cycles_per_day": 860.0,
        "power_avg_30j_kw": 2.14,
        "temp_bias_c": 6.5,
        "humidity_bias_rh": 7.0,
        "usage_intensity": 0.92,
        "wear_level": 0.93,
        "thermal_stress": 0.96,
        "humidity_stress": 0.82,
        "load_variability": 0.76,
        "vibration_bias_mms": 0.78,
        "overload_bias": 0.58,
        "reference_rul_days": 77,
    },
}
