"""
PrediteqEngine — Moteur d'inférence à état pour FastAPI.
Une instance par machine, maintenue en mémoire par FastAPI.
Utilise un ensemble hybride (score anomalie IF + z-score RMS) pour une meilleure précision.

Physique de dégradation (d'après technicien) :
  charge ↑ → puissance ↑ → courant ↑ → I²R échauffement bobines ↑ → dégradation
  Moteur : SITI FC100L1-4, 400V (couplage Y), 1410 RPM constant, 4.85 A nominal.
  Courant I = P / (√3 × 400 × cosφ) est la SEULE variable électrique.
  La régression est pilotée par le niveau de courant dans les bobines.
"""

from collections import deque
import numpy as np
import logging
import sys, os

# Import shared constants from ML config to avoid duplication
_config_dir = os.path.join(os.path.dirname(__file__), "..")
if _config_dir not in sys.path:
    sys.path.insert(0, _config_dir)
try:
    from config import RUL_MIN_TO_DAY as _RUL_MIN_TO_DAY, HI_SMOOTH_WINDOW_S as _HI_SMOOTH_WINDOW, RUL_LOOKBACK_MIN as _HI_LOOKBACK_MIN
    RUL_MIN_TO_DAY   = _RUL_MIN_TO_DAY
    HI_SMOOTH_WINDOW = _HI_SMOOTH_WINDOW
    HI_LOOKBACK_MIN  = _HI_LOOKBACK_MIN
except ImportError:
    # Fallback if config.py is not accessible (e.g. API-only deployment)
    RUL_MIN_TO_DAY   = 9
    HI_SMOOTH_WINDOW = 120
    HI_LOOKBACK_MIN  = 60

logger = logging.getLogger(__name__)


class PrediteqEngine:
    def __init__(self, isolation_forest, rf_model, scaler_params, hi_params,
                 hybrid_params=None, threshold_fn=None):
        self.IF              = isolation_forest
        self.RF              = rf_model
        self.scaler          = scaler_params
        self.p5              = hi_params['p5']
        self.p95             = hi_params['p95']
        self.minutes_per_day = RUL_MIN_TO_DAY
        # Optional callable returning {'hi_critical': float, 'hi_surveillance': float}
        self._threshold_fn   = threshold_fn

        # Paramètres ensemble hybride (IF + RMS)
        if hybrid_params is not None:
            self.hybrid_alpha = hybrid_params['hybrid_alpha']
            self.if_norm_min  = hybrid_params['if_norm']['min']
            self.if_norm_max  = hybrid_params['if_norm']['max']
            self.rms_norm_min = hybrid_params['rms_norm']['min']
            self.rms_norm_max = hybrid_params['rms_norm']['max']
            self.rms_healthy_mean = hybrid_params['rms_healthy_mean']
            self.rms_healthy_std  = hybrid_params['rms_healthy_std']
            self._use_hybrid = True
        else:
            self._use_hybrid = False

        self.buffer_if_scores = deque(maxlen=HI_SMOOTH_WINDOW)
        self.buffer_hi_smooth = deque(maxlen=HI_LOOKBACK_MIN)
        self._second_counter  = 0
        self._last_norm_feats = None   # latest normalized sensor vector (12 floats)

    # ── Appelé chaque seconde sur chaque message MQTT ───────────────────────────
    def update(self, raw_features: dict) -> dict:
        required = list(self.scaler.keys())

        # 1. Valider la complétude
        if not all(k in raw_features for k in required):
            missing = [k for k in required if k not in raw_features]
            logger.warning(f"Incomplete payload — missing: {missing}")
            return {
                'hi_smooth': None,
                'zone':      'UNKNOWN',
                'error':     'incomplete_payload',
                'missing':   missing
            }

        # 2. Rejeter les valeurs aberrantes (> 5 sigma de la moyenne saine)
        #    Ignorer pendant le préchauffage (120 premières sec) — les caract. dérivées nécessitent le remplissage du buffer
        if self._second_counter >= 120:
            for feat in required:
                val  = raw_features[feat]
                mean = self.scaler[feat]['mean']
                std  = self.scaler[feat]['std']
                if std > 0 and abs(val - mean) > 5 * std:
                    logger.warning(f"Outlier on {feat}: {val:.3f} "
                                   f"(mean={mean:.3f}, std={std:.3f})")
                    return {
                        'hi_smooth': None,
                        'zone':      'UNKNOWN',
                        'error':     f'outlier_{feat}'
                    }

        # 3. Normaliser
        X = self._normalize(raw_features)
        # Guard against NaN propagation from bad sensor data
        if any(not np.isfinite(v) for v in X):
            logger.warning("NaN/inf in normalized features — skipping tick")
            return {
                'hi_smooth': None,
                'zone':      'UNKNOWN',
                'error':     'nan_in_features'
            }
        self._last_norm_feats = X  # stocker pour la prédiction RUL

        # 4. Score d'anomalie IF
        score_if      = self.IF.score_samples([X])[0]
        score_anomaly = -score_if   # invert: high = worse health

        # 5. Ensemble hybride : combiner anomalie IF + z-score RMS
        if self._use_hybrid and 'rms_mms' in raw_features:
            # Normaliser le score anomalie IF à [0,1]
            if_range = self.if_norm_max - self.if_norm_min + 1e-8
            if_norm  = np.clip((score_anomaly - self.if_norm_min) / if_range, 0.0, 1.0)

            # Z-score RMS normalisé à [0,1]
            rms_z     = (raw_features['rms_mms'] - self.rms_healthy_mean) / self.rms_healthy_std
            rms_range = self.rms_norm_max - self.rms_norm_min + 1e-8
            rms_norm  = np.clip((rms_z - self.rms_norm_min) / rms_range, 0.0, 1.0)

            # Combinaison pondérée
            hybrid_score = self.hybrid_alpha * if_norm + (1 - self.hybrid_alpha) * rms_norm
        else:
            hybrid_score = score_anomaly

        # 6. Mettre à jour le buffer avec le score hybride
        self.buffer_if_scores.append(hybrid_score)
        self._second_counter += 1

        # 7. Calculer le HI (fenêtre adaptative jusqu'à 120 points)
        window_size = len(self.buffer_if_scores)
        smooth      = np.mean(list(self.buffer_if_scores)[-window_size:])
        denom       = self.p95 - self.p5 if (self.p95 - self.p5) > 1e-8 else 1.0
        hi_smooth   = float(np.clip(
            1.0 - (smooth - self.p5) / denom, 0.0, 1.0
        ))

        # 8. Ajouter 1 valeur HI par minute au buffer RUL
        if self._second_counter % 60 == 0:
            self.buffer_hi_smooth.append(hi_smooth)

        zone = self._get_zone(hi_smooth)

        return {
            'hi_smooth':      round(hi_smooth, 4),
            'zone':           zone,
            'score_if':       round(float(score_if), 4),
            'buffer_if_len':  len(self.buffer_if_scores),
            'buffer_hi_len':  len(self.buffer_hi_smooth),
            'uptime_seconds': self._second_counter,
        }

    # ── Appelé par le planificateur FastAPI ; mise à jour significative toutes les 60 sec-moteur ──
    def predict_rul(self) -> dict | None:
        if len(self.buffer_hi_smooth) < HI_LOOKBACK_MIN:
            return {
                'rul_days': None,
                'ci_low':   None,
                'ci_high':  None,
                'status':   f'warming_up ({len(self.buffer_hi_smooth)}/{HI_LOOKBACK_MIN} min)'
            }

        if self._last_norm_feats is None:
            return {
                'rul_days': None, 'ci_low': None, 'ci_high': None,
                'status':   'no_sensor_data'
            }

        # Construire le vecteur à 17 caractéristiques : 12 capteurs + hi_now + hi_mean + hi_std + hi_min + hi_slope
        hi_arr   = np.array(list(self.buffer_hi_smooth))  # thread-safe snapshot
        hi_now   = hi_arr[-1]
        hi_mean  = float(np.mean(hi_arr))
        hi_std   = float(np.std(hi_arr))
        hi_min   = float(np.min(hi_arr))
        hi_slope = float(np.polyfit(np.arange(len(hi_arr)), hi_arr, 1)[0])

        row = np.concatenate([self._last_norm_feats, [hi_now, hi_mean, hi_std, hi_min, hi_slope]])
        X   = row.reshape(1, -1)
        tree_preds = np.array([t.predict(X)[0] for t in self.RF.estimators_])

        rul_min    = float(np.mean(tree_preds))
        ci_low_min = float(np.percentile(tree_preds, 10))
        ci_high_min= float(np.percentile(tree_preds, 90))

        return {
            'rul_days': round(rul_min     / self.minutes_per_day, 1),
            'ci_low':   round(ci_low_min  / self.minutes_per_day, 1),
            'ci_high':  round(ci_high_min / self.minutes_per_day, 1),
            'status':   'ok'
        }

    # ── Réinitialisation après maintenance ────────────────────────────────────────────
    def reset_after_maintenance(self):
        self.buffer_if_scores.clear()
        self.buffer_hi_smooth.clear()
        self._second_counter = 0
        self._last_norm_feats = None
        logger.info("Moteur réinitialisé après maintenance.")

    # ── Fonctions internes ───────────────────────────────────────────────────────
    def _normalize(self, raw: dict) -> list:
        return [
            (raw[feat] - self.scaler[feat]['mean']) / max(self.scaler[feat]['std'], 1e-12)
            for feat in self.scaler
        ]

    def _get_zone(self, hi) -> str:
        if hi is None:   return 'UNKNOWN'
        # Use dynamic thresholds from seuils if available, else defaults
        crit, surv = 0.3, 0.6
        if self._threshold_fn:
            try:
                t = self._threshold_fn()
                crit = t.get('hi_critical', 0.3)
                surv = t.get('hi_surveillance', 0.6)
            except Exception:
                pass
        excellent = surv + (1.0 - surv) / 2  # midpoint between surv and 1.0
        if hi >= excellent: return 'Excellent'
        if hi >= surv:      return 'Good'
        if hi >= crit:      return 'Degraded'
        return 'Critical'

    def get_status(self) -> dict:
        """Bilan de santé — appelé par l'endpoint FastAPI /status."""
        return {
            'uptime_seconds':  self._second_counter,
            'buffer_if_len':   len(self.buffer_if_scores),
            'buffer_hi_len':   len(self.buffer_hi_smooth),
            'ready_for_rul':   len(self.buffer_hi_smooth) >= HI_LOOKBACK_MIN,
            'ready_for_hi':    len(self.buffer_if_scores) > 0,
        }
