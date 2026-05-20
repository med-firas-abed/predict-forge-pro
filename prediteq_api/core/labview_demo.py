"""
Shared helpers for the LabVIEW-style demo bridge.

One source of truth is kept here so that:
    - the CSV generator
    - the runtime bootstrap path
    - the soutenance guides

all rely on the same simulation-consistent assumptions.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
import random

T_ASCENT_S = 12
T_DESCENT_S = 12
T_PAUSE_S = 20
T_CYCLE_S = T_ASCENT_S + T_DESCENT_S + T_PAUSE_S

LOAD_MAX_KG = 285.0
LOAD_CASES_KG = [
    0.0,
    15.0,
    30.0,
    45.0,
    60.0,
    75.0,
    90.0,
    105.0,
    120.0,
    135.0,
    150.0,
    165.0,
    180.0,
    195.0,
    210.0,
    225.0,
    240.0,
    255.0,
    270.0,
    285.0,
]

P_ASCENT_EMPTY_KW = 0.30
P_ASCENT_NOMINAL_KW = 1.51
P_ASCENT_DEGRADED_KW = 2.16
P_ASCENT_LOAD_RANGE_KW = P_ASCENT_NOMINAL_KW - P_ASCENT_EMPTY_KW
P_ASCENT_DEG_RANGE_KW = P_ASCENT_DEGRADED_KW - P_ASCENT_NOMINAL_KW
P_DESCENT_KW = 0.35
P_PAUSE_KW = 0.0

MOTOR_VOLTAGE_V = 400.0
MOTOR_COSPHI = 0.80
MOTOR_SQRT3_V_COSPHI = (3.0 ** 0.5) * MOTOR_VOLTAGE_V * MOTOR_COSPHI

TEMP_MIN_C = 14.0
TEMP_MAX_C = 28.0
HUMID_MIN_RH = 55.0
HUMID_MAX_RH = 80.0

NOISE_VTV122 = 0.015
NOISE_PAC2200 = 0.005

FIELDNAMES = [
    "machine_code",
    "sim_elapsed_s",
    "profile",
    "scenario",
    "phase",
    "vibration_mm_s",
    "motor_power",
    "temperature",
    "humidity",
    "current",
    "charge",
    "state",
    "source",
]

SCENARIOS = {
    "healthy": {
        "start_hi": 0.96,
        "end_hi": 0.88,
        "load_target": 135.0,
        "load_spread": 60.0,
        "noise_mult": 1.00,
        "default_profile": "A_linear",
    },
    "surveillance": {
        "start_hi": 0.74,
        "end_hi": 0.52,
        "load_target": 180.0,
        "load_spread": 75.0,
        "noise_mult": 1.00,
        "default_profile": "B_quadratic",
    },
    "critical": {
        "start_hi": 0.42,
        "end_hi": 0.18,
        "load_target": 225.0,
        "load_spread": 60.0,
        "noise_mult": 1.25,
        "default_profile": "C_stepwise",
    },
}

PROFILE_NAMES = ("A_linear", "B_quadratic", "C_stepwise", "D_noisy_linear")


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def format_float(value: float, digits: int) -> str:
    return f"{value:.{digits}f}"


def degradation_shape(progress: float, profile: str) -> float:
    progress = clamp(progress, 0.0, 1.0)
    if profile == "A_linear":
        return progress
    if profile == "B_quadratic":
        return progress ** 2
    if profile == "C_stepwise":
        return math.floor(progress * 5.0) / 5.0
    if profile == "D_noisy_linear":
        return progress
    raise ValueError(f"Unsupported profile: {profile}")


def hi_for_sample(progress: float, *, start_hi: float, end_hi: float, profile: str) -> float:
    shape = degradation_shape(progress, profile)
    return clamp(start_hi - (start_hi - end_hi) * shape, 0.05, 1.0)


def choose_cycle_loads(num_cycles: int, *, target: float, spread: float, rng: random.Random) -> list[float]:
    weights = []
    for load in LOAD_CASES_KG:
        distance = abs(load - target)
        score = 1.0 / (1.0 + (distance / max(spread, 15.0)) ** 2)
        if load == 0.0:
            score *= 0.35
        weights.append(score)

    loads: list[float] = []
    for cycle_index in range(num_cycles):
        if loads and rng.random() < 0.45:
            loads.append(loads[-1])
            continue

        load = rng.choices(LOAD_CASES_KG, weights=weights, k=1)[0]

        if cycle_index % 9 == 0 and rng.random() < 0.40:
            load = rng.choice([0.0, 60.0, 90.0, 120.0])

        loads.append(load)
    return loads


def cycle_phase(second_index: int) -> str:
    phase_t = second_index % T_CYCLE_S
    if phase_t < T_ASCENT_S:
        return "ascent"
    if phase_t < T_ASCENT_S + T_DESCENT_S:
        return "descent"
    return "pause"


def power_for_phase(phase: str, *, hi: float, load_kg: float, noise_mult: float, rng: random.Random) -> float:
    if phase == "ascent":
        load_ratio = load_kg / LOAD_MAX_KG if LOAD_MAX_KG else 0.0
        p_load = P_ASCENT_EMPTY_KW + P_ASCENT_LOAD_RANGE_KW * load_ratio
        p_deg = P_ASCENT_DEG_RANGE_KW * (1.0 - hi)
        base = clamp(p_load + p_deg, P_ASCENT_EMPTY_KW, P_ASCENT_DEGRADED_KW)
    elif phase == "descent":
        base = P_DESCENT_KW
    else:
        base = P_PAUSE_KW

    noisy = base + rng.gauss(0.0, NOISE_PAC2200 * P_ASCENT_NOMINAL_KW * noise_mult)
    return clamp(noisy, 0.0, 3.0)


def rms_for_hi(hi: float, *, second_index: int, noise_mult: float, rng: random.Random) -> float:
    if hi >= 0.8:
        fraction = (1.0 - hi) / 0.2
        base = 0.90 + 0.55 * fraction
    elif hi >= 0.6:
        fraction = (0.8 - hi) / 0.2
        base = 1.50 + 0.45 * fraction
    elif hi >= 0.3:
        fraction = (0.6 - hi) / 0.3
        base = 2.00 + 2.25 * fraction
    else:
        fraction = clamp((0.3 - hi) / 0.25, 0.0, 1.0)
        base = 4.50 + 2.40 * fraction

    cycle_mod = 0.06 * math.sin((2.0 * math.pi * second_index) / T_CYCLE_S + 0.5)
    noisy = (base + cycle_mod) * (1.0 + rng.gauss(0.0, NOISE_VTV122 * noise_mult))
    return clamp(noisy, 0.1, 10.0)


def current_for_power(power_kw: float) -> float:
    return (power_kw * 1000.0) / MOTOR_SQRT3_V_COSPHI


def _resolve_profile(scenario: str, profile: str | None) -> str:
    scenario_cfg = SCENARIOS[scenario]
    return profile or str(scenario_cfg["default_profile"])


def build_labview_demo_samples(
    *,
    machine_id: str = "ARO-01",
    scenario: str = "surveillance",
    profile: str | None = None,
    duration_s: int = 4400,
    seed: int = 42,
    source: str = "labview_demo_csv",
) -> list[dict]:
    if scenario not in SCENARIOS:
        raise ValueError(f"Unsupported scenario: {scenario}")

    resolved_profile = _resolve_profile(scenario, profile)
    if resolved_profile not in PROFILE_NAMES:
        raise ValueError(f"Unsupported profile: {resolved_profile}")

    rng = random.Random(seed)
    scenario_cfg = SCENARIOS[scenario]
    noise_mult = float(scenario_cfg["noise_mult"]) * (
        3.0 if resolved_profile == "D_noisy_linear" else 1.0
    )

    duration_s = max(1, int(duration_s))
    num_cycles = math.ceil(duration_s / T_CYCLE_S)
    cycle_loads = choose_cycle_loads(
        num_cycles,
        target=float(scenario_cfg["load_target"]),
        spread=float(scenario_cfg["load_spread"]),
        rng=rng,
    )

    machine_code = str(machine_id).strip().upper()
    temp_c = 24.5
    humidity_rh = 60.0
    samples: list[dict] = []

    for second_index in range(duration_s):
        progress = second_index / max(duration_s - 1, 1)
        hi = hi_for_sample(
            progress,
            start_hi=float(scenario_cfg["start_hi"]),
            end_hi=float(scenario_cfg["end_hi"]),
            profile=resolved_profile,
        )
        cycle_index = second_index // T_CYCLE_S
        load_kg = cycle_loads[min(cycle_index, len(cycle_loads) - 1)]
        phase = cycle_phase(second_index)

        power_kw = power_for_phase(
            phase,
            hi=hi,
            load_kg=load_kg,
            noise_mult=noise_mult,
            rng=rng,
        )
        rms_mms = rms_for_hi(
            hi,
            second_index=second_index,
            noise_mult=noise_mult,
            rng=rng,
        )
        current_a = current_for_power(power_kw)

        ambient_temp = TEMP_MIN_C + (TEMP_MAX_C - TEMP_MIN_C) * (
            0.5 + 0.5 * math.sin((2.0 * math.pi * second_index) / max(duration_s, 1))
        )
        motor_heat = 3.5 * (power_kw / P_ASCENT_DEGRADED_KW)
        temp_target = ambient_temp + motor_heat
        temp_c = clamp(temp_c * 0.92 + temp_target * 0.08 + rng.gauss(0.0, 0.06), 12.0, 40.0)

        ambient_humidity = HUMID_MIN_RH + (HUMID_MAX_RH - HUMID_MIN_RH) * (
            0.5 + 0.5 * math.cos((2.0 * math.pi * second_index) / max(duration_s, 1))
        )
        humidity_target = clamp(ambient_humidity - 0.7 * motor_heat, HUMID_MIN_RH, HUMID_MAX_RH)
        humidity_rh = clamp(
            humidity_rh * 0.92 + humidity_target * 0.08 + rng.gauss(0.0, 0.18),
            HUMID_MIN_RH,
            HUMID_MAX_RH,
        )

        samples.append(
            {
                "machine_code": machine_code,
                "sim_elapsed_s": second_index,
                "profile": resolved_profile,
                "scenario": scenario,
                "phase": phase,
                "vibration_mm_s": round(rms_mms, 3),
                "motor_power": round(power_kw, 3),
                "temperature": round(temp_c, 1),
                "humidity": round(humidity_rh, 1),
                "current": round(current_a, 3),
                "charge": round(load_kg, 1),
                "state": phase,
                "source": source,
            }
        )

    return samples


def build_runtime_history(
    *,
    machine_id: str = "ARO-01",
    scenario: str = "surveillance",
    profile: str | None = None,
    duration_s: int = 3600,
    seed: int = 42,
    source: str = "labview_demo_bootstrap",
    end_time: datetime | None = None,
) -> list[dict]:
    samples = build_labview_demo_samples(
        machine_id=machine_id,
        scenario=scenario,
        profile=profile,
        duration_s=duration_s,
        seed=seed,
        source=source,
    )
    if not samples:
        return []

    end_dt = end_time.astimezone(timezone.utc) if end_time else datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(seconds=max(len(samples) - 1, 0))

    history: list[dict] = []
    for idx, sample in enumerate(samples):
        observed_at = (start_dt + timedelta(seconds=idx)).isoformat()
        history.append(
            {
                "machine_id": str(sample["machine_code"]),
                "observed_at": observed_at,
                "rms_mms": float(sample["vibration_mm_s"]),
                "power_kw": float(sample["motor_power"]),
                "temp_c": float(sample["temperature"]),
                "humidity_rh": float(sample["humidity"]),
                "current_a": float(sample["current"]),
                "load_kg": float(sample["charge"]),
                "vibration_rms": float(sample["vibration_mm_s"]),
                "status": str(sample["state"]),
                "source": source,
            }
        )

    return history
