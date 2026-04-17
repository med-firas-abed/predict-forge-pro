"""
Simulator — generates fresh trajectories on-the-fly for all 3 machines.
Cumulative degradation: each run picks up from the last known HI (stored in
Supabase). Every run uses a fresh seed → different noise/profile/load.

ASC-A1 (Ben Arous): new machine, starts at HI ≈ 0.98
ASC-B2 (Sfax): mid-life, starts at HI ≈ 0.48 (surveillance)
ASC-C3 (Sousse): end-of-life, starts at HI ≈ 0.18 (critique)

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

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from core.config import settings
from core.auth import CurrentUser, require_admin, require_auth
from core.supabase_client import get_supabase
from ml.engine_manager import get_manager

# Add prediteq_ml to path so we can import config + simulation functions
_ml_dir = settings.ML_DIR
if _ml_dir not in sys.path:
    sys.path.insert(0, _ml_dir)
_steps_dir = os.path.join(_ml_dir, "steps")
if _steps_dir not in sys.path:
    sys.path.insert(0, _steps_dir)

from config import (
    LOAD_CASES_KG, TRAJECTORY_LEN_MIN,
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
_state: dict = {
    "running": False,
    "speed": 60,
    "tick": 0,
    "machines": {},
}

# All 3 machines participate in the simulation
MACHINE_CODES = ["ASC-A1", "ASC-B2", "ASC-C3"]

PROFILE_NAMES = ["A_linear", "B_exponential", "C_stepwise", "D_noisy_linear"]

# ─── Cumulative degradation ──────────────────────────────────────────────────
# Default starting HI — used on first-ever run or after reset.
# A1 is brand new (opérationnel), B2 is mid-life (surveillance), C3 is worn (critique).
INITIAL_HI = {
    "ASC-A1": 0.92,
    "ASC-B2": 0.68,
    "ASC-C3": 0.22,
}

# Each machine must stay inside its designated zone during simulation.
# The HI is clamped to these bounds so the demo always shows 3 distinct zones.
HI_ZONE_BOUNDS = {
    "ASC-A1": (0.82, 0.98),   # opérationnel  (≥ 0.80 → vert)
    "ASC-B2": (0.62, 0.78),   # surveillance   (0.60–0.80 → jaune)
    "ASC-C3": (0.10, 0.28),   # critique       (< 0.30 → rouge)
}

# Fraction of a full lifecycle per simulator session.
# ~15% → a full trajectory has ~48000 ticks → ~7200 ticks per session.
# At speed=60 that's ~2 min real time. ~7 runs to cover a full lifecycle.
SESSION_FRAC = 0.15


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
    ratio = t_arr / t_fail
    if profile == "A_linear":
        return np.clip(1 - 0.7 * ratio, 0, 1)
    elif profile == "B_exponential":
        return np.clip(1 - 0.7 * ratio**2, 0, 1)
    elif profile == "C_stepwise":
        step = np.floor(5 * ratio) / 5
        return np.clip(1 - 0.85 * step, 0, 1)
    elif profile == "D_noisy_linear":
        base = np.clip(1 - 0.7 * ratio, 0, 1)
        noise = rng.normal(0, 0.08, size=len(t_arr))
        return np.clip(base + noise, 0, 1)
    return np.clip(1 - 0.7 * ratio, 0, 1)


def _hi_to_rms(hi: np.ndarray, t_seconds: np.ndarray,
               rng: np.random.Generator) -> np.ndarray:
    n = len(hi)
    rms = np.zeros(n)
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
    rms *= (1 + rng.normal(0, NOISE_VTV122, size=n))
    return np.clip(rms, 0.1, 10.0)


def _compute_power_current(hi: np.ndarray, t_seconds: np.ndarray,
                           load_kg: float,
                           rng: np.random.Generator):
    n = len(t_seconds)
    phase_t = t_seconds % T_CYCLE_S
    power = np.zeros(n)
    phase = np.full(n, "pause", dtype=object)
    load_ratio = load_kg / LOAD_MAX_KG

    for i in range(n):
        pt = phase_t[i]
        h = hi[i]
        if pt < T_ASCENT_S:
            phase[i] = "ascent"
            p_load = P_ASCENT_EMPTY_KW + P_ASCENT_LOAD_RANGE * load_ratio
            p_deg = P_ASCENT_DEG_RANGE * (1 - h)
            power[i] = np.clip(p_load + p_deg, P_ASCENT_EMPTY_KW, P_ASCENT_DEG_KW)
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
                           rng: np.random.Generator):
    t_slow = np.arange(0, t_seconds[-1] + 1, 10)
    n_slow = len(t_slow)
    amb_temp = TEMP_MIN_C + (TEMP_MAX_C - TEMP_MIN_C) * (
        0.5 + 0.5 * np.sin(2 * np.pi * t_slow / (t_seconds[-1] + 1))
    )
    idx_slow = np.clip(t_slow.astype(int), 0, len(power) - 1)
    motor_heat = 3.5 * (power[idx_slow] / P_ASCENT_DEG_KW)
    temp_slow = amb_temp + motor_heat + rng.normal(0, NOISE_TEMP_C, size=n_slow)
    humid_slow = HUMID_MIN_RH + (HUMID_MAX_RH - HUMID_MIN_RH) * (
        0.5 + 0.5 * np.cos(2 * np.pi * t_slow / (t_seconds[-1] + 1))
    ) + rng.normal(0, NOISE_HUMID_RH, size=n_slow)
    temp_1hz = np.interp(t_seconds, t_slow, temp_slow)
    humid_1hz = np.interp(t_seconds, t_slow, humid_slow)
    return temp_1hz, np.clip(humid_1hz, HUMID_MIN_RH, HUMID_MAX_RH)


def _generate_trajectory(profile: str, load_kg: float,
                         rng: np.random.Generator) -> pd.DataFrame:
    """Generate a single trajectory using the same physics as step1_simulate."""
    t_fail_base = TRAJECTORY_LEN_MIN * 60  # seconds
    i_ratio_sq = (load_kg / LOAD_MAX_KG) ** 2 if LOAD_MAX_KG > 0 else 1.0
    deg_rate = 0.3 + 0.7 * i_ratio_sq
    t_fail_adj = t_fail_base * rng.uniform(0.75, 0.95) / max(deg_rate, 0.3)
    t_max = t_fail_base
    t_fail_adj = min(t_fail_adj, t_max * 0.95)
    t_end = int(min(t_fail_adj * 1.10, t_max))
    t_seconds = np.arange(0, t_end, 1, dtype=float)

    hi = _compute_hi(profile, t_seconds, t_fail_adj, rng)
    rms_mms = _hi_to_rms(hi, t_seconds, rng)
    power_kw, current_a, phase = _compute_power_current(hi, t_seconds, load_kg, rng)
    temp_c, humid_rh = _compute_temp_humidity(t_seconds, power_kw, rng)

    return pd.DataFrame({
        "t_seconds": t_seconds,
        "rms_mms": rms_mms,
        "power_kw": power_kw,
        "current_a": current_a,
        "temp_c": temp_c,
        "humidity_rh": humid_rh,
        "simulated_hi": hi,
        "phase": phase,
    })


def _generate_all_trajectories(reset: bool = False) -> dict[str, pd.DataFrame]:
    """Generate fresh trajectories for all 3 machines with cumulative degradation.

    Reads the last known HI from Supabase, generates a full trajectory,
    finds the point matching that HI, and plays one session (SESSION_FRAC)
    forward from there.  Each run advances the machine's degradation.

    reset=True → ignore Supabase, start from INITIAL_HI.
    """
    seed = int(time.time() * 1000) % (2**31)
    rng = np.random.default_rng(seed)
    logger.info("Simulator: generating trajectories (seed=%d, reset=%s)", seed, reset)

    starting_hi = _get_starting_hi(reset)
    # ASC-A1 always uses B_exponential; other 2 get random profiles
    other_profiles = list(rng.choice(PROFILE_NAMES, size=2, replace=False))
    machine_profiles = {"ASC-A1": "B_exponential",
                        "ASC-B2": other_profiles[0],
                        "ASC-C3": other_profiles[1]}
    slices: dict[str, pd.DataFrame] = {}

    for i, code in enumerate(MACHINE_CODES):
        profile = machine_profiles[code]
        load = int(rng.choice(LOAD_CASES_KG))
        full_traj = _generate_trajectory(profile, load, rng)

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

        # Clamp simulated_hi so each machine stays in its designated zone
        lo, hi_bound = HI_ZONE_BOUNDS.get(code, (0.0, 1.0))
        slc["simulated_hi"] = slc["simulated_hi"].clip(lower=lo, upper=hi_bound)

        slices[code] = slc
        logger.info("  %s: %s, %d kg, idx %d→%d (%d pts), HI %.3f→%.3f (target: %.3f)",
                    code, profile, load, start_idx, end_idx, len(slices[code]),
                    slices[code]["simulated_hi"].iloc[0],
                    slices[code]["simulated_hi"].iloc[-1],
                    target_hi)

    return slices


# ─── Replay loop ──────────────────────────────────────────────────────────────

async def _replay_loop(speed: int, reset: bool = False):
    """Background loop: feeds one row per machine every (1/speed) seconds."""
    global _state
    try:
        slices = _generate_all_trajectories(reset)
        logger.info("Simulator: trajectories ready for %d machines", len(slices))
        manager = get_manager()

        max_len = max(len(s) for s in slices.values())
        _state["machines"] = {code: {"total": len(s), "current": 0,
                                     "profile": None, "load_kg": None}
                              for code, s in slices.items()}

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
                }
                manager.ingest(code, raw)

                # Override engine HI with the physics-based simulated_hi.
                # The engine scores sensor data independently and may disagree
                # with the simulation's ground truth. For the demo we use the
                # controlled simulated_hi so each machine stays in its zone.
                sim_hi = float(row["simulated_hi"])
                if code in manager.last_results and manager.last_results[code].get('hi_smooth') is not None:
                    manager.last_results[code]['hi_smooth'] = sim_hi
                    if sim_hi >= 0.8:
                        manager.last_results[code]['zone'] = 'Excellent'
                    elif sim_hi >= 0.6:
                        manager.last_results[code]['zone'] = 'Good'
                    elif sim_hi >= 0.3:
                        manager.last_results[code]['zone'] = 'Degraded'
                    else:
                        manager.last_results[code]['zone'] = 'Critical'

                # Also inject sim_hi into the engine's internal HI buffer
                # so that predict_rul() uses the correct HI trajectory
                # (hi_now, hi_mean, hi_std, hi_min, hi_slope).
                if code in manager.engines:
                    engine = manager.engines[code]
                    # Feed one HI value per simulated minute (every 60 ticks)
                    if tick % 60 == 0:
                        engine.buffer_hi_smooth.append(sim_hi)

                _state["machines"][code]["current"] = tick
                _state["machines"][code]["simulated_hi"] = sim_hi

            _state["tick"] = tick

            if delay > 0.001:
                await asyncio.sleep(delay)
            elif tick % 100 == 0:
                await asyncio.sleep(0)

            if tick > 0 and tick % 5000 == 0:
                logger.info("Simulator: tick %d/%d", tick, max_len)

        _state["running"] = False
        logger.info("Simulator replay complete — %d ticks", tick + 1)

    except Exception as e:
        import traceback
        logger.error("Simulator error: %s\n%s", e, traceback.format_exc())
        _state["running"] = False


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_simulator(speed: int = 60, reset: bool = False,
                          admin: CurrentUser = Depends(require_admin)):
    """
    Start simulator with cumulative degradation.
    speed = ticks per real second (60 = 1 minute of data per second).
    reset = true to reset all machines to initial HI (fresh start).

    Each run reads the last HI from Supabase, generates a fresh trajectory
    starting from that HI level, and advances ~15% of a full lifecycle.
    """
    global _task, _state

    if _state["running"]:
        raise HTTPException(409, "Simulator already running")

    if speed < 1 or speed > 1000:
        raise HTTPException(400, "Speed must be between 1 and 1000")

    # Cancel any lingering task from a previous run to prevent two loops
    if _task is not None and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass

    # Reset engines for all machines
    manager = get_manager()
    for code in MACHINE_CODES:
        manager.reset(code)

    # If resetting, write INITIAL_HI to Supabase so next reads are consistent
    if reset:
        try:
            sb = get_supabase()
            for code, hi in INITIAL_HI.items():
                uuid = manager.get_uuid(code)
                if uuid:
                    statut = 'operational' if hi >= 0.8 else ('degraded' if hi >= 0.3 else 'critical')
                    sb.table('machines').update({
                        'hi_courant': round(hi, 4),
                        'statut': statut,
                    }).eq('id', uuid).execute()
            logger.info("Simulator: reset HI values written to Supabase")
        except Exception as e:
            logger.warning("Could not reset Supabase HI: %s", e)

    _state = {"running": True, "speed": speed, "tick": 0, "machines": {}}
    _task = asyncio.create_task(_replay_loop(speed, reset))

    def _on_done(t: asyncio.Task):
        exc = t.exception() if not t.cancelled() else None
        if exc:
            logger.error("Simulator task crashed: %s", exc)
    _task.add_done_callback(_on_done)

    return {
        "status": "started",
        "speed": speed,
        "reset": reset,
        "machines": MACHINE_CODES,
        "message": f"{'Reset + ' if reset else ''}Cumulative run at {speed}x speed",
    }


@router.post("/stop")
async def stop_simulator(admin: CurrentUser = Depends(require_admin)):
    """Stop the running simulator."""
    global _task, _state
    if not _state["running"]:
        raise HTTPException(409, "Simulator not running")

    _state["running"] = False
    if _task is not None and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    return {"status": "stopped", "tick": _state["tick"]}


@router.get("/status")
async def simulator_status(user: CurrentUser = Depends(require_auth)):
    """Get current simulator state."""
    manager = get_manager()
    result = dict(_state)

    for code in MACHINE_CODES:
        last = manager.last_results.get(code)
        if last:
            result["machines"].setdefault(code, {})
            result["machines"][code]["hi_smooth"] = last.get("hi_smooth")
            result["machines"][code]["zone"] = last.get("zone")
            result["machines"][code]["uptime_s"] = last.get("uptime_seconds")

    return result
