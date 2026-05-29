from __future__ import annotations

import unicodedata
from typing import Any

from core.demo_context import get_surfaceable_demo_scenario

DEFAULT_THRESHOLDS = {
    "hi_critical": 0.30,
    "hi_surveillance": 0.60,
    "rul_critical_days": 7.0,
    "rul_surveillance_days": 30.0,
}


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _normalize_text(value: Any) -> str:
    text = " ".join(str(value or "").strip().lower().split())
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii")


def _criticality_label(value: float) -> str:
    if value >= 0.70:
        return "elevee"
    if value >= 0.52:
        return "moyenne"
    return "standard"


def _scenario_label(value: float) -> str:
    if value >= 0.75:
        return "severe"
    if value >= 0.50:
        return "soutenue"
    if value >= 0.25:
        return "moderee"
    return "calme"


def _telemetry_label(value: float) -> str:
    if value >= 78:
        return "exploitable"
    if value >= 62:
        return "correcte"
    if value >= 46:
        return "prudente"
    return "fragile"


def load_planning_thresholds() -> dict[str, float]:
    try:
        from routers.seuils import get_thresholds

        raw = get_thresholds() or {}
    except Exception:
        raw = {}

    hi_critical = _clamp(_safe_float(raw.get("hi_critical")) or DEFAULT_THRESHOLDS["hi_critical"], 0.05, 0.95)
    hi_surveillance = _clamp(
        _safe_float(raw.get("hi_surveillance")) or DEFAULT_THRESHOLDS["hi_surveillance"],
        hi_critical + 0.05,
        0.98,
    )
    rul_critical_days = max(_safe_float(raw.get("rul_critical_days")) or DEFAULT_THRESHOLDS["rul_critical_days"], 1.0)
    rul_surveillance_days = max(
        _safe_float(raw.get("rul_surveillance_days")) or DEFAULT_THRESHOLDS["rul_surveillance_days"],
        rul_critical_days + 1.0,
    )
    hi_priority = round((hi_critical + hi_surveillance) / 2, 3)
    rul_priority_days = round(
        min(
            max(rul_critical_days * 1.8, rul_critical_days + 4.0),
            max(rul_critical_days + 1.0, rul_surveillance_days * 0.6),
        ),
        1,
    )

    return {
        "hi_critical": round(hi_critical, 3),
        "hi_surveillance": round(hi_surveillance, 3),
        "hi_priority": hi_priority,
        "rul_critical_days": round(rul_critical_days, 1),
        "rul_priority_days": rul_priority_days,
        "rul_surveillance_days": round(rul_surveillance_days, 1),
    }


def resolve_demo_scenario(machine: dict[str, Any]) -> dict[str, Any] | None:
    existing = machine.get("demo_scenario")
    if isinstance(existing, dict):
        return dict(existing)

    code = str(machine.get("code") or machine.get("id") or "").strip()
    scenario = get_surfaceable_demo_scenario(code)
    return dict(scenario) if isinstance(scenario, dict) else None


def resolve_machine_policy(
    machine: dict[str, Any],
    *,
    scenario: dict[str, Any] | None = None,
) -> dict[str, Any]:
    model = str(machine.get("modele") or machine.get("model") or "")
    name = str(machine.get("nom") or machine.get("name") or "")
    location = str(machine.get("emplacement") or machine.get("loc") or "")
    text = _normalize_text(f"{model} {name} {location}")
    floors = _safe_int(machine.get("etages") if machine.get("etages") is not None else machine.get("floors")) or 0

    category = "generic_machine"
    label = "Machine instrumentee"
    criticality = 0.38
    cost_bias = 1.00
    lead_time_bias_days = 0
    service_mode = "condition_based"

    if floors > 0 or any(token in text for token in ("ascenseur", "elevator", "lift", "siti")):
        category = "elevator"
        label = "Ascenseur instrumente"
        criticality = 0.55
        cost_bias = 1.05
        service_mode = "safety_first"
        if floors >= 16:
            category = "elevator_highrise"
            label = "Ascenseur grande course"
            criticality = 0.74
            cost_bias = 1.14
            lead_time_bias_days = -1
        elif floors >= 8:
            category = "elevator_midrise"
            label = "Ascenseur passagers"
            criticality = 0.64
            cost_bias = 1.08
    elif any(token in text for token in ("pump", "pompe", "fan", "blower", "ventil", "compress", "compresse", "gear", "reduct", "motor", "moteur")):
        category = "rotating_machine"
        label = "Machine tournante"
        criticality = 0.46
        cost_bias = 1.03
        if any(token in text for token in ("compress", "compresse", "gear", "reduct")):
            criticality = 0.58
            cost_bias = 1.08

    if scenario:
        usage_intensity = _safe_float(scenario.get("usage_intensity")) or 0.0
        cycles_per_day = _safe_float(scenario.get("cycles_per_day")) or 0.0
        load_pattern = _normalize_text(scenario.get("load_pattern"))
        if usage_intensity >= 0.85 or cycles_per_day >= 700:
            criticality += 0.06
            lead_time_bias_days = min(lead_time_bias_days, -1)
        elif usage_intensity >= 0.60 or cycles_per_day >= 450:
            criticality += 0.03
        if load_pattern == "heavy_near_max":
            criticality += 0.05
            cost_bias += 0.04

    criticality = _clamp(criticality, 0.25, 0.90)

    return {
        "category": category,
        "label": label,
        "criticality": round(criticality, 3),
        "criticality_label": _criticality_label(criticality),
        "cost_bias": round(cost_bias, 2),
        "lead_time_bias_days": int(lead_time_bias_days),
        "service_mode": service_mode,
    }


def resolve_scenario_policy(
    machine: dict[str, Any],
    *,
    scenario: dict[str, Any] | None = None,
    hi: float | None = None,
    stress_value: float | None = None,
    alerts_24h: int = 0,
) -> dict[str, Any]:
    if scenario:
        usage_intensity = _clamp(_safe_float(scenario.get("usage_intensity")) or 0.0, 0.0, 1.0)
        wear_level = _clamp(_safe_float(scenario.get("wear_level")) or 0.0, 0.0, 1.0)
        thermal_stress = _clamp(_safe_float(scenario.get("thermal_stress")) or 0.0, 0.0, 1.0)
        humidity_stress = _clamp(_safe_float(scenario.get("humidity_stress")) or 0.0, 0.0, 1.0)
        variability = _clamp(_safe_float(scenario.get("load_variability")) or 0.0, 0.0, 1.0)
        overload_bias = _clamp((_safe_float(scenario.get("overload_bias")) or 0.0) / 0.60, 0.0, 1.0)
        vibration_bias = _clamp((_safe_float(scenario.get("vibration_bias_mms")) or 0.0) / 0.80, 0.0, 1.0)
        cycles_pressure = _clamp((_safe_float(scenario.get("cycles_per_day")) or 0.0) / 900.0, 0.0, 1.0)
        load_pattern = _normalize_text(scenario.get("load_pattern"))
        if load_pattern == "heavy_near_max":
            load_pressure = 0.95
        elif load_pattern == "mixed_half_load":
            load_pressure = 0.58
        elif load_pattern == "light_to_medium":
            load_pressure = 0.18
        else:
            load_pressure = _clamp((_safe_float(scenario.get("base_load_kg")) or 0.0) / 280.0, 0.0, 1.0)

        environment_pressure = _clamp(0.60 * thermal_stress + 0.40 * humidity_stress, 0.0, 1.0)
        pressure = _clamp(
            0.18 * usage_intensity
            + 0.18 * wear_level
            + 0.16 * environment_pressure
            + 0.14 * variability
            + 0.12 * overload_bias
            + 0.12 * vibration_bias
            + 0.10 * cycles_pressure
            + 0.10 * load_pressure,
            0.0,
            1.0,
        )
        factor_scores = {
            "thermal": environment_pressure,
            "vibration": max(vibration_bias, wear_level),
            "load": max(load_pressure, overload_bias),
            "variability": variability,
        }
        dominant_factor = max(factor_scores, key=factor_scores.get) if max(factor_scores.values()) >= 0.25 else None
        summary_bits: list[str] = []
        if usage_intensity >= 0.65 or cycles_pressure >= 0.65:
            summary_bits.append("usage intensif")
        if wear_level >= 0.65:
            summary_bits.append("usure avancee")
        if environment_pressure >= 0.60:
            summary_bits.append("contraintes thermiques")
        if variability >= 0.55:
            summary_bits.append("charge instable")
        if overload_bias >= 0.45:
            summary_bits.append("pointes de surcharge")

        return {
            "source": "demo_scenario",
            "profile": str(scenario.get("profile") or "") or None,
            "pressure": round(pressure, 3),
            "label": _scenario_label(pressure),
            "summary": ", ".join(summary_bits[:3]) or "contexte d'usage nominal",
            "dominant_factor": dominant_factor,
        }

    health_proxy = _clamp((0.80 - hi) / 0.50, 0.0, 1.0) if hi is not None else 0.35
    alert_pressure = _clamp(alerts_24h / 12.0, 0.0, 1.0)
    stress_proxy = _clamp(stress_value or 0.0, 0.0, 1.0)
    pressure = _clamp(0.50 * stress_proxy + 0.30 * health_proxy + 0.20 * alert_pressure, 0.0, 1.0)
    dominant_factor = "vibration" if stress_proxy >= max(health_proxy, alert_pressure) and stress_proxy >= 0.35 else None

    return {
        "source": "runtime_proxy",
        "profile": None,
        "pressure": round(pressure, 3),
        "label": _scenario_label(pressure),
        "summary": "proxy calcule depuis les signaux courants",
        "dominant_factor": dominant_factor,
    }


def resolve_telemetry_policy(
    machine: dict[str, Any],
    *,
    live: dict[str, Any],
    raw: dict[str, Any],
    data_source: str,
    age_seconds: float | None,
    freshness_state: str,
    prediction_mode: str | None,
    confidence: str | None,
    diagnosis_count: int = 0,
) -> dict[str, Any]:
    score = {
        "live_runtime": 86.0,
        "simulator_demo": 78.0,
        "persisted_reference": 52.0,
        "no_data": 28.0,
    }.get(data_source, 45.0)

    if age_seconds is not None:
        if data_source in {"live_runtime", "simulator_demo"}:
            if age_seconds > 600:
                score -= 24
            elif age_seconds > 180:
                score -= 14
            elif age_seconds > 45:
                score -= 6
        elif data_source == "persisted_reference":
            if age_seconds > 3600:
                score -= 18
            elif age_seconds > 600:
                score -= 8

    sensor_slots = {
        "health": live.get("hi_smooth") is not None or live.get("zone") is not None,
        "vibration": raw.get("rms_mms") is not None or raw.get("vibration_rms") is not None,
        "power": raw.get("power_kw") is not None or raw.get("current_a") is not None or raw.get("current_a_cycle_mean") is not None,
        "temperature": raw.get("temp_c") is not None,
        "humidity": raw.get("humidity_rh") is not None,
    }
    sensor_coverage = sum(1 for present in sensor_slots.values() if present) / len(sensor_slots)
    score += round(sensor_coverage * 12)

    if prediction_mode == "prediction":
        score += {
            "high": 6,
            "medium": 0,
            "low": -12,
        }.get(str(confidence or "").lower(), -6)
    elif prediction_mode == "initializing":
        score -= 8
    elif prediction_mode == "reference_only":
        score -= 6

    if diagnosis_count > 0:
        score += min(diagnosis_count, 3) * 2

    if freshness_state in {"retard", "reference_figee", "aucun_flux"}:
        score -= 8

    trust_score = _clamp(score, 0.0, 100.0)

    return {
        "trust_score": int(round(trust_score)),
        "trust_level": _telemetry_label(trust_score),
        "label": f"telemetrie {_telemetry_label(trust_score)}",
        "sensor_coverage": round(sensor_coverage, 3),
        "auto_schedule_guard": trust_score < 46 or data_source in {"persisted_reference", "no_data"},
        "heavy_action_guard": trust_score < 62,
    }


def resolve_planning_policy(
    machine: dict[str, Any],
    *,
    live: dict[str, Any],
    raw: dict[str, Any],
    data_source: str,
    age_seconds: float | None,
    freshness_state: str,
    prediction_mode: str | None,
    confidence: str | None,
    hi: float | None,
    stress_value: float | None,
    alerts_24h: int,
    diagnosis_count: int,
) -> dict[str, Any]:
    scenario = resolve_demo_scenario(machine)
    machine_policy = resolve_machine_policy(machine, scenario=scenario)
    scenario_policy = resolve_scenario_policy(
        machine,
        scenario=scenario,
        hi=hi,
        stress_value=stress_value,
        alerts_24h=alerts_24h,
    )
    telemetry_policy = resolve_telemetry_policy(
        machine,
        live=live,
        raw=raw,
        data_source=data_source,
        age_seconds=age_seconds,
        freshness_state=freshness_state,
        prediction_mode=prediction_mode,
        confidence=confidence,
        diagnosis_count=diagnosis_count,
    )

    return {
        "thresholds": load_planning_thresholds(),
        "machine": machine_policy,
        "scenario": scenario_policy,
        "telemetry": telemetry_policy,
    }


def _driver_key(value: str | None) -> str:
    text = _normalize_text(value)
    if any(token in text for token in ("vibr", "balourd", "align", "roulement", "bearing")):
        return "vibration"
    if any(token in text for token in ("therm", "surchauff", "temp")):
        return "thermal"
    if any(token in text for token in ("charge", "courant", "load", "surcouple", "asymetr")):
        return "load"
    if any(token in text for token in ("variab", "instable", "decouplage")):
        return "variability"
    return "general"


def select_task_template(
    machine_code: str,
    band: str,
    top_driver: str | None,
    *,
    machine_policy: dict[str, Any],
    scenario_policy: dict[str, Any],
    telemetry_policy: dict[str, Any],
    stop_recommended: bool = False,
    critical_diagnosis_count: int = 0,
) -> dict[str, Any]:
    driver_key = _driver_key(top_driver)
    criticality = _safe_float(machine_policy.get("criticality")) or 0.45
    scenario_pressure = _safe_float(scenario_policy.get("pressure")) or 0.0
    lead_bias = _safe_int(machine_policy.get("lead_time_bias_days")) or 0
    low_trust = bool(telemetry_policy.get("auto_schedule_guard"))
    heavy_action_guard = bool(telemetry_policy.get("heavy_action_guard"))

    priority_days = max(
        1,
        3
        + lead_bias
        - (1 if criticality >= 0.70 else 0)
        - (1 if scenario_pressure >= 0.75 else 0),
    )
    watch_days = max(
        3,
        7
        + lead_bias
        - (1 if scenario_pressure >= 0.65 else 0)
        + (1 if low_trust else 0),
    )
    stable_days = max(
        10,
        21
        + lead_bias
        - (2 if scenario_pressure >= 0.75 else 0),
    )

    if band == "critical":
        if low_trust and not stop_recommended and critical_diagnosis_count == 0:
            return {
                "type": "inspection",
                "lead_days": 0,
                "cooldown_days": 3,
                "driver_key": driver_key,
                "title": f"Inspection urgente {machine_code}",
                "summary": "Confirmer rapidement sur site les signaux critiques avant une action lourde.",
            }
        if driver_key == "vibration" or stop_recommended or critical_diagnosis_count > 0 or criticality >= 0.70:
            return {
                "type": "corrective",
                "lead_days": 0,
                "cooldown_days": 3,
                "driver_key": driver_key,
                "title": f"Intervention corrective {machine_code}",
                "summary": "Traiter rapidement la derive observee et confirmer la securite de poursuite.",
            }
        return {
            "type": "inspection",
            "lead_days": 0,
            "cooldown_days": 3,
            "driver_key": driver_key,
            "title": f"Inspection urgente {machine_code}",
            "summary": "Verifier la machine sans delai et confirmer l'action ciblee.",
        }

    if band == "priority":
        if driver_key == "vibration":
            task_type = "inspection" if heavy_action_guard else "preventive"
            title = f"Inspection vibratoire {machine_code}" if task_type == "inspection" else f"Maintenance ciblee {machine_code}"
        elif driver_key == "thermal":
            task_type = "inspection" if low_trust else "preventive"
            title = f"Controle thermique {machine_code}" if task_type == "inspection" else f"Maintenance thermique {machine_code}"
        elif driver_key in {"load", "variability"}:
            task_type = "inspection"
            title = f"Inspection ciblee {machine_code}"
        else:
            task_type = "inspection" if low_trust else "preventive"
            title = f"Maintenance ciblee {machine_code}"

        return {
            "type": task_type,
            "lead_days": priority_days,
            "cooldown_days": 14 if task_type == "preventive" else 10,
            "driver_key": driver_key,
            "title": title,
            "summary": "Preparer une intervention dans la fenetre utile avant degradation supplementaire.",
        }

    if band == "watch":
        title = f"Inspection renforcee {machine_code}"
        if driver_key == "vibration":
            title = f"Inspection vibratoire {machine_code}"
        elif driver_key == "thermal":
            title = f"Controle thermique {machine_code}"
        return {
            "type": "inspection",
            "lead_days": watch_days,
            "cooldown_days": 21,
            "driver_key": driver_key,
            "title": title,
            "summary": "Verifier les signaux dominants et confirmer la tendance avant escalation.",
        }

    return {
        "type": "preventive",
        "lead_days": stable_days,
        "cooldown_days": 30,
        "driver_key": driver_key,
        "title": f"Visite preventive {machine_code}",
        "summary": "Conserver le niveau de sante actuel avec une routine de suivi adaptee.",
    }
