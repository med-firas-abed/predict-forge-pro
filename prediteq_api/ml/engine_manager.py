"""
Engine manager — one PrediteqEngine + feature buffer per machine.
Computes derived features from raw MQTT payloads (4 sensors → 12 features).
Uses constants from prediteq_ml/config.py.

Degradation chain (from technician):
  charge ↑ → puissance ↑ → courant ↑ → I²R échauffement bobines ↑ → dégradation
  Voltage (400V) and speed (1410 RPM) are constant — current is the variable.
"""

import logging
from collections import deque

import numpy as np

# Import ML pipeline constants (available after loader._ensure_ml_path())
try:
    from config import (
        T_ASCENT_S, P_ASCENT_NOM_KW,
        HI_SMOOTH_WINDOW_S, RUL_LOOKBACK_MIN,
    )
except ImportError:
    # Fallback if prediteq_ml not on path yet
    T_ASCENT_S = 12
    P_ASCENT_NOM_KW = 1.51
    HI_SMOOTH_WINDOW_S = 120
    RUL_LOOKBACK_MIN = 60

logger = logging.getLogger(__name__)

# ─── Module-level singleton ───────────────────────────────────────────────────

_manager: "EngineManager | None" = None


def init_manager(if_model, rf_model, scaler_params, hi_params, hybrid_params, engine_cls):
    global _manager
    _manager = EngineManager(if_model, rf_model, scaler_params, hi_params,
                             hybrid_params, engine_cls)
    logger.info("EngineManager initialized")
    return _manager


def get_manager() -> "EngineManager":
    if _manager is None:
        raise RuntimeError("EngineManager not initialized — call init_manager() first")
    return _manager


# ─── Feature buffer: raw MQTT → 12 derived features ──────────────────────────

class MachineFeatureBuffer:
    """Rolling buffers to compute the 12 features engine.update() expects."""

    ASCENT_POWER_KW = P_ASCENT_NOM_KW * 0.62  # ~0.90 kW threshold for ascent
    T_ASCENT_NOMINAL = float(T_ASCENT_S)        # 12s from ML config

    def __init__(self):
        self._rms = deque(maxlen=60)
        self._power = deque(maxlen=60)
        self._power_sq = deque(maxlen=60)
        self._temp = deque(maxlen=300)
        self._temp_means = deque(maxlen=120)
        self._humidity = deque(maxlen=60)
        self._tp_pairs = deque(maxlen=3600)

        self._prev_rms: float | None = None
        self._prev_power: float | None = None

        # Ascent tracking
        self._in_ascent = False
        self._ascent_powers: list[float] = []
        self._e_cycle_kwh = 0.0
        self._duration_ratio = 0.0

    def compute(self, rms_mms: float, power_kw: float,
                temp_c: float, humidity_rh: float) -> dict:
        """Transform 4 raw sensors into the 12 features the engine expects."""

        # ── Update buffers ────────────────────────────────────────────────────
        self._rms.append(rms_mms)
        self._power.append(power_kw)
        self._power_sq.append(power_kw ** 2)
        self._temp.append(temp_c)
        self._humidity.append(humidity_rh)
        self._tp_pairs.append((temp_c, power_kw))

        # ── drms_dt: first difference of RMS ──────────────────────────────────
        drms_dt = (rms_mms - self._prev_rms) if self._prev_rms is not None else 0.0
        self._prev_rms = rms_mms

        # ── rms_variability: std of last 60 RMS values ────────────────────────
        rms_var = float(np.std(list(self._rms))) if len(self._rms) >= 2 else 0.0

        # ── p_mean_kw: mean of last 60 power values ──────────────────────────
        p_mean = float(np.mean(list(self._power)))

        # ── p_rms_kw: RMS of last 60 power values ────────────────────────────
        p_rms = float(np.sqrt(np.mean(list(self._power_sq))))

        # ── dp_dt: first difference of power ──────────────────────────────────
        dp_dt = (power_kw - self._prev_power) if self._prev_power is not None else 0.0
        self._prev_power = power_kw

        # ── Ascent detection → e_cycle_kwh & duration_ratio ───────────────────
        if power_kw >= self.ASCENT_POWER_KW:
            if not self._in_ascent:
                self._in_ascent = True
                self._ascent_powers = []
            self._ascent_powers.append(power_kw)
        else:
            if self._in_ascent:
                # Ascent just ended — compute energy and duration
                n = len(self._ascent_powers)
                if n >= 2:
                    self._e_cycle_kwh = float(np.trapezoid(self._ascent_powers, dx=1.0)) / 3600.0
                    self._duration_ratio = n / self.T_ASCENT_NOMINAL
                self._in_ascent = False
                self._ascent_powers = []

        # ── t_mean_c: mean of last 300 temp values (5 min) ───────────────────
        t_mean = float(np.mean(list(self._temp)))
        self._temp_means.append(t_mean)

        # ── dt_dt: temperature change rate per minute ─────────────────────────
        if len(self._temp_means) > 60:
            dt_dt = (self._temp_means[-1] - self._temp_means[-61]) / 60.0
        else:
            dt_dt = 0.0

        # ── hr_std: std of last 60 humidity values ────────────────────────────
        hr_std = float(np.std(list(self._humidity))) if len(self._humidity) >= 2 else 0.0

        # ── corr_t_p: Pearson r of (temp, power) over last 3600 pairs ────────
        corr = 0.0
        if len(self._tp_pairs) >= 60:
            arr = np.array(list(self._tp_pairs))
            t_std = float(np.std(arr[:, 0]))
            p_std = float(np.std(arr[:, 1]))
            if t_std > 1e-8 and p_std > 1e-8:
                with np.errstate(invalid='ignore'):
                    c = float(np.corrcoef(arr[:, 0], arr[:, 1])[0, 1])
                corr = 0.0 if np.isnan(c) else c

        return {
            'rms_mms':         rms_mms,
            'drms_dt':         drms_dt,
            'rms_variability': rms_var,
            'p_mean_kw':       p_mean,
            'p_rms_kw':        p_rms,
            'dp_dt':           dp_dt,
            'e_cycle_kwh':     self._e_cycle_kwh,
            'duration_ratio':  self._duration_ratio,
            't_mean_c':        t_mean,
            'dt_dt':           dt_dt,
            'hr_std':          hr_std,
            'corr_t_p':        corr,
        }


# ─── Engine Manager ──────────────────────────────────────────────────────────

class EngineManager:
    """Manages one PrediteqEngine + FeatureBuffer per machine code."""

    def __init__(self, if_model, rf_model, scaler_params, hi_params,
                 hybrid_params, engine_cls):
        self._if = if_model
        self._rf = rf_model
        self._scaler = scaler_params
        self._hi = hi_params
        self._hybrid = hybrid_params
        self._engine_cls = engine_cls

        self.engines: dict[str, object] = {}
        self.buffers: dict[str, MachineFeatureBuffer] = {}
        self.last_results: dict[str, dict] = {}
        self.last_raw: dict[str, dict] = {}  # raw sensor values per machine
        self.previous_zones: dict[str, str] = {}

        # Rolling sensor averages (1 elevator cycle = 44 seconds)
        self._raw_history: dict[str, deque] = {}
        # Sensor time-series for dashboard charts (last 360 points ≈ 6h at 1/min)
        self.sensor_history: dict[str, deque] = {}
        self._sensor_counter: dict[str, int] = {}
        # Cycle counter: counts ascent→non-ascent transitions
        self._cycle_counts: dict[str, int] = {}
        self._in_ascent: dict[str, bool] = {}

        # Machine code → Supabase row cache {id, code, nom, region, ...}
        self.machine_cache: dict[str, dict] = {}

        # Simulator can override RUL predictions (set by simulator replay loop)
        self.rul_overrides: dict[str, dict] = {}

    def register_machines(self, machines: list[dict]):
        """Cache machine rows from Supabase (called at startup)."""
        for m in machines:
            self.machine_cache[m['code']] = m
        logger.info("Registered %d machines: %s",
                     len(machines), list(self.machine_cache.keys()))

    def get_uuid(self, code: str) -> str | None:
        m = self.machine_cache.get(code)
        return m['id'] if m else None

    def get_machine_info(self, code: str) -> dict | None:
        return self.machine_cache.get(code)

    def _get_or_create(self, code: str):
        if code not in self.engines:
            # Pass seuils threshold getter so engine zones use dynamic thresholds
            threshold_fn = None
            try:
                from routers.seuils import get_thresholds
                threshold_fn = get_thresholds
            except ImportError:
                pass
            self.engines[code] = self._engine_cls(
                self._if, self._rf, self._scaler, self._hi,
                hybrid_params=self._hybrid,
                threshold_fn=threshold_fn,
            )
            self.buffers[code] = MachineFeatureBuffer()
            logger.info("Created engine for machine %s", code)
        return self.engines[code], self.buffers[code]

    def ingest(self, code: str, raw_payload: dict) -> dict | None:
        """
        Process one raw MQTT message:
        1. Compute 12 derived features from raw sensors
        2. Call engine.update(features)
        3. Cache rolling-average sensor values + history for charts
        """
        try:
            engine, buf = self._get_or_create(code)
            features = buf.compute(
                rms_mms=float(raw_payload['rms_mms']),
                power_kw=float(raw_payload['power_kw']),
                temp_c=float(raw_payload['temp_c']),
                humidity_rh=float(raw_payload['humidity_rh']),
            )
            result = engine.update(features)
            if result.get('hi_smooth') is not None:
                self.last_results[code] = result

            # Rolling average over 1 elevator cycle (44s) to smooth out
            # ascent/descent/pause phases
            if code not in self._raw_history:
                self._raw_history[code] = deque(maxlen=44)
            self._raw_history[code].append(raw_payload)
            buf_list = list(self._raw_history[code])
            self.last_raw[code] = {
                'rms_mms':     float(np.mean([r['rms_mms'] for r in buf_list])),
                'power_kw':    float(np.mean([r['power_kw'] for r in buf_list])),
                'temp_c':      float(np.mean([r['temp_c'] for r in buf_list])),
                'humidity_rh': float(np.mean([r['humidity_rh'] for r in buf_list])),
            }

            # Count elevator cycles (ascent = power_kw > 0.9 kW)
            is_ascent = raw_payload['power_kw'] > 0.9
            was_ascent = self._in_ascent.get(code, False)
            if was_ascent and not is_ascent:  # ascent just ended = 1 cycle
                self._cycle_counts[code] = self._cycle_counts.get(code, 0) + 1
            self._in_ascent[code] = is_ascent

            # Append to sensor history every 60 ticks (≈1 point/min at 1Hz)
            self._sensor_counter[code] = self._sensor_counter.get(code, 0) + 1
            if self._sensor_counter[code] % 60 == 0:
                if code not in self.sensor_history:
                    self.sensor_history[code] = deque(maxlen=360)
                self.sensor_history[code].append({
                    'rms_mms':     self.last_raw[code]['rms_mms'],
                    'power_kw':    self.last_raw[code]['power_kw'],
                    'temp_c':      self.last_raw[code]['temp_c'],
                    'humidity_rh': self.last_raw[code]['humidity_rh'],
                    'tick':        self._sensor_counter[code],
                })

            return result
        except KeyError as e:
            logger.warning("Missing key in payload for %s: %s", code, e)
            return None
        except Exception as e:
            logger.error("Ingest error for %s: %s", code, e)
            return None

    def predict_rul(self, code: str) -> dict | None:
        # Simulator override takes priority (physics-based RUL from trajectory)
        if code in self.rul_overrides:
            return self.rul_overrides[code]
        if code not in self.engines:
            return None
        try:
            return self.engines[code].predict_rul()
        except Exception as e:
            logger.error("RUL prediction error for %s: %s", code, e)
            return None

    def reset(self, code: str):
        if code in self.engines:
            self.engines[code].reset_after_maintenance()
            self.buffers[code] = MachineFeatureBuffer()
            self.last_results.pop(code, None)
            self.last_raw.pop(code, None)
            self.previous_zones.pop(code, None)
            self._raw_history.pop(code, None)
            self.sensor_history.pop(code, None)
            self._sensor_counter.pop(code, None)
            self._cycle_counts.pop(code, None)
            self._in_ascent.pop(code, None)
            logger.info("Engine reset for %s", code)

    def get_status(self, code: str) -> dict | None:
        if code not in self.engines:
            return None
        return self.engines[code].get_status()

    @property
    def active_machines(self) -> list[str]:
        return list(self.engines.keys())
