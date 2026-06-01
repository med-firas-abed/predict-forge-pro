"""
Simulator — generates fresh trajectories on-the-fly for all 3 machines.
Cumulative degradation: each run picks up from the last known HI (stored in
Supabase). Every run uses a fresh seed → different noise/profile/load.

ASC-A1 (Ben Arous): protected/light-duty machine, starts around HI ≈ 0.96
ASC-B2 (Sfax): mixed-traffic machine, starts around HI ≈ 0.62 (surveillance)
ASC-C3 (Sousse): harsh-duty machine, starts around HI ≈ 0.10 (critique)

POST /simulator/start          — cumulative run (picks up from last HI)
POST /simulator/start?reset=1  — reset all machines to initial state
POST /simulator/stop            — stop replay
GET  /simulator/status          — current replay state
"""

import asyncio
import logging
import sys
import os
import time
import threading
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from core.config import settings
from core.auth import CurrentUser, require_admin_or_local_demo
from core.email_client import build_urgence_html, send_alert_email_detailed
from core.email_history import append_email_event
from core.demo_context import (
    get_demo_initial_hi,
    get_demo_machine_codes,
    get_demo_scenario,
    iter_demo_calibration_seeds,
)
from core.labview_demo import build_labview_demo_samples
from core.supabase_client import get_supabase
from ml.engine_manager import get_manager
from routers.seuils import get_alert_recipients

# Add prediteq_ml to path so we can import config + simulation functions
_ml_dir = settings.ML_DIR
if _ml_dir not in sys.path:
    sys.path.insert(0, _ml_dir)
_steps_dir = os.path.join(_ml_dir, "steps")
if _steps_dir not in sys.path:
    sys.path.insert(0, _steps_dir)

from config import (
    TRAJECTORY_LEN_MIN,
    T_CYCLE_S, T_ASCENT_S, T_DESCENT_S,
    P_PAUSE_KW, P_DESCENT_KW, P_ASCENT_EMPTY_KW, P_ASCENT_NOM_KW,
    P_ASCENT_DEG_KW, P_ASCENT_LOAD_RANGE, P_ASCENT_DEG_RANGE,
    LOAD_MAX_KG, MOTOR_SQRT3_V_COSPHI,
    NOISE_VTV122, NOISE_PAC2200, NOISE_TEMP_C, NOISE_HUMID_RH,
    TEMP_MIN_C, TEMP_MAX_C, HUMID_MIN_RH, HUMID_MAX_RH,
    F_CHASSIS_HZ, A_CHASSIS_MMS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/simulator", tags=["simulator"])

# ─── State ────────────────────────────────────────────────────────────────────

_task: asyncio.Task | None = None
_demo_prewarm_task: asyncio.Task | None = None
_notification_tasks: set[asyncio.Task] = set()
_state: dict = {
    "running": False,
    "speed": 60,
    "tick": 0,
    "demo_mode": True,
    "machines": {},
}


def _set_main_replay_task(task: asyncio.Task) -> None:
    global _task
    _task = task

    def _on_done(done: asyncio.Task) -> None:
        global _task
        if _task is done:
            _task = None
        if done.cancelled():
            return
        exc = done.exception()
        if exc:
            logger.error("Simulator task crashed: %s", exc)

    task.add_done_callback(_on_done)


async def _cancel_task(task: asyncio.Task | None, *, label: str) -> None:
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        logger.info("Simulator: %s task cancelled", label)


async def _stop_background_runtime(*, require_running: bool) -> bool:
    global _task, _demo_prewarm_task, _state

    had_running_replay = bool(_state.get("running"))
    if require_running and not had_running_replay:
        return False

    _state["running"] = False
    replay_task = _task
    prewarm_task = _demo_prewarm_task
    _task = None
    _demo_prewarm_task = None

    await _cancel_task(replay_task, label="replay")
    await _cancel_task(prewarm_task, label="prewarm")

    pending_notifications = list(_notification_tasks)
    _notification_tasks.clear()
    for notification_task in pending_notifications:
        await _cancel_task(notification_task, label="notification")

    return had_running_replay


async def _wait_for_runtime_seed(*, demo_mode: bool, timeout_s: float = 8.0) -> bool:
    manager = get_manager()
    loop = asyncio.get_running_loop()
    deadline = loop.time() + max(timeout_s, 0.1)
    simulator_codes = _get_simulator_machine_codes(demo_mode=demo_mode)

    while loop.time() < deadline:
        if any(manager.last_raw.get(code) for code in simulator_codes):
            return True
        await asyncio.sleep(0.2)

    return any(manager.last_raw.get(code) for code in simulator_codes)


async def _start_simulator_session(
    *,
    speed: int,
    reset: bool,
    demo_mode: bool,
    email_notifications: bool,
) -> list[str]:
    global _state

    if _state["running"]:
        raise HTTPException(409, "Simulator already running")

    if speed < 1 or speed > 1000:
        raise HTTPException(400, "Speed must be between 1 and 1000")

    await _stop_background_runtime(require_running=False)

    manager = get_manager()
    simulator_codes = _get_simulator_machine_codes(demo_mode=demo_mode)
    _refresh_simulator_machine_cache(manager, demo_mode=demo_mode)
    for code in simulator_codes:
        manager.reset(code)

    if reset:
        try:
            sb = get_supabase()
            now_iso = datetime.now(timezone.utc).isoformat()
            for code, hi in INITIAL_HI.items():
                uuid = manager.get_uuid(code)
                if uuid:
                    statut = 'operational' if hi >= 0.8 else ('degraded' if hi >= 0.3 else 'critical')
                    sb.table('machines').update({
                        'hi_courant': round(hi, 4),
                        'rul_courant': None,
                        'statut': statut,
                        'derniere_maj': now_iso,
                    }).eq('id', uuid).execute()
            logger.info("Simulator: reset HI values written to Supabase")
        except Exception as e:
            logger.warning("Could not reset Supabase HI: %s", e)

    _state = {
        "running": True,
        "speed": speed,
        "tick": 0,
        "demo_mode": demo_mode,
        "machines": {},
    }
    task = asyncio.create_task(
        _replay_loop(speed, reset, demo_mode, email_notifications)
    )
    _set_main_replay_task(task)
    return simulator_codes


async def ensure_demo_simulator_running(
    *,
    speed: int = 60,
    reset: bool = True,
    email_notifications: bool = False,
    wait_for_seed: bool = True,
    timeout_s: float = 8.0,
) -> bool:
    if not settings.DEMO_SIMULATOR_AUTO_START_ENABLED:
        logger.info("Simulator auto-start disabled by configuration")
        return False

    if _state.get("running"):
        logger.info("Simulator auto-start skipped: replay already running")
        return False

    await _start_simulator_session(
        speed=speed,
        reset=reset,
        demo_mode=True,
        email_notifications=email_notifications,
    )
    logger.info(
        "Simulator auto-start launched in demo mode at x%s (reset=%s)",
        speed,
        reset,
    )

    if wait_for_seed:
        if await _wait_for_runtime_seed(demo_mode=True, timeout_s=timeout_s):
            logger.info("Simulator auto-start ready: telemetry seed is available")
        else:
            logger.warning(
                "Simulator auto-start launched, but telemetry seed was not ready within %.1fs",
                timeout_s,
            )

    return True


async def shutdown_simulator_runtime() -> None:
    await _stop_background_runtime(require_running=False)

# All 3 demo machines participate in the simulation
MACHINE_CODES = get_demo_machine_codes()

# ─── Cumulative degradation ──────────────────────────────────────────────────
# Default starting HI — used on first-ever run or after reset.
# A1 is brand new (opérationnel), B2 is mid-life (surveillance), C3 is worn (critique).
INITIAL_HI = get_demo_initial_hi()

# Each machine must stay inside its designated zone during simulation.
# The HI is clamped to these bounds so the demo always shows 3 distinct zones.
HI_ZONE_BOUNDS = {
    "ASC-A1": (0.90, 0.98),   # opérationnel protégé
    "ASC-B2": (0.60, 0.70),   # usage moyen / surveillance
    "ASC-C3": (0.05, 0.16),   # usage dur / critique
    "ARO-01": (0.92, 0.99),   # nouvelle machine AroTeq en mise en service
}

# Fraction of a full lifecycle per simulator session.
# ~15% → a full trajectory has ~48000 ticks → ~7200 ticks per session.
# At speed=60 that's ~2 min real time. ~7 runs to cover a full lifecycle.
SESSION_FRAC = 0.15


# ─── Demo runtime calibration seeds ──────────────────────────────────────────
# (machine_code, cycles_per_day, power_avg_30j_kw)
#
# Used by the simulator at start-of-replay to seed manager.machine_cache and
# the cycles_per_day_override so the /rul-v2 endpoint produces realistic
# numbers immediately (without waiting 7 days of wall-clock observation).
#
# Values used by the legacy cumulative path (demo_mode=False). The default
# demo-stage path below uses DEMO_STAGE_CONFIG directly.
#
# In production (real MQTT data, no simulator), scheduler.py rebuilds these
# values naturally over real days using actual sensor observations.
DEMO_CALIBRATION_SEEDS: list[tuple[str, float, float]] = iter_demo_calibration_seeds()

# Demo mode is tuned against the live IF + RF runtime, not against the
# synthetic HI directly. Each machine starts at a calibrated point in its own
# degradation trajectory so the natural pipeline lands near the desired stage:
#   - ASC-A1: early degradation -> HI stays in Excellent with a long forecast
#   - ASC-B2: mid degradation   -> HI sits in surveillance with a medium forecast
#   - ASC-C3: late degradation  -> HI enters Critical with a short forecast
def _build_demo_stage_config() -> dict[str, dict[str, float | int | str | tuple[int, int]]]:
    config: dict[str, dict[str, float | int | str | tuple[int, int]]] = {}
    for code in MACHINE_CODES:
        scenario = get_demo_scenario(code)
        if scenario is None:
            continue
        config[code] = {
            "profile": scenario["profile"],
            "base_load_kg": scenario["base_load_kg"],
            "load_pattern": scenario["load_pattern"],
            "load_band_kg": scenario["load_band_kg"],
            "target_hi": scenario["target_hi"],
            "public_ticks": scenario["public_ticks"],
            "cycles_per_day": scenario["cycles_per_day"],
            "power_avg_30j_kw": scenario["power_avg_30j_kw"],
            "temp_bias_c": scenario["temp_bias_c"],
            "humidity_bias_rh": scenario["humidity_bias_rh"],
            "usage_intensity": scenario["usage_intensity"],
            "wear_level": scenario["wear_level"],
            "thermal_stress": scenario["thermal_stress"],
            "humidity_stress": scenario["humidity_stress"],
            "load_variability": scenario["load_variability"],
            "vibration_bias_mms": scenario["vibration_bias_mms"],
            "overload_bias": scenario["overload_bias"],
        }
    return config


DEMO_STAGE_CONFIG = _build_demo_stage_config()

DEMO_SEED_BASE = 20260427

# ARO-01 stays the product's future real machine, but simulator mode can feed
# it with LabVIEW-style telemetry so the live runtime exposes the same pages
# and derived metrics during the demo.
REAL_MACHINE_SIM_STAGE_CONFIG: dict[str, dict[str, object]] = {
    "ARO-01": {
        "machine_name": "Machine AroTeq",
        "site": "Ben Arous",
        "scenario_name": "healthy",
        "profile": "A_linear",
        "base_load_kg": 60,
        "load_band_kg": (0, 90),
        "bootstrap_ticks": 3600,
        "public_ticks": 7200,
        "seed": DEMO_SEED_BASE + 17,
        "target_runtime_hi": 0.96,
        "display_hi_start": 0.985,
        "display_hi_end": 0.958,
        "cycles_per_day": 280.0,
        "power_avg_30j_kw": 1.18,
        "scenario": {
            "site": "Ben Arous",
            "health_state": "good",
            "health_label": "Operationnel",
            "usage_case": (
                "Machine neuve en mise en service avec telemetrie CSV representative "
                "du futur flux PLC / LabVIEW."
            ),
            "explanation": (
                "La simulation montre une machine recente, peu chargee et stable, "
                "afin d'illustrer le futur parcours temps reel sur une machine saine."
            ),
            "profile": "A_linear",
            "base_load_kg": 60,
            "load_pattern": "commissioning_light_duty",
            "load_band_kg": (0, 90),
            "target_hi": 0.96,
            "public_ticks": 7200,
            "cycles_per_day": 280.0,
            "power_avg_30j_kw": 1.18,
            "temp_bias_c": -1.0,
            "humidity_bias_rh": -6.0,
            "usage_intensity": 0.22,
            "wear_level": 0.08,
            "thermal_stress": 0.12,
            "humidity_stress": 0.10,
            "load_variability": 0.08,
            "vibration_bias_mms": 0.03,
            "overload_bias": 0.00,
            "reference_rul_days": None,
        },
    }
}

SIMULATOR_DEMO_MODE_CODES = MACHINE_CODES + [
    code for code in REAL_MACHINE_SIM_STAGE_CONFIG if code not in MACHINE_CODES
]

# Calibrated replay starts expressed in trajectory ticks.
#
# These are not UI placeholders: they are the points where the public replay
# begins inside each deterministic telemetry trajectory. The live engine still
# recomputes HI, zone and RUL from the injected sensors; we only choose which
# operating regime each machine starts from.
DEMO_PUBLIC_START_TICKS: dict[str, int] = {
    # ASC-B2 uses a manual plateau start so the stepwise mid-life profile
    # keeps 20 minutes of warmup context before replay begins.
    "ASC-B2": 20400,
}

# The runtime engine has finite memory. Replaying an entire lifecycle from tick
# 0 made demo startup take several minutes, which blocked live charts and left
# the dashboard in an inconsistent state. A 20-minute simulated warmup keeps
# the engines in the right regime while bringing startup back under a few
# seconds on the demo machine.
DEMO_BOOTSTRAP_CONTEXT_TICKS = 1200

# Deterministic demo trajectories do not change between runs, so we cache the
# calibrated warmup/public slices once per bootstrap-window size.
_DEMO_TRAJECTORY_CACHE: dict[int, dict[str, dict]] = {}
_DEMO_TRAJECTORY_LOCK = threading.Lock()


def _scenario_float(
    scenario: dict[str, float | int | str | tuple[int, int]] | None,
    key: str,
    default: float,
) -> float:
    if scenario is None:
        return default
    value = scenario.get(key, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp_demo_hi(code: str, hi: float) -> float:
    lo, hi_bound = HI_ZONE_BOUNDS.get(code, (0.0, 1.0))
    return float(np.clip(float(hi), lo, hi_bound))


def _demo_zone_from_hi(hi: float) -> str:
    if hi >= 0.80:
        return "Excellent"
    if hi >= 0.60:
        return "Good"
    if hi >= 0.30:
        return "Degraded"
    return "Critical"


def _persisted_status_from_zone(zone: str | None, hi: float | None = None) -> str:
    if zone == "Excellent":
        return "operational"
    if zone in {"Good", "Degraded"}:
        return "degraded"
    if zone == "Critical":
        return "critical"
    if hi is None:
        return "operational"
    if hi >= 0.8:
        return "operational"
    if hi >= 0.3:
        return "degraded"
    return "critical"


def _get_simulator_machine_codes(*, demo_mode: bool) -> list[str]:
    return list(SIMULATOR_DEMO_MODE_CODES if demo_mode else MACHINE_CODES)


def _get_simulator_stage_config(
    code: str,
) -> dict[str, float | int | str | tuple[int, int]] | None:
    cfg = DEMO_STAGE_CONFIG.get(code)
    if cfg is not None:
        return cfg

    extra_cfg = REAL_MACHINE_SIM_STAGE_CONFIG.get(code)
    if extra_cfg is None:
        return None

    return {
        "profile": str(extra_cfg["profile"]),
        "base_load_kg": int(extra_cfg["base_load_kg"]),
        "load_band_kg": tuple(extra_cfg["load_band_kg"]),  # type: ignore[arg-type]
        "target_hi": float(extra_cfg["target_runtime_hi"]),
        "public_ticks": int(extra_cfg["public_ticks"]),
        "cycles_per_day": float(extra_cfg["cycles_per_day"]),
        "power_avg_30j_kw": float(extra_cfg["power_avg_30j_kw"]),
    }


def _get_simulator_display_scenario(code: str):
    return get_demo_scenario(code) or REAL_MACHINE_SIM_STAGE_CONFIG.get(code, {}).get("scenario")


def _refresh_simulator_machine_cache(manager, *, demo_mode: bool) -> list[str]:
    """Refresh simulator-machine UUIDs from Supabase before a replay starts."""
    try:
        sb = get_supabase()
    except Exception as exc:
        logger.warning("Simulator: machine cache refresh skipped (%s)", exc)
        return []

    refreshed: list[str] = []
    for code in _get_simulator_machine_codes(demo_mode=demo_mode):
        try:
            result = (
                sb.table("machines")
                .select("*")
                .eq("code", code)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            logger.warning("Simulator: could not refresh machine cache for %s: %s", code, exc)
            continue

        row = (result.data or [None])[0]
        if row is None:
            logger.warning("Simulator: demo fleet is missing machine row %s", code)
            continue

        manager.machine_cache[code] = {
            **manager.machine_cache.get(code, {}),
            **row,
        }
        refreshed.append(code)

    if refreshed:
        logger.info("Simulator: refreshed machine cache for %s", ", ".join(refreshed))
    return refreshed


def _clamp_demo_trajectory_slice(
    df: pd.DataFrame,
    code: str,
    rng: np.random.Generator,
    scenario: dict[str, float | int | str | tuple[int, int]] | None = None,
) -> pd.DataFrame:
    """Clamp one demo machine inside its intended display band and regenerate sensors."""
    clamped = df.copy()
    lo, hi_bound = HI_ZONE_BOUNDS.get(code, (0.0, 1.0))
    clamped["simulated_hi"] = clamped["simulated_hi"].clip(lower=lo, upper=hi_bound)

    hi_values = clamped["simulated_hi"].astype(float).values
    t_arr = clamped["t_seconds"].astype(float).values
    load_series = clamped["load_kg"].astype(float).values

    clamped["rms_mms"] = _hi_to_rms(hi_values, t_arr, rng, scenario)
    power_kw, current_a, phase = _compute_power_current(
        hi_values,
        t_arr,
        load_series,
        rng,
        scenario,
    )
    clamped["power_kw"] = power_kw
    clamped["current_a"] = current_a
    clamped["phase"] = phase
    temp_c, humidity_rh = _compute_temp_humidity(
        t_arr,
        power_kw,
        rng,
        scenario=scenario,
        temp_bias_c=_scenario_float(scenario, "temp_bias_c", 0.0),
        humidity_bias_rh=_scenario_float(scenario, "humidity_bias_rh", 0.0),
    )
    clamped["temp_c"] = temp_c
    clamped["humidity_rh"] = humidity_rh
    return clamped


def _apply_demo_display_override(manager, code: str, planned_hi: float) -> None:
    """Force public runtime status to stay inside the machine's intended demo color."""
    display_hi = _clamp_demo_hi(code, planned_hi)
    display_result = dict(manager.last_results.get(code) or {})
    display_result["hi_smooth"] = display_hi
    display_result["zone"] = _demo_zone_from_hi(display_hi)
    manager.last_results[code] = display_result


def _get_starting_hi(reset: bool = False) -> dict[str, float]:
    """Read last known HI from Supabase for cumulative degradation.
    Falls back to INITIAL_HI on first run or if reset=True."""
    if reset:
        logger.info("Simulator: resetting to initial HI values")
        return dict(INITIAL_HI)
    try:
        sb = get_supabase()
        result = sb.table('machines').select('code,hi_courant').execute()
        hi_map = {}
        for row in result.data:
            code = row.get('code')
            hi = row.get('hi_courant')
            if code in MACHINE_CODES:
                # If hi_courant exists and is reasonable, use it (cumulative)
                if hi is not None and 0.01 < float(hi) < 0.99:
                    hi_map[code] = float(hi)
                else:
                    hi_map[code] = INITIAL_HI.get(code, 0.98)
        for code in MACHINE_CODES:
            if code not in hi_map:
                hi_map[code] = INITIAL_HI.get(code, 0.98)
            # Clamp to designated zone so machine always starts in its zone
            lo, hi_bound = HI_ZONE_BOUNDS.get(code, (0.0, 1.0))
            hi_map[code] = max(lo, min(hi_map[code], hi_bound))
        logger.info("Simulator: starting HI from DB: %s",
                     {k: f"{v:.3f}" for k, v in hi_map.items()})
        return hi_map
    except Exception as e:
        logger.warning("Could not read HI from Supabase: %s — using defaults", e)
        return dict(INITIAL_HI)


# ─── Trajectory generation (from step1_simulate physics, fresh each run) ─────

def _compute_hi(profile: str, t_arr: np.ndarray, t_fail: float,
                rng: np.random.Generator) -> np.ndarray:
    # v2.1 — coefficient 0.7→0.95 pour cohérence avec step1_simulate.py
    # (HI(t_fail) ≈ 0.05, traverse complètement zone Critical avant coupure).
    ratio = t_arr / t_fail
    if profile == "A_linear":
        return np.clip(1 - 0.95 * ratio, 0, 1)
    elif profile == "B_quadratic":
        return np.clip(1 - 0.95 * ratio**2, 0, 1)
    elif profile == "C_stepwise":
        step = np.floor(5 * ratio) / 5
        return np.clip(1 - 0.95 * step, 0, 1)
    elif profile == "D_noisy_linear":
        base = np.clip(1 - 0.95 * ratio, 0, 1)
        noise = rng.normal(0, 0.08, size=len(t_arr))
        return np.clip(base + noise, 0, 1)
    return np.clip(1 - 0.7 * ratio, 0, 1)


def _hi_to_rms(hi: np.ndarray, t_seconds: np.ndarray,
               rng: np.random.Generator,
               scenario: dict[str, float | int | str | tuple[int, int]] | None = None) -> np.ndarray:
    n = len(hi)
    rms = np.zeros(n)
    vibration_bias = _scenario_float(scenario, "vibration_bias_mms", 0.0)
    load_variability = _scenario_float(scenario, "load_variability", 0.25)
    for i in range(n):
        h = hi[i]
        if h >= 0.8:
            rms[i] = rng.uniform(0.8, 1.5)
        elif h >= 0.6:
            rms[i] = rng.uniform(1.5, 2.0)
        elif h >= 0.3:
            rms[i] = rng.uniform(2.0, 4.5)
        else:
            rms[i] = rng.uniform(4.5, 7.5)
    rms += A_CHASSIS_MMS * np.sin(2 * np.pi * F_CHASSIS_HZ * t_seconds)
    rms += vibration_bias
    rms += 0.18 * load_variability * np.sin(2 * np.pi * t_seconds / max(T_CYCLE_S * 9, 1))
    rms *= (1 + rng.normal(0, NOISE_VTV122, size=n))
    return np.clip(rms, 0.1, 10.0)


def _build_load_series(t_seconds: np.ndarray, scenario: dict[str, float | int | str | tuple[int, int]],
                       rng: np.random.Generator) -> np.ndarray:
    """Generate per-cycle payloads so each demo machine tells a distinct story."""
    phase_t = t_seconds % T_CYCLE_S
    cycle_idx = np.floor(t_seconds / T_CYCLE_S).astype(int)
    n_cycles = int(cycle_idx.max()) + 1 if len(cycle_idx) > 0 else 0

    pattern = str(scenario["load_pattern"])

    if pattern == "light_to_medium":
        candidates = np.array([0, 20, 35, 50, 70, 90], dtype=float)
        weights = np.array([0.20, 0.26, 0.22, 0.17, 0.10, 0.05], dtype=float)
    elif pattern == "mixed_half_load":
        candidates = np.array([70, 100, 130, 150, 170, 190], dtype=float)
        weights = np.array([0.08, 0.16, 0.24, 0.24, 0.18, 0.10], dtype=float)
    elif pattern == "heavy_near_max":
        candidates = np.array([180, 210, 230, 250, 270, 285], dtype=float)
        weights = np.array([0.06, 0.12, 0.20, 0.24, 0.22, 0.16], dtype=float)
    else:
        low, high = scenario["load_band_kg"]  # type: ignore[misc]
        candidates = np.array([low, high], dtype=float)
        weights = np.array([0.5, 0.5], dtype=float)

    overload_bias = _scenario_float(scenario, "overload_bias", 0.0)
    variability = _scenario_float(scenario, "load_variability", 0.25)
    usage_intensity = _scenario_float(scenario, "usage_intensity", 0.5)

    if len(candidates) > 1:
        heaviness = np.linspace(-1.0, 1.0, len(candidates))
        weights = weights * (1 + heaviness * overload_bias)
        weights = weights * (1 + np.abs(heaviness) * variability * 0.35)
        weights = weights * (1 + np.clip(heaviness, 0, None) * usage_intensity * 0.18)
        weights = np.clip(weights, 0.01, None)

    cycle_loads = rng.choice(candidates, size=n_cycles, p=weights / weights.sum()).astype(float)

    # Add slow operational rhythm so the sequence does not look purely random.
    if n_cycles > 0:
        wave_amplitude = 4.0 + 14.0 * variability
        wave = np.sin(np.linspace(0, (2.5 + usage_intensity) * np.pi, n_cycles))
        low, high = scenario["load_band_kg"]  # type: ignore[misc]
        cycle_loads = np.clip(cycle_loads + wave * wave_amplitude, low, high)

    loads = cycle_loads[cycle_idx] if n_cycles > 0 else np.array([], dtype=float)
    loads = np.where(phase_t < T_ASCENT_S, loads, 0.0)
    return loads


def _compute_power_current(hi: np.ndarray, t_seconds: np.ndarray,
                           load_kg: float | np.ndarray,
                           rng: np.random.Generator,
                           scenario: dict[str, float | int | str | tuple[int, int]] | None = None):
    n = len(t_seconds)
    phase_t = t_seconds % T_CYCLE_S
    power = np.zeros(n)
    phase = np.full(n, "pause", dtype=object)
    wear_level = _scenario_float(scenario, "wear_level", 0.5)
    thermal_stress = _scenario_float(scenario, "thermal_stress", 0.5)
    usage_intensity = _scenario_float(scenario, "usage_intensity", 0.5)
    if np.isscalar(load_kg):
        load_series = np.full(n, float(load_kg), dtype=float)
    else:
        load_series = np.asarray(load_kg, dtype=float)

    for i in range(n):
        pt = phase_t[i]
        h = hi[i]
        load_ratio = load_series[i] / LOAD_MAX_KG
        if pt < T_ASCENT_S:
            phase[i] = "ascent"
            p_load = P_ASCENT_EMPTY_KW + P_ASCENT_LOAD_RANGE * load_ratio
            p_deg = P_ASCENT_DEG_RANGE * (1 - h) * (1 + 0.35 * wear_level)
            strain = 1 + 0.04 * thermal_stress + 0.03 * usage_intensity
            power[i] = np.clip((p_load + p_deg) * strain, P_ASCENT_EMPTY_KW, P_ASCENT_DEG_KW)
        elif pt < T_ASCENT_S + T_DESCENT_S:
            phase[i] = "descent"
            power[i] = P_DESCENT_KW
        else:
            phase[i] = "pause"
            power[i] = P_PAUSE_KW

    power += rng.normal(0, NOISE_PAC2200 * P_ASCENT_NOM_KW, size=n)
    power = np.clip(power, 0.0, 3.0)
    current = (power * 1000) / MOTOR_SQRT3_V_COSPHI
    return power, current, phase


def _compute_temp_humidity(t_seconds: np.ndarray, power: np.ndarray,
                           rng: np.random.Generator,
                           scenario: dict[str, float | int | str | tuple[int, int]] | None = None,
                           temp_bias_c: float = 0.0,
                           humidity_bias_rh: float = 0.0):
    t_slow = np.arange(0, t_seconds[-1] + 1, 10)
    n_slow = len(t_slow)
    thermal_stress = _scenario_float(scenario, "thermal_stress", 0.5)
    usage_intensity = _scenario_float(scenario, "usage_intensity", 0.5)
    humidity_stress = _scenario_float(scenario, "humidity_stress", 0.5)
    amb_temp = TEMP_MIN_C + (TEMP_MAX_C - TEMP_MIN_C) * (
        0.5 + 0.5 * np.sin(2 * np.pi * t_slow / (t_seconds[-1] + 1))
    ) + temp_bias_c
    idx_slow = np.clip(t_slow.astype(int), 0, len(power) - 1)
    motor_heat = (3.5 + 1.4 * thermal_stress + 0.8 * usage_intensity) * (
        power[idx_slow] / P_ASCENT_DEG_KW
    )
    temp_slow = amb_temp + motor_heat + rng.normal(0, NOISE_TEMP_C, size=n_slow)
    humid_slow = HUMID_MIN_RH + (HUMID_MAX_RH - HUMID_MIN_RH) * (
        0.5 + 0.5 * np.cos(2 * np.pi * t_slow / (t_seconds[-1] + 1))
    ) + humidity_bias_rh + humidity_stress * 1.2 + rng.normal(0, NOISE_HUMID_RH, size=n_slow)
    temp_1hz = np.interp(t_seconds, t_slow, temp_slow)
    humid_1hz = np.interp(t_seconds, t_slow, humid_slow)
    return temp_1hz, np.clip(humid_1hz, HUMID_MIN_RH, HUMID_MAX_RH)


def _generate_trajectory(profile: str, load_kg: float,
                         rng: np.random.Generator,
                         scenario: dict[str, float | int | str | tuple[int, int]] | None = None) -> pd.DataFrame:
    """Generate a single trajectory using the same physics as step1_simulate."""
    t_fail_base = TRAJECTORY_LEN_MIN * 60  # seconds
    i_ratio_sq = (load_kg / LOAD_MAX_KG) ** 2 if LOAD_MAX_KG > 0 else 1.0
    usage_intensity = _scenario_float(scenario, "usage_intensity", 0.5)
    wear_level = _scenario_float(scenario, "wear_level", 0.5)
    thermal_stress = _scenario_float(scenario, "thermal_stress", 0.5)
    humidity_stress = _scenario_float(scenario, "humidity_stress", 0.5)
    overload_bias = _scenario_float(scenario, "overload_bias", 0.0)
    ambient_stress = 0.65 * thermal_stress + 0.35 * humidity_stress
    load_stress = np.clip(i_ratio_sq + overload_bias * 0.30, 0.0, 1.35)
    deg_rate = (
        0.24
        + 0.52 * load_stress
        + 0.28 * wear_level
        + 0.16 * usage_intensity
        + 0.14 * ambient_stress
    )
    deg_rate = float(np.clip(deg_rate, 0.25, 1.35))
    t_fail_adj = t_fail_base * rng.uniform(0.75, 0.95) / max(deg_rate, 0.3)
    t_max = t_fail_base
    t_fail_adj = min(t_fail_adj, t_max * 0.95)
    t_end = int(min(t_fail_adj * 1.10, t_max))
    t_seconds = np.arange(0, t_end, 1, dtype=float)

    hi = _compute_hi(profile, t_seconds, t_fail_adj, rng)
    rms_mms = _hi_to_rms(hi, t_seconds, rng, scenario)
    load_series = _build_load_series(t_seconds, scenario, rng) if scenario is not None else np.full(len(t_seconds), load_kg, dtype=float)
    power_kw, current_a, phase = _compute_power_current(hi, t_seconds, load_series, rng, scenario)
    temp_c, humid_rh = _compute_temp_humidity(
        t_seconds,
        power_kw,
        rng,
        scenario=scenario,
        temp_bias_c=float(scenario.get("temp_bias_c", 0.0)) if scenario else 0.0,
        humidity_bias_rh=float(scenario.get("humidity_bias_rh", 0.0)) if scenario else 0.0,
    )

    return pd.DataFrame({
        "t_seconds": t_seconds,
        "load_kg": load_series,
        "rms_mms": rms_mms,
        "power_kw": power_kw,
        "current_a": current_a,
        "temp_c": temp_c,
        "humidity_rh": humid_rh,
        "simulated_hi": hi,
        "phase": phase,
    })


def _generate_all_trajectories(reset: bool = False) -> dict[str, pd.DataFrame]:
    """Generate fresh trajectories for all 3 demo machines with cumulative degradation.

    Reads the last known HI from Supabase, generates a full trajectory,
    finds the point matching that HI, and plays one session (SESSION_FRAC)
    forward from there.  Each run advances the machine's degradation.

    reset=True → ignore Supabase, start from INITIAL_HI.
    """
    seed = int(time.time() * 1000) % (2**31)
    rng = np.random.default_rng(seed)
    logger.info("Simulator: generating trajectories (seed=%d, reset=%s)", seed, reset)

    starting_hi = _get_starting_hi(reset)
    slices: dict[str, pd.DataFrame] = {}

    for code in MACHINE_CODES:
        scenario = DEMO_STAGE_CONFIG[code]
        profile = str(scenario["profile"])
        load = int(scenario["base_load_kg"])
        full_traj = _generate_trajectory(profile, load, rng, scenario)

        target_hi = starting_hi[code]
        hi_values = full_traj["simulated_hi"].values

        # Find the index in this trajectory closest to the target HI
        start_idx = int(np.argmin(np.abs(hi_values - target_hi)))
        session_len = int(len(full_traj) * SESSION_FRAC)
        end_idx = min(start_idx + session_len, len(full_traj))

        # If barely any data left (machine at end-of-life), replay the final portion
        if end_idx - start_idx < 300:
            start_idx = max(0, len(full_traj) - session_len)
            end_idx = len(full_traj)

        slc = full_traj.iloc[start_idx:end_idx].copy().reset_index(drop=True)
        slc = _clamp_demo_trajectory_slice(slc, code, rng, scenario)

        slices[code] = slc
        logger.info("  %s: %s, %d kg, idx %d→%d (%d pts), HI %.3f→%.3f (target: %.3f) — sensors regenerated for clamped HI",
                    code, profile, load, start_idx, end_idx, len(slices[code]),
                    slices[code]["simulated_hi"].iloc[0],
                    slices[code]["simulated_hi"].iloc[-1],
                    target_hi)

    return slices


def _generate_demo_trajectories() -> dict[str, dict]:
    """Build deterministic demo trajectories with calibrated public start ticks.

    The simulator fast-forwards each machine through its own natural history
    before replay starts, so the live IF + RF stack reaches the intended stage
    from sensor data alone.
    """
    logger.info("Simulator: generating deterministic demo-stage trajectories")
    scenarios: dict[str, dict] = {}

    for idx, code in enumerate(MACHINE_CODES):
        cfg = DEMO_STAGE_CONFIG[code]
        profile = str(cfg["profile"])
        load_kg = int(cfg["base_load_kg"])
        public_ticks = int(cfg["public_ticks"])
        target_hi = float(cfg["target_hi"])

        rng = np.random.default_rng(DEMO_SEED_BASE + idx)
        full_traj = _generate_trajectory(profile, load_kg, rng, cfg)
        full_traj = _clamp_demo_trajectory_slice(full_traj, code, rng, cfg)
        calibrated_start_tick = DEMO_PUBLIC_START_TICKS.get(code)
        if calibrated_start_tick is not None:
            start_tick = min(calibrated_start_tick, max(0, len(full_traj) - public_ticks))
        else:
            hi_values = full_traj["simulated_hi"].values
            start_tick = int(np.argmin(np.abs(hi_values - target_hi)))
        end_tick = min(start_tick + public_ticks, len(full_traj))

        if end_tick - start_tick < 300:
            start_tick = max(0, len(full_traj) - public_ticks)
            end_tick = len(full_traj)

        bootstrap_start_tick = max(0, start_tick - DEMO_BOOTSTRAP_CONTEXT_TICKS)
        warmup_df = full_traj.iloc[bootstrap_start_tick:start_tick].copy().reset_index(drop=True)
        public_df = full_traj.iloc[start_tick:end_tick].copy().reset_index(drop=True)
        rul_seed_start_tick = max(0, start_tick - 3600)
        rul_seed_window = (
            full_traj.iloc[rul_seed_start_tick:start_tick]["simulated_hi"]
            .astype(float)
            .to_numpy()
        )
        if len(rul_seed_window) >= 3600:
            rul_seed_hi_history = [float(value) for value in rul_seed_window[-3600:][59::60]]
        elif len(rul_seed_window) >= 60:
            indices = np.linspace(0, len(rul_seed_window) - 1, 60, dtype=int)
            rul_seed_hi_history = [float(rul_seed_window[index]) for index in indices]
        else:
            rul_seed_hi_history = [float(value) for value in rul_seed_window]

        scenarios[code] = {
            "warmup": warmup_df,
            "public": public_df,
            "profile": profile,
            "load_kg": load_kg,
            "bootstrap_start_tick": bootstrap_start_tick,
            "start_tick": start_tick,
            "target_runtime_hi": target_hi,
            "scenario": get_demo_scenario(code),
            "rul_seed_hi_history": rul_seed_hi_history,
        }

        logger.info(
            "  %s: %s, %d kg base load, bootstrap %d -> %d, public %d -> %d (%d pts), target HI %.3f",
            code,
            profile,
            load_kg,
            bootstrap_start_tick,
            start_tick,
            start_tick,
            end_tick,
            len(public_df),
            target_hi,
        )

    return scenarios


def _get_demo_trajectories() -> dict[str, dict]:
    cache_key = DEMO_BOOTSTRAP_CONTEXT_TICKS
    cached = _DEMO_TRAJECTORY_CACHE.get(cache_key)
    if cached is not None:
        logger.info(
            "Simulator: reusing cached deterministic demo trajectories (%d warmup ticks)",
            cache_key,
        )
        return cached

    with _DEMO_TRAJECTORY_LOCK:
        cached = _DEMO_TRAJECTORY_CACHE.get(cache_key)
        if cached is not None:
            logger.info(
                "Simulator: reusing cached deterministic demo trajectories (%d warmup ticks)",
                cache_key,
            )
            return cached

        generated = _generate_demo_trajectories()
        _DEMO_TRAJECTORY_CACHE[cache_key] = generated
        return generated


def _build_real_machine_simulator_trajectories() -> dict[str, dict]:
    """Build deterministic replay slices for real-machine demo slots."""
    scenarios: dict[str, dict] = {}

    for code, cfg in REAL_MACHINE_SIM_STAGE_CONFIG.items():
        bootstrap_ticks = int(cfg["bootstrap_ticks"])
        public_ticks = int(cfg["public_ticks"])
        total_ticks = bootstrap_ticks + public_ticks
        samples = build_labview_demo_samples(
            machine_id=code,
            scenario=str(cfg["scenario_name"]),
            profile=str(cfg["profile"]),
            duration_s=total_ticks,
            seed=int(cfg["seed"]),
            source="simulator_demo",
        )
        if not samples:
            continue

        warmup_samples = samples[:bootstrap_ticks]
        public_samples = samples[bootstrap_ticks:]
        warmup_df = pd.DataFrame(warmup_samples)
        public_df = pd.DataFrame(public_samples)
        display_hi_start = float(cfg.get("display_hi_start", cfg["target_runtime_hi"]))
        display_hi_end = float(cfg.get("display_hi_end", cfg["target_runtime_hi"]))
        display_hi_series = np.linspace(display_hi_start, display_hi_end, total_ticks, dtype=float)
        warmup_hi = display_hi_series[:bootstrap_ticks]
        public_hi = display_hi_series[bootstrap_ticks:]
        nominal_load = float(cfg["base_load_kg"])

        for frame, hi_values in ((warmup_df, warmup_hi), (public_df, public_hi)):
            if frame.empty:
                continue
            frame["simulated_hi"] = hi_values
            frame["vibration_mm_s"] = np.clip(frame["vibration_mm_s"].astype(float), 0.88, 1.18)
            frame["rms_mms"] = frame["vibration_mm_s"].astype(float)
            frame["power_kw"] = frame["motor_power"].astype(float)
            frame["temp_c"] = np.clip(frame["temperature"].astype(float), 21.2, 25.0)
            frame["humidity_rh"] = np.clip(frame["humidity"].astype(float), 56.0, 68.0)
            frame["charge"] = np.where(frame["phase"].astype(str) == "pause", 0.0, nominal_load)
            frame["load_kg"] = frame["charge"].astype(float)
            phase = frame["phase"].astype(str)
            frame["current"] = np.where(
                phase == "ascent",
                1.12 + 0.02 * np.sin(np.linspace(0.0, 2.0 * np.pi, len(frame))),
                np.where(phase == "descent", 0.64, 0.0),
            )
            frame["current_a"] = frame["current"].astype(float)
            frame["status"] = frame["state"].astype(str)

        if not warmup_df.empty:
            warmup_end = datetime.now(timezone.utc)
            warmup_start = warmup_end - timedelta(seconds=max(len(warmup_df) - 1, 0))
            warmup_df["observed_at"] = [
                (warmup_start + timedelta(seconds=idx)).isoformat()
                for idx in range(len(warmup_df))
            ]

        scenarios[code] = {
            "warmup": warmup_df,
            "public": public_df,
            "profile": str(cfg["profile"]),
            "load_kg": int(cfg["base_load_kg"]),
            "bootstrap_start_tick": 0,
            "start_tick": bootstrap_ticks,
            "target_runtime_hi": float(cfg["target_runtime_hi"]),
            "scenario": _get_simulator_display_scenario(code),
            "rul_seed_hi_history": [float(value) for value in warmup_hi[59::60]] or [float(value) for value in warmup_hi[-60:]],
            "force_hi_alignment": True,
        }

        logger.info(
            "  %s: LabVIEW-style replay, bootstrap %d s, public %d s, target HI %.3f",
            code,
            bootstrap_ticks,
            public_ticks,
            float(cfg["target_runtime_hi"]),
        )

    return scenarios


def _schedule_demo_prewarm() -> None:
    global _demo_prewarm_task

    if _DEMO_TRAJECTORY_CACHE.get(DEMO_BOOTSTRAP_CONTEXT_TICKS) is not None:
        return
    if _demo_prewarm_task is not None and not _demo_prewarm_task.done():
        return

    async def _worker():
        logger.info("Simulator: prewarming deterministic demo trajectories in background")
        await asyncio.to_thread(_get_demo_trajectories)

    task = asyncio.create_task(_worker())

    def _on_done(done: asyncio.Task) -> None:
        global _demo_prewarm_task
        _demo_prewarm_task = None
        if done.cancelled():
            return
        exc = done.exception()
        if exc:
            logger.warning("Simulator demo prewarm failed: %s", exc)
        else:
            logger.info("Simulator: deterministic demo trajectories ready")

    task.add_done_callback(_on_done)
    _demo_prewarm_task = task


def _shape_demo_raw(prev_raw: dict | None, row) -> dict:
    """Keep demo telemetry inside the runtime feature envelope.

    The offline dataset was engineered from rolling windows, while the live
    simulator emits raw 1 Hz phase transitions. Gentle rate limits preserve the
    trajectory physics but avoid unrealistic per-second jumps that would be
    rejected by the engine's outlier guard before the IF sees them.
    """
    raw = {
        "rms_mms": float(row["rms_mms"]),
        "power_kw": float(row["power_kw"]),
        "temp_c": float(np.clip(float(row["temp_c"]), 22.0, 29.0)),
        "humidity_rh": float(row["humidity_rh"]),
        "load_kg": float(row.get("load_kg", 0.0)),
        "status": "SIMULATED",
        "source": "simulator_demo",
        "observed_at": datetime.now(timezone.utc).isoformat(),
    }
    if prev_raw is None:
        return raw

    return {
        "rms_mms": prev_raw["rms_mms"] + float(np.clip(raw["rms_mms"] - prev_raw["rms_mms"], -0.20, 0.20)),
        "power_kw": prev_raw["power_kw"] + float(np.clip(raw["power_kw"] - prev_raw["power_kw"], -0.25, 0.25)),
        "temp_c": prev_raw["temp_c"] + float(np.clip(raw["temp_c"] - prev_raw["temp_c"], -0.08, 0.08)),
        "humidity_rh": prev_raw["humidity_rh"] + float(np.clip(raw["humidity_rh"] - prev_raw["humidity_rh"], -0.60, 0.60)),
        "load_kg": raw["load_kg"],
        "status": "SIMULATED",
        "source": "simulator_demo",
        "observed_at": raw["observed_at"],
    }


def _shape_labview_real_machine_raw(prev_raw: dict | None, row) -> dict:
    """Keep the future PLC/LabVIEW replay smooth for the runtime engine."""
    observed_at = str(row.get("observed_at") or datetime.now(timezone.utc).isoformat())
    current_a = float(row.get("current_a", row.get("current", 0.0)) or 0.0)
    raw = {
        "rms_mms": float(row["rms_mms"]),
        "power_kw": float(row["power_kw"]),
        "temp_c": float(row["temp_c"]),
        "humidity_rh": float(row["humidity_rh"]),
        "load_kg": float(row.get("load_kg", row.get("charge", 0.0))),
        "current_a": current_a,
        "vibration_rms": float(row.get("vibration_rms", row["rms_mms"])),
        "status": str(row.get("status", "SIMULATED")),
        "source": "simulator_demo",
        "observed_at": observed_at,
    }
    if prev_raw is None:
        return raw

    prev_current = float(prev_raw.get("current_a", current_a))
    return {
        "rms_mms": prev_raw["rms_mms"] + float(np.clip(raw["rms_mms"] - prev_raw["rms_mms"], -0.22, 0.22)),
        "power_kw": prev_raw["power_kw"] + float(np.clip(raw["power_kw"] - prev_raw["power_kw"], -0.25, 0.25)),
        "temp_c": prev_raw["temp_c"] + float(np.clip(raw["temp_c"] - prev_raw["temp_c"], -0.12, 0.12)),
        "humidity_rh": prev_raw["humidity_rh"] + float(np.clip(raw["humidity_rh"] - prev_raw["humidity_rh"], -0.75, 0.75)),
        "load_kg": raw["load_kg"],
        "current_a": prev_current + float(np.clip(current_a - prev_current, -0.20, 0.20)),
        "vibration_rms": raw["vibration_rms"],
        "status": raw["status"],
        "source": "simulator_demo",
        "observed_at": observed_at,
    }


def _shape_simulator_raw(prev_raw: dict | None, row) -> dict:
    if "vibration_mm_s" in row or "motor_power" in row:
        return _shape_labview_real_machine_raw(prev_raw, row)
    return _shape_demo_raw(prev_raw, row)


def _bootstrap_simulator_histories(manager) -> tuple[dict[str, dict], dict[str, dict | None]]:
    """Prepare deterministic simulator scenarios and seed recent engine context.

    The engine only remembers a bounded recent history, so we bootstrap that
    finite context instead of replaying full trajectories from tick 0. This
    keeps the ML computation path intact while making demo startup practical.
    """
    scenarios = {**_get_demo_trajectories(), **_build_real_machine_simulator_trajectories()}
    prev_raw_by_code: dict[str, dict | None] = {}

    logger.info("Simulator: seeding engines from recent pre-start telemetry")
    for code, info in scenarios.items():
        if code not in manager.engines:
            manager._get_or_create(code)

        raw_history: list[dict] = []
        prev_raw = None
        for row in info["warmup"].to_dict("records"):
            raw = _shape_simulator_raw(prev_raw, row)
            prev_raw = raw
            raw_history.append(raw)

        if raw_history:
            manager.bootstrap_history(
                code,
                raw_history,
                tick_offset=int(info["bootstrap_start_tick"]),
            )
            engine = manager.engines.get(code)
            if engine is not None:
                ml_hi_history = [float(value) for value in engine.buffer_hi_smooth]
                seed_hi_history = [
                    float(value) for value in info.get("rul_seed_hi_history", [])
                ]
                if info.get("force_hi_alignment") and seed_hi_history:
                    aligned_hi_history = seed_hi_history[-(engine.buffer_hi_smooth.maxlen or len(seed_hi_history)):]
                    engine.buffer_hi_smooth.clear()
                    engine.buffer_hi_smooth.extend(aligned_hi_history)
                    if code in manager.last_results:
                        manager.last_results[code]["buffer_hi_len"] = len(engine.buffer_hi_smooth)
                    ml_hi_history = [float(value) for value in engine.buffer_hi_smooth]
                required_points = max(0, (engine.buffer_hi_smooth.maxlen or 0) - len(ml_hi_history))
                if required_points > 0 and seed_hi_history:
                    demo_prefix = seed_hi_history[:required_points]
                    combined_hi_history = (demo_prefix + ml_hi_history)[-(engine.buffer_hi_smooth.maxlen or len(ml_hi_history)):]
                    engine.buffer_hi_smooth.clear()
                    engine.buffer_hi_smooth.extend(combined_hi_history)
                    if code in manager.last_results:
                        manager.last_results[code]["buffer_hi_len"] = len(engine.buffer_hi_smooth)
            warmup_df = info["warmup"]
            if len(warmup_df) > 0 and "simulated_hi" in warmup_df.columns:
                _apply_demo_display_override(
                    manager,
                    code,
                    float(warmup_df.iloc[-1]["simulated_hi"]),
                )
            prev_raw_by_code[code] = prev_raw
        else:
            prev_raw_by_code[code] = None

        cfg = _get_simulator_stage_config(code) or {}
        cycles_per_day = cfg.get("cycles_per_day")
        power_avg = cfg.get("power_avg_30j_kw")
        if cycles_per_day is not None:
            manager.set_cycles_per_day_override(code, float(cycles_per_day))
        cached = manager.machine_cache.setdefault(code, {})
        if power_avg is not None:
            cached["power_avg_30j"] = float(power_avg)
        if cycles_per_day is not None:
            cached["cycles_avg_7j"] = float(cycles_per_day)

        if cycles_per_day is not None and power_avg is not None:
            logger.info(
                "  Replay seed for %s: seeded %d context ticks, cycles/day=%.0f, P_avg_30j=%.2f kW",
                code,
                len(raw_history),
                float(cycles_per_day),
                float(power_avg),
            )

    return scenarios, prev_raw_by_code


def _persist_simulator_machine_snapshots(manager) -> None:
    """Persist simulator-stage state so DB-backed views stay coherent."""
    try:
        sb = get_supabase()
    except Exception as exc:
        logger.warning("Simulator demo DB sync skipped: Supabase unavailable (%s)", exc)
        return

    try:
        from routers.diagnostics_rul import build_calibrated_rul_response
    except Exception as exc:
        logger.warning(
            "Simulator demo DB sync skipped: calibrated RUL unavailable (%s)",
            exc,
        )
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    for code in SIMULATOR_DEMO_MODE_CODES:
        machine_uuid = manager.get_uuid(code)
        if not machine_uuid:
            continue

        cfg = _get_simulator_stage_config(code) or {}
        last = manager.last_results.get(code) or {}
        hi = last.get("hi_smooth")
        zone = last.get("zone")

        update_data: dict[str, float | int | str | None] = {
            "derniere_maj": now_iso,
            "metrics_updated": now_iso,
        }

        cycles_per_day = cfg.get("cycles_per_day")
        if cycles_per_day is not None:
            update_data["cycles_avg_7j"] = round(float(cycles_per_day), 1)

        power_avg = cfg.get("power_avg_30j_kw")
        if power_avg is not None:
            update_data["power_avg_30j"] = round(float(power_avg), 4)

        if hi is not None:
            hi_value = float(hi)
            update_data["hi_courant"] = round(hi_value, 4)
            update_data["statut"] = _persisted_status_from_zone(zone, hi_value)

        try:
            rul_payload = build_calibrated_rul_response(manager, code)
        except Exception as exc:
            logger.warning("Simulator demo RUL snapshot failed for %s: %s", code, exc)
            rul_payload = None

        prediction = ((rul_payload or {}).get("prediction") or {})
        if (rul_payload or {}).get("mode") == "prediction" and prediction.get("rul_days") is not None:
            update_data["rul_courant"] = int(round(float(prediction["rul_days"])))
        else:
            update_data["rul_courant"] = None

        manager.machine_cache.setdefault(code, {}).update(update_data)

        try:
            sb.table("machines").update(update_data).eq("id", machine_uuid).execute()
        except Exception as exc:
            logger.warning("Simulator demo DB sync failed for %s: %s", code, exc)


def _send_demo_critical_notifications(manager) -> dict:
    """Send one critical email per demo run for machines staged as critical."""
    try:
        sb = get_supabase()
    except Exception as exc:
        logger.warning("Simulator demo alert/email setup failed: %s", exc)
        return {
            "recipients": [],
            "attempted_codes": [],
            "sent_codes": [],
            "failed_recipients": [],
        }

    attempted_codes: list[str] = []
    sent_codes: list[str] = []
    failed_recipients: list[str] = []
    all_recipients: list[str] = []

    for code in MACHINE_CODES:
        scenario = get_demo_scenario(code)
        if not scenario or str(scenario.get("health_state")) != "critical":
            continue

        last = manager.last_results.get(code) or {}
        hi = float(last.get("hi_smooth") or scenario.get("target_hi") or 0.0)
        zone = str(last.get("zone") or _demo_zone_from_hi(hi))
        if zone != "Critical" and hi >= 0.30:
            logger.info(
                "Simulator demo email skipped for %s: runtime zone=%s hi=%.3f",
                code,
                zone,
                hi,
            )
            continue

        attempted_codes.append(code)
        machine_info = manager.get_machine_info(code) or {}
        machine_uuid = str(machine_info.get("id") or manager.get_uuid(code) or "")
        machine_nom = str(machine_info.get("nom") or code)
        recipients = get_alert_recipients(machine_uuid or None)
        if not recipients:
            logger.warning(
                "Simulator demo email skipped for %s: no alert recipients configured",
                code,
            )
            continue
        all_recipients.extend(recipients)
        rul_result = None
        try:
            from routers.diagnostics_rul import build_calibrated_rul_response

            rul_payload = build_calibrated_rul_response(manager, code)
            prediction = (rul_payload.get("prediction") or {}) if isinstance(rul_payload, dict) else {}
            if rul_payload.get("mode") == "prediction" and prediction.get("rul_days") is not None:
                ci_low = prediction.get("rul_days_display_low")
                ci_high = prediction.get("rul_days_display_high")
                if ci_low is None or ci_high is None:
                    ci_low = prediction.get("rul_days_p10")
                    ci_high = prediction.get("rul_days_p90")
                rul_result = {
                    "rul_days": float(prediction["rul_days"]),
                    "ci_low": float(ci_low) if ci_low is not None else None,
                    "ci_high": float(ci_high) if ci_high is not None else None,
                }
        except Exception:
            rul_result = manager.predict_rul(code)
        subject = f"[URGENCE - Simulation] {machine_nom} — machine critique détectée"
        html = build_urgence_html(machine_nom, code, hi, rul_result, [])

        try:
            sb.table("alertes").insert({
                "machine_id": machine_uuid,
                "type": "hi",
                "titre": f"Machine critique au lancement du replay - {code}",
                "description": (
                    "Replay démo démarré sur scénario critique. "
                    "Notification email déclenchée vers les destinataires reliés à cette machine."
                ),
                "severite": "urgence",
            }).execute()
        except Exception as exc:
            logger.warning("Simulator demo alert insert failed for %s: %s", code, exc)

        success_count = 0
        for recipient in recipients:
            sent = send_alert_email(recipient, subject, html)
            append_email_event(
                machine_id=machine_uuid,
                machine_code=code,
                machine_name=machine_nom,
                recipient_email=recipient,
                success=sent,
                alert_type="hi",
                source="simulator",
                severity="urgence",
                subject=subject,
                note="Demo critical scenario triggered at simulator start.",
            )
            if sent:
                success_count += 1
            else:
                failed_recipients.append(recipient)

        if success_count > 0:
            sent_codes.append(code)
            logger.info(
                "Simulator demo critical email sent for %s to %d/%d recipients",
                code,
                success_count,
                len(recipients),
            )
        else:
            logger.warning(
                "Simulator demo critical email failed for %s (%d recipients)",
                code,
                len(recipients),
            )

    return {
        "recipients": list(dict.fromkeys(all_recipients)),
        "attempted_codes": attempted_codes,
        "sent_codes": sent_codes,
        "failed_recipients": list(dict.fromkeys(failed_recipients)),
    }


def _prepare_demo_critical_notifications_non_blocking(
    manager,
    email_notifications: bool = True,
) -> tuple[dict, list[dict]]:
    """Prepare critical alerts synchronously, defer SMTP sending to the background."""
    try:
        sb = get_supabase()
    except Exception as exc:
        logger.warning("Simulator demo alert/email setup failed: %s", exc)
        return {
            "recipients": [],
            "attempted_codes": [],
            "sent_codes": [],
            "failed_recipients": [],
        }, []

    attempted_codes: list[str] = []
    all_recipients: list[str] = []
    jobs: list[dict] = []

    for code in MACHINE_CODES:
        scenario = get_demo_scenario(code)
        if not scenario or str(scenario.get("health_state")) != "critical":
            continue

        last = manager.last_results.get(code) or {}
        hi = float(last.get("hi_smooth") or scenario.get("target_hi") or 0.0)
        zone = str(last.get("zone") or _demo_zone_from_hi(hi))
        if zone != "Critical" and hi >= 0.30:
            logger.info(
                "Simulator demo email skipped for %s: runtime zone=%s hi=%.3f",
                code,
                zone,
                hi,
            )
            continue

        attempted_codes.append(code)
        machine_info = manager.get_machine_info(code) or {}
        machine_uuid = str(machine_info.get("id") or manager.get_uuid(code) or "")
        machine_nom = str(machine_info.get("nom") or code)
        if not email_notifications:
            logger.info("Simulator demo email notifications disabled for %s", code)
            continue
        recipients = get_alert_recipients(machine_uuid or None)
        if not recipients:
            logger.warning(
                "Simulator demo email skipped for %s: no alert recipients configured",
                code,
            )
            continue
        all_recipients.extend(recipients)

        rul_result = None
        try:
            from routers.diagnostics_rul import build_calibrated_rul_response

            rul_payload = build_calibrated_rul_response(manager, code)
            prediction = (rul_payload.get("prediction") or {}) if isinstance(rul_payload, dict) else {}
            if rul_payload.get("mode") == "prediction" and prediction.get("rul_days") is not None:
                ci_low = prediction.get("rul_days_display_low")
                ci_high = prediction.get("rul_days_display_high")
                if ci_low is None or ci_high is None:
                    ci_low = prediction.get("rul_days_p10")
                    ci_high = prediction.get("rul_days_p90")
                rul_result = {
                    "rul_days": float(prediction["rul_days"]),
                    "ci_low": float(ci_low) if ci_low is not None else None,
                    "ci_high": float(ci_high) if ci_high is not None else None,
                }
        except Exception:
            rul_result = manager.predict_rul(code)

        subject = f"[URGENCE - Simulation] {machine_nom} — machine critique détectée"
        html = build_urgence_html(machine_nom, code, hi, rul_result, [])

        try:
            sb.table("alertes").insert({
                "machine_id": machine_uuid,
                "type": "hi",
                "titre": f"Machine critique au lancement du replay - {code}",
                "description": (
                    "Replay démo démarré sur scénario critique. "
                    "Notification email déclenchée vers les destinataires reliés à cette machine."
                ),
                "severite": "urgence",
            }).execute()
        except Exception as exc:
            logger.warning("Simulator demo alert insert failed for %s: %s", code, exc)

        for recipient in recipients:
            jobs.append({
                "machine_id": machine_uuid,
                "machine_code": code,
                "machine_name": machine_nom,
                "recipient_email": recipient,
                "subject": subject,
                "html": html,
            })

    return {
        "recipients": list(dict.fromkeys(all_recipients)),
        "attempted_codes": attempted_codes,
        "sent_codes": [],
        "failed_recipients": [],
    }, jobs


def _deliver_demo_notification_jobs(jobs: list[dict]) -> dict:
    sent_codes: list[str] = []
    failed_recipients: list[str] = []
    attempted_by_code: dict[str, int] = {}
    success_by_code: dict[str, int] = {}

    for job in jobs:
        code = str(job["machine_code"])
        attempted_by_code[code] = attempted_by_code.get(code, 0) + 1
        sent, note = send_alert_email_detailed(
            str(job["recipient_email"]),
            str(job["subject"]),
            str(job["html"]),
        )
        append_email_event(
            machine_id=str(job["machine_id"]),
            machine_code=code,
            machine_name=str(job["machine_name"]),
            recipient_email=str(job["recipient_email"]),
            success=sent,
            alert_type="hi",
            source="simulator",
            severity="urgence",
            subject=str(job["subject"]),
            note=(
                "Demo critical scenario triggered at simulator start."
                + (f" SMTP: {note}" if note else "")
            ),
        )
        if sent:
            success_by_code[code] = success_by_code.get(code, 0) + 1
        else:
            failed_recipients.append(str(job["recipient_email"]))

    for code, attempted_count in attempted_by_code.items():
        success_count = success_by_code.get(code, 0)
        if success_count > 0:
            sent_codes.append(code)
            logger.info(
                "Simulator demo critical email sent for %s to %d/%d recipients",
                code,
                success_count,
                attempted_count,
            )
        else:
            logger.warning(
                "Simulator demo critical email failed for %s (%d recipients)",
                code,
                attempted_count,
            )

    return {
        "sent_codes": sent_codes,
        "failed_recipients": list(dict.fromkeys(failed_recipients)),
    }


async def _dispatch_demo_notification_jobs(summary: dict, jobs: list[dict]) -> None:
    if not summary.get("attempted_codes"):
        return

    if not jobs:
        logger.info(
            "Simulator demo notifications: attempted=%s sent=[] recipients=[]",
            summary["attempted_codes"],
        )
        return

    delivery = await asyncio.to_thread(_deliver_demo_notification_jobs, jobs)
    logger.info(
        "Simulator demo notifications: attempted=%s sent=%s recipients=%s",
        summary["attempted_codes"],
        delivery["sent_codes"],
        summary["recipients"],
    )


def _track_background_task(task: asyncio.Task, label: str) -> None:
    _notification_tasks.add(task)

    def _on_done(done: asyncio.Task) -> None:
        _notification_tasks.discard(done)
        if done.cancelled():
            return
        exc = done.exception()
        if exc is not None:
            logger.error("%s failed: %s", label, exc)

    task.add_done_callback(_on_done)


# ─── Replay loop ──────────────────────────────────────────────────────────────

async def _replay_loop(
    speed: int,
    reset: bool = False,
    demo_mode: bool = True,
    email_notifications: bool = True,
):
    """Background loop: feeds one row per machine every (1/speed) seconds."""
    global _state
    try:
        # Yield once immediately so POST /simulator/start can return before the
        # demo warmup begins. Without this, the background task may monopolize
        # the event loop long enough for the frontend fetch timeout to fire.
        await asyncio.sleep(0)

        manager = get_manager()

        if demo_mode:
            scenarios, prev_raw_by_code = await asyncio.to_thread(
                _bootstrap_simulator_histories, manager
            )
            await asyncio.to_thread(_persist_simulator_machine_snapshots, manager)

            max_len = max(len(info["public"]) for info in scenarios.values())
            _state["machines"] = {
                code: {
                    "total": len(info["public"]),
                    "current": 0,
                    "profile": info["profile"],
                    "load_kg": info["load_kg"],
                    "start_tick": info["start_tick"],
                    "target_runtime_hi": info["target_runtime_hi"],
                    "scenario": info["scenario"],
                }
                for code, info in scenarios.items()
            }

            notification_summary, notification_jobs = await asyncio.to_thread(
                _prepare_demo_critical_notifications_non_blocking,
                manager,
                email_notifications,
            )
            if notification_summary["attempted_codes"]:
                notification_task = asyncio.create_task(
                    _dispatch_demo_notification_jobs(
                        notification_summary,
                        notification_jobs,
                    )
                )
                _track_background_task(
                    notification_task,
                    "Simulator demo notifications",
                )

            delay = 1.0 / speed
            for tick in range(max_len):
                if not _state["running"]:
                    break

                for code, info in scenarios.items():
                    public_df = info["public"]
                    if tick >= len(public_df):
                        continue

                    row = public_df.iloc[tick].to_dict()
                    raw = _shape_simulator_raw(prev_raw_by_code.get(code), row)
                    prev_raw_by_code[code] = raw
                    manager.ingest(code, raw, allow_extreme=True)
                    if row.get("simulated_hi") is not None:
                        _apply_demo_display_override(
                            manager,
                            code,
                            float(row["simulated_hi"]),
                        )

                    _state["machines"][code]["current"] = tick
                    if row.get("simulated_hi") is not None:
                        _state["machines"][code]["simulated_hi"] = float(row["simulated_hi"])
                    _state["machines"][code]["current_load_kg"] = float(
                        row.get("load_kg", row.get("charge", 0.0))
                    )

                _state["tick"] = tick

                if delay > 0.001:
                    await asyncio.sleep(delay)
                elif tick % 100 == 0:
                    await asyncio.sleep(0)

            _state["running"] = False
            for code in scenarios:
                manager.clear_cycles_per_day_override(code)
            manager.rul_overrides.clear()
            logger.info("Simulator demo replay complete — %d ticks", tick + 1)
            return

        slices = _generate_all_trajectories(reset)
        logger.info("Simulator: trajectories ready for %d machines", len(slices))

        max_len = max(len(s) for s in slices.values())
        _state["machines"] = {code: {"total": len(s), "current": 0,
                                     "profile": None, "load_kg": None}
                              for code, s in slices.items()}

        # Pre-fill each engine's HI buffer with the first 60 simulated_hi values
        # (sampled evenly from the first 10% of the trajectory) so that
        # predict_rul() works immediately instead of waiting 60 minutes.
        for code, traj_df in slices.items():
            if code not in manager.engines:
                manager._get_or_create(code)
            engine = manager.engines[code]
            hi_vals = traj_df["simulated_hi"].values
            # Sample 60 points from the first 10% for a realistic HI history
            prefill_end = max(60, len(hi_vals) // 10)
            indices = np.linspace(0, prefill_end - 1, 60, dtype=int)
            for idx in indices:
                engine.buffer_hi_smooth.append(float(hi_vals[idx]))

        # ── Seed calibration metrics for the restored calendar view ────────
        # Real production paths : scheduler.py accumulates these over real
        # days from MQTT data. Demo path (this simulator) only runs ~2 min
        # wall-clock, so we seed realistic per-machine values directly so
        # the /rul-v2 endpoint and the engineering reference blocks stay coherent.
        # Values are chosen to match the planned scenarios, the restored
        # synthetic timeline, and the ISO 281 reference block:
        for code, cycles_per_day, p_avg in DEMO_CALIBRATION_SEEDS:
            manager.set_cycles_per_day_override(code, cycles_per_day)
            cached = manager.machine_cache.setdefault(code, {})
            cached['power_avg_30j'] = p_avg
            logger.info(
                "  Calibration seed for %s: cycles/day=%.0f, P_avg_30j=%.2f kW",
                code, cycles_per_day, p_avg
            )

        delay = 1.0 / speed

        for tick in range(max_len):
            if not _state["running"]:
                break

            for code, traj_df in slices.items():
                if tick >= len(traj_df):
                    continue

                row = traj_df.iloc[tick]
                raw = {
                    "rms_mms":     float(row["rms_mms"]),
                    "power_kw":    float(row["power_kw"]),
                    "temp_c":      float(row["temp_c"]),
                    "humidity_rh": float(row["humidity_rh"]),
                    "status": "SIMULATED",
                    "source": "simulator_demo",
                    "observed_at": datetime.now(timezone.utc).isoformat(),
                }
                manager.ingest(code, raw, allow_extreme=True)

                sim_hi = float(row["simulated_hi"])

                # ── Calibrated RF path only — no hand-written RUL bypass ────
                # Previously this block hand-coded a RUL via the formula
                #   rul = (sim_hi - 0.15) / 0.85 × 90
                # which short-circuited the Random Forest entirely. Now that
                # sensors are regenerated from the clamped HI (see
                # _generate_all_trajectories) and the HI buffer matches the
                # displayed HI, the RF receives coherent inputs and predicts
                # natively within its training distribution. The /rul-v2
                # endpoint restores the synthetic time scale and surfaces the
                # ISO 281 bearing-life reference alongside the RF prediction.
                # ─────────────────────────────────────────────────────────────

                _state["machines"][code]["current"] = tick
                _state["machines"][code]["simulated_hi"] = sim_hi
                _state["machines"][code]["current_load_kg"] = float(row["load_kg"])

            _state["tick"] = tick

            if delay > 0.001:
                await asyncio.sleep(delay)
            elif tick % 100 == 0:
                await asyncio.sleep(0)

            if tick > 0 and tick % 5000 == 0:
                logger.info("Simulator: tick %d/%d", tick, max_len)

        _state["running"] = False
        # ── Cleanup at end of replay ────────────────────────────────────────
        # Clear cycles_per_day_override per machine so any subsequent real
        # MQTT traffic uses wall-clock-observed rate. rul_overrides is no
        # longer populated by the simulator, but we clear it defensively
        # in case some legacy code path still wrote into it.
        for code in MACHINE_CODES:
            manager.clear_cycles_per_day_override(code)
        manager.rul_overrides.clear()
        logger.info("Simulator replay complete — %d ticks", tick + 1)

    except Exception as e:
        import traceback
        logger.error("Simulator error: %s\n%s", e, traceback.format_exc())
        _state["running"] = False


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_simulator(speed: int = 60, reset: bool = False,
                          demo_mode: bool = True,
                          email_notifications: bool = True,
                          admin: CurrentUser = Depends(require_admin_or_local_demo)):
    """
    Start simulator.

    demo_mode=True  -> deterministic stage-seeded replay calibrated against the
                       live IF + RF runtime.
    demo_mode=False -> legacy cumulative replay from the last persisted HI.

    speed = ticks per real second (60 = 1 minute of data per second).
    reset = true to reset all machines to initial HI (fresh start).
    """
    simulator_codes = await _start_simulator_session(
        speed=speed,
        reset=reset,
        demo_mode=demo_mode,
        email_notifications=email_notifications,
    )

    return {
        "status": "started",
        "speed": speed,
        "reset": reset,
        "demo_mode": demo_mode,
        "email_notifications": email_notifications,
        "machines": simulator_codes,
        "message": (
            f"{'Reset + ' if reset else ''}"
            f"{'Demo-stage ' if demo_mode else 'Cumulative '}run at {speed}x speed"
        ),
    }


@router.post("/stop")
async def stop_simulator(admin: CurrentUser = Depends(require_admin_or_local_demo)):
    """Stop the running simulator."""
    if not await _stop_background_runtime(require_running=True):
        raise HTTPException(409, "Simulator not running")
    return {"status": "stopped", "tick": _state["tick"]}


@router.get("/status")
async def simulator_status(admin: CurrentUser = Depends(require_admin_or_local_demo)):
    """Get current simulator state (admin only)."""
    _schedule_demo_prewarm()
    manager = get_manager()
    result = dict(_state)

    demo_mode = bool(result.get("demo_mode", True))
    for code in _get_simulator_machine_codes(demo_mode=demo_mode):
        result["machines"].setdefault(code, {})
        result["machines"][code]["scenario"] = _get_simulator_display_scenario(code)
        last = manager.last_results.get(code)
        if last:
            result["machines"][code]["hi_smooth"] = last.get("hi_smooth")
            result["machines"][code]["zone"] = last.get("zone")
            result["machines"][code]["uptime_s"] = last.get("uptime_seconds")

    return result
