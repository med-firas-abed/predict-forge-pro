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
        "health_label": "Operational",
        "usage_case": "High cadence, mostly light-to-medium payloads",
        "explanation": (
            "Newest machine in the fleet: frequent trips, disciplined loading, "
            "cooler environment, and no persistent overload."
        ),
        "profile": "B_quadratic",
        "base_load_kg": 70,
        "load_pattern": "light_to_medium",
        "load_band_kg": (0, 110),
        "target_hi": 0.90,
        "public_ticks": 7200,
        "cycles_per_day": 620.0,
        "power_avg_30j_kw": 1.42,
        "temp_bias_c": -0.6,
        "humidity_bias_rh": -2.0,
        "usage_intensity": 0.72,
        "wear_level": 0.12,
        "thermal_stress": 0.18,
        "humidity_stress": 0.20,
        "load_variability": 0.22,
        "vibration_bias_mms": 0.05,
        "overload_bias": 0.02,
        "reference_rul_days": None,
    },
    "ASC-B2": {
        "site": "Sfax",
        "health_state": "surveillance",
        "health_label": "Under surveillance",
        "usage_case": "Balanced warehouse traffic with recurring half-load cycles",
        "explanation": (
            "Mid-life machine: moderate daily usage, recurring half-load trips, "
            "occasional peaks, and a wear pattern that degrades by stages."
        ),
        "profile": "C_stepwise",
        "base_load_kg": 140,
        "load_pattern": "mixed_half_load",
        "load_band_kg": (60, 180),
        "target_hi": 0.69,
        "public_ticks": 7200,
        "cycles_per_day": 440.0,
        "power_avg_30j_kw": 1.63,
        "temp_bias_c": 0.3,
        "humidity_bias_rh": 1.0,
        "usage_intensity": 0.54,
        "wear_level": 0.48,
        "thermal_stress": 0.44,
        "humidity_stress": 0.38,
        "load_variability": 0.50,
        "vibration_bias_mms": 0.22,
        "overload_bias": 0.18,
        "reference_rul_days": 44,
    },
    "ASC-C3": {
        "site": "Sousse",
        "health_state": "critical",
        "health_label": "Critical",
        "usage_case": "Aging machine with heavy payloads and harsher ambient conditions",
        "explanation": (
            "End-of-life machine: frequent near-max loads, hotter ambient "
            "conditions, larger variability, and a short visible RUL."
        ),
        "profile": "D_noisy_linear",
        "base_load_kg": 210,
        "load_pattern": "heavy_near_max",
        "load_band_kg": (140, 240),
        "target_hi": 0.22,
        "public_ticks": 7200,
        "cycles_per_day": 390.0,
        "power_avg_30j_kw": 1.88,
        "temp_bias_c": 1.1,
        "humidity_bias_rh": 4.0,
        "usage_intensity": 0.46,
        "wear_level": 0.86,
        "thermal_stress": 0.82,
        "humidity_stress": 0.74,
        "load_variability": 0.68,
        "vibration_bias_mms": 0.60,
        "overload_bias": 0.44,
        "reference_rul_days": 31,
    },
}
