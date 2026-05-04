"""
Engine manager — one PrediteqEngine + feature buffer per machine.
Computes derived features from raw MQTT payloads (4 sensors → 12 features).
Uses constants from prediteq_ml/config.py.

Degradation chain (from technician):
  charge ↑ → puissance ↑ → courant ↑ → I²R échauffement bobines ↑ → dégradation
  Voltage (400V) and speed (1410 RPM) are constant — current is the variable.

RUL v2 — Calibration accessors (F3 of the rul-v2 plan)
──────────────────────────────────────────────────────
Three new accessors added below for the FPT + observed-rate display layer:
  - get_cycles_per_day(code)  — moyenne 7 j glissants des cycles d'ascension
  - get_power_avg_30j(code)   — moyenne 30 j de la puissance ascensionnelle
                                 (lue depuis Supabase, écrite par scheduler.py)
  - set_cycles_per_day_override(code, v) — utilisé par le simulateur en démo
                                            (la fenêtre 7 j n'a pas le temps
                                            de se remplir en mode accéléré)
Aucun champ existant n'est modifié. Aucun comportement existant n'est changé.
"""

import logging
from collections import deque
from datetime import datetime, timedelta, timezone

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

        # RUL v2 — wall-clock-timestamped snapshots of cycle counts.
        # Each entry: (datetime UTC, cumulative_cycle_count). Snapshots every
        # ~5 min (300 ingest ticks). Used by get_cycles_per_day() to derive
        # a 7-day rolling average rate. maxlen = 7d × 24h × 12 snapshots/h
        # = 2016 entries (overwrite oldest).
        self._cycles_history: dict[str, deque] = {}

        # RUL v2 — manual override for cycles/day (simulator-only path).
        # Real-time demo runs only ~2 min wall-clock, so the 7-day window
        # never fills naturally. The simulator sets this to a realistic
        # per-machine value (e.g., ASC-A1=600, ASC-B2=1100, ASC-C3=400).
        # In production with real MQTT, this dict is never written → the
        # natural wall-clock observation path takes over.
        self._cycles_per_day_override: dict[str, float] = {}

        # Machine code → Supabase row cache {id, code, nom, region,
        #   power_avg_30j, cycles_avg_7j, metrics_updated, ...}
        # Extended in v2: power_avg_30j and cycles_avg_7j are written hourly
        # by scheduler.py and read by get_power_avg_30j() / fallback path.
        self.machine_cache: dict[str, dict] = {}

        # Simulator can override RUL predictions (set by simulator replay loop).
        # NOTE (v2): kept for backwards-compat during transition. Will be
        # removed in F6 when simulator.py stops writing to it (the simulator
        # then feeds coherent sensors so the RF predicts directly).
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

    def bootstrap_history(self, code: str, raw_history: list[dict],
                          tick_offset: int = 0) -> dict | None:
        """Seed one machine from recent raw history without replaying years.

        The simulator only needs the recent finite-memory state of the runtime
        engine before the public demo window starts. This helper reconstructs
        that state from recent raw samples, then asks the engine to batch-seed
        its HI/RUL buffers using the same ML models as live ingestion.
        """
        if not raw_history:
            return None

        engine, buf = self._get_or_create(code)

        feature_history: list[dict] = []
        self._raw_history[code] = deque(maxlen=44)
        self.sensor_history[code] = deque(maxlen=360)
        self._sensor_counter[code] = tick_offset
        self._cycle_counts[code] = 0
        self._in_ascent[code] = False
        self._cycles_history[code] = deque(maxlen=2016)

        for raw_payload in raw_history:
            observed_at = raw_payload.get("observed_at")
            observed_dt = (
                datetime.fromisoformat(observed_at).astimezone(timezone.utc)
                if isinstance(observed_at, str)
                else datetime.now(timezone.utc)
            )
            features = buf.compute(
                rms_mms=float(raw_payload['rms_mms']),
                power_kw=float(raw_payload['power_kw']),
                temp_c=float(raw_payload['temp_c']),
                humidity_rh=float(raw_payload['humidity_rh']),
            )
            feature_history.append(features)

            self._raw_history[code].append(raw_payload)
            buf_list = list(self._raw_history[code])
            current_values = [
                float(r['current_a']) for r in buf_list
                if r.get('current_a') is not None
            ]
            self.last_raw[code] = {
                'rms_mms': float(np.mean([r['rms_mms'] for r in buf_list])),
                'power_kw': float(np.mean([r['power_kw'] for r in buf_list])),
                'temp_c': float(np.mean([r['temp_c'] for r in buf_list])),
                'humidity_rh': float(np.mean([r['humidity_rh'] for r in buf_list])),
                'observed_at': observed_dt.isoformat(),
                'source': raw_payload.get('source', 'runtime_ingest'),
            }
            if current_values:
                self.last_raw[code]['current_a'] = float(np.mean(current_values))
            if raw_payload.get('load_kg') is not None:
                self.last_raw[code]['load_kg'] = float(raw_payload['load_kg'])
            if raw_payload.get('vibration_raw') is not None:
                self.last_raw[code]['vibration_raw'] = float(raw_payload['vibration_raw'])
            if raw_payload.get('vibration_rms') is not None:
                self.last_raw[code]['vibration_rms'] = float(raw_payload['vibration_rms'])
            elif raw_payload.get('rms_mms') is not None:
                self.last_raw[code]['vibration_rms'] = float(raw_payload['rms_mms'])
            if raw_payload.get('status') is not None:
                self.last_raw[code]['status'] = str(raw_payload['status'])

            is_ascent = raw_payload['power_kw'] > 0.9
            was_ascent = self._in_ascent.get(code, False)
            if was_ascent and not is_ascent:
                self._cycle_counts[code] = self._cycle_counts.get(code, 0) + 1
            self._in_ascent[code] = is_ascent

            self._sensor_counter[code] += 1
            if self._sensor_counter[code] % 300 == 0:
                self._cycles_history[code].append((
                    datetime.now(timezone.utc),
                    self._cycle_counts.get(code, 0),
                ))

            if self._sensor_counter[code] % 60 == 0:
                self.sensor_history[code].append({
                    'ts': observed_dt.isoformat(),
                    'rms_mms': self.last_raw[code]['rms_mms'],
                    'power_kw': self.last_raw[code]['power_kw'],
                    'temp_c': self.last_raw[code]['temp_c'],
                    'humidity_rh': self.last_raw[code]['humidity_rh'],
                    'load_kg': self.last_raw[code].get('load_kg', 0.0),
                    'tick': self._sensor_counter[code],
                })

        result = engine.seed_from_feature_history(feature_history)
        if result.get('hi_smooth') is not None:
            result_payload = dict(result)
            result_payload['updated_at'] = self.last_raw[code].get('observed_at')
            result_payload['source'] = self.last_raw[code].get('source', 'runtime_ingest')
            self.last_results[code] = result_payload
            self.previous_zones[code] = str(result_payload.get('zone', 'UNKNOWN'))
        return result

    def ingest(self, code: str, raw_payload: dict, allow_extreme: bool = False) -> dict | None:
        """
        Process one raw MQTT message:
        1. Compute 12 derived features from raw sensors
        2. Call engine.update(features)
        3. Cache rolling-average sensor values + display-only bench-test fields
        """
        try:
            engine, buf = self._get_or_create(code)
            observed_at = raw_payload.get("observed_at")
            observed_dt = (
                datetime.fromisoformat(observed_at).astimezone(timezone.utc)
                if isinstance(observed_at, str)
                else datetime.now(timezone.utc)
            )
            features = buf.compute(
                rms_mms=float(raw_payload['rms_mms']),
                power_kw=float(raw_payload['power_kw']),
                temp_c=float(raw_payload['temp_c']),
                humidity_rh=float(raw_payload['humidity_rh']),
            )
            result = engine.update(features, allow_extreme=allow_extreme)
            if result.get('hi_smooth') is not None:
                result_payload = dict(result)
                result_payload['updated_at'] = observed_dt.isoformat()
                result_payload['source'] = raw_payload.get('source', 'runtime_ingest')
                self.last_results[code] = result_payload

            # Rolling average over 1 elevator cycle (44s) to smooth out
            # ascent/descent/pause phases
            if code not in self._raw_history:
                self._raw_history[code] = deque(maxlen=44)
            self._raw_history[code].append(raw_payload)
            buf_list = list(self._raw_history[code])
            current_values = [float(r['current_a']) for r in buf_list if r.get('current_a') is not None]
            self.last_raw[code] = {
                'rms_mms':     float(np.mean([r['rms_mms'] for r in buf_list])),
                'power_kw':    float(np.mean([r['power_kw'] for r in buf_list])),
                'temp_c':      float(np.mean([r['temp_c'] for r in buf_list])),
                'humidity_rh': float(np.mean([r['humidity_rh'] for r in buf_list])),
                'observed_at': observed_dt.isoformat(),
                'source': raw_payload.get('source', 'runtime_ingest'),
            }
            if current_values:
                self.last_raw[code]['current_a'] = float(np.mean(current_values))
            if raw_payload.get('load_kg') is not None:
                self.last_raw[code]['load_kg'] = float(raw_payload['load_kg'])

            # Optional firmware extras are kept for the ESP32 bench-test page.
            if raw_payload.get('vibration_raw') is not None:
                self.last_raw[code]['vibration_raw'] = float(raw_payload['vibration_raw'])
            if raw_payload.get('vibration_rms') is not None:
                self.last_raw[code]['vibration_rms'] = float(raw_payload['vibration_rms'])
            elif raw_payload.get('rms_mms') is not None:
                self.last_raw[code]['vibration_rms'] = float(raw_payload['rms_mms'])
            if raw_payload.get('status') is not None:
                self.last_raw[code]['status'] = str(raw_payload['status'])

            # Count elevator cycles (ascent = power_kw > 0.9 kW)
            is_ascent = raw_payload['power_kw'] > 0.9
            was_ascent = self._in_ascent.get(code, False)
            if was_ascent and not is_ascent:  # ascent just ended = 1 cycle
                self._cycle_counts[code] = self._cycle_counts.get(code, 0) + 1
            self._in_ascent[code] = is_ascent

            # RUL v2 — snapshot wall-clock timestamp + cumulative cycle count
            # every 300 ingests (≈5 min at 1 Hz). Used to derive cycles/day.
            # In simulator demo (speed=60) this fires every 5 sec real-time,
            # so we may collect ~24 snapshots in a 2-min run — not enough for
            # a real 7-day average, but the simulator sets _cycles_per_day_override
            # which takes priority. In production with real MQTT (1 Hz real),
            # snapshots accumulate naturally over real days.
            if self._sensor_counter.get(code, 0) % 300 == 0:
                if code not in self._cycles_history:
                    self._cycles_history[code] = deque(maxlen=2016)
                self._cycles_history[code].append((
                    datetime.now(timezone.utc),
                    self._cycle_counts.get(code, 0),
                ))

            # Append to sensor history every 60 ticks (≈1 point/min at 1Hz)
            self._sensor_counter[code] = self._sensor_counter.get(code, 0) + 1
            if self._sensor_counter[code] % 60 == 0:
                if code not in self.sensor_history:
                    self.sensor_history[code] = deque(maxlen=360)
                self.sensor_history[code].append({
                    'ts':          observed_dt.isoformat(),
                    'rms_mms':     self.last_raw[code]['rms_mms'],
                    'power_kw':    self.last_raw[code]['power_kw'],
                    'temp_c':      self.last_raw[code]['temp_c'],
                    'humidity_rh': self.last_raw[code]['humidity_rh'],
                    'load_kg':     self.last_raw[code].get('load_kg', 0.0),
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
        # Simulator override takes priority (physics-based RUL from trajectory).
        # NOTE (v2): override path will be removed in F6 once simulator.py
        # feeds coherent sensors so the RF can predict directly.
        if code in self.rul_overrides:
            return self.rul_overrides[code]
        if code not in self.engines:
            return None
        try:
            return self.engines[code].predict_rul()
        except Exception as e:
            logger.error("RUL prediction error for %s: %s", code, e)
            return None

    # ─── RUL v2 — Calibration accessors ──────────────────────────────────────
    # The methods below feed the FPT + observed-rate display layer
    # (prediteq_ml/diagnostics/rul_calibration.py). They are read-only with
    # respect to the RF model — no impact on predictions.

    def get_cycles_per_day(self, code: str) -> float | None:
        """Returns observed elevator cycles/day for the given machine.

        Priority order:
          1. Simulator override (set via set_cycles_per_day_override) — used
             only during demo replay since the wall-clock 7-day window cannot
             accumulate in a 2-min run.
          2. Wall-clock 7-day rolling average from _cycles_history snapshots.
             Computed as (count_now - count_oldest_in_window) / days_elapsed.
          3. None — when neither is available (machine just connected, < 1
             snapshot collected). The downstream rul_calibration layer will
             fall back to DEFAULT_FACTOR=9.

        Returns None if cycles cannot be reliably estimated.
        """
        # Path 1: simulator override
        if code in self._cycles_per_day_override:
            return self._cycles_per_day_override[code]

        # Path 2: wall-clock observation
        history = self._cycles_history.get(code)
        if not history or len(history) < 2:
            return None

        ts_old, count_old = history[0]
        ts_new, count_new = history[-1]
        elapsed = (ts_new - ts_old).total_seconds()
        if elapsed < 60.0:  # less than a minute of history → unreliable
            return None
        delta_cycles = count_new - count_old
        # Project to per-day rate (86 400 sec/day)
        return float(delta_cycles) * 86400.0 / elapsed

    def get_power_avg_30j(self, code: str) -> float | None:
        """Reads 30-day average ascent power from machine_cache (kW).

        Written hourly by scheduler.py via service_role into machines table,
        then re-loaded into machine_cache. None if the machine has no 30-day
        history yet (e.g., freshly registered) — rul_calibration falls back
        to nominal P=1.51 kW in that case.
        """
        m = self.machine_cache.get(code)
        if not m:
            return None
        v = m.get('power_avg_30j')
        return float(v) if v is not None else None

    def set_cycles_per_day_override(self, code: str, value: float | None) -> None:
        """Manual override of cycles/day — simulator-only path.

        Called by simulator.py at the start of each replay session, with a
        realistic per-machine value (e.g., ASC-A1=600, ASC-B2=1100, ASC-C3=400).
        Pass value=None or call clear_cycles_per_day_override() to remove.
        Production MQTT data must NOT call this — it would mask real observation.
        """
        if value is None:
            self._cycles_per_day_override.pop(code, None)
        else:
            self._cycles_per_day_override[code] = float(value)

    def clear_cycles_per_day_override(self, code: str) -> None:
        """Removes the simulator override for a machine."""
        self._cycles_per_day_override.pop(code, None)

    def get_cycle_count(self, code: str) -> int:
        """Cumulative ascent cycle count since engine creation (not persisted)."""
        return int(self._cycle_counts.get(code, 0))

    def get_recent_ascent_power_kw(self, code: str) -> float | None:
        """Returns the time-mean power during the LAST COMPLETED ascent phase.

        This is the physically meaningful load on the bearings (per ISO 281 §7
        for ball bearings). Not the cycle-mean (which dilutes ascent power
        with descent + pause periods).

        Returns None if no ascent has completed yet (machine just started, or
        in pause). The scheduler then keeps power_avg_30j unchanged.

        Reads MachineFeatureBuffer._e_cycle_kwh (set on ascent completion).
        Conversion : energy (kWh) over T_ASCENT_S seconds → average power.
            P_ascent (kW) = e_cycle_kwh × 3600 / T_ASCENT_S
        For nominal SITI motor: 0.00503 kWh × 300 = 1.51 kW ✓
        """
        buf = self.buffers.get(code)
        if buf is None:
            return None
        e = getattr(buf, "_e_cycle_kwh", 0.0)
        if e is None or e <= 0:
            return None
        # T_ASCENT_S = 12 s → factor 300 (= 3600/12)
        return float(e) * 3600.0 / float(T_ASCENT_S)

    # ──────────────────────────────────────────────────────────────────────────

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
            # RUL v2 — clear cycle history + simulator override on maintenance
            self._cycles_history.pop(code, None)
            self._cycles_per_day_override.pop(code, None)
            logger.info("Engine reset for %s", code)

    def get_status(self, code: str) -> dict | None:
        if code not in self.engines:
            return None
        return self.engines[code].get_status()

    @property
    def active_machines(self) -> list[str]:
        return list(self.engines.keys())
