from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from core.supabase_client import get_supabase

logger = logging.getLogger(__name__)

PredictiveBand = str
DataSource = str

AXIS_LABELS: dict[str, str] = {
    "thermal": "Thermique",
    "vibration": "Vibratoire",
    "load": "Charge",
    "variability": "Variabilité",
}

STRESS_LABELS: dict[str, str] = {
    "low": "Faible",
    "moderate": "Modéré",
    "high": "Élevé",
    "critical": "Critique",
}

CONFIDENCE_LABELS: dict[str, str] = {
    "high": "élevée",
    "medium": "moyenne",
    "low": "faible",
}

DATA_SOURCE_LABELS: dict[str, str] = {
    "live_runtime": "flux en direct",
    "simulator_demo": "replay démo",
    "persisted_reference": "référence persistée",
    "no_data": "aucun flux récent",
}

URGENCY_META: dict[PredictiveBand, dict[str, Any]] = {
    "stable": {"label": "Stable", "hex": "#10b981"},
    "watch": {"label": "À surveiller", "hex": "#0f766e"},
    "priority": {"label": "À planifier", "hex": "#f59e0b"},
    "critical": {"label": "Urgent", "hex": "#f43f5e"},
}

_RUL_V2_UNSET = object()


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: float | None, digits: int = 3) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _format_fr_number(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "n/a"

    rounded = round(value, digits)
    if float(rounded).is_integer():
        return str(int(rounded))

    return f"{rounded:.{digits}f}".replace(".", ",").rstrip("0").rstrip(",")


def _parse_iso(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _hi_to_status(zone: str | None, hi: float | None, persisted: str | None) -> str:
    if zone == "Excellent":
        return "ok"
    if zone in {"Good", "Degraded"}:
        return "degraded"
    if zone == "Critical":
        return "critical"

    if hi is not None:
        if hi >= 0.8:
            return "ok"
        if hi >= 0.3:
            return "degraded"
        return "critical"

    persisted_status = str(persisted or "").lower()
    if persisted_status in {"operational", "ok"}:
        return "ok"
    if persisted_status in {"degraded", "surveillance"}:
        return "degraded"
    if persisted_status == "critical":
        return "critical"
    if persisted_status == "maintenance":
        return "maintenance"
    return "maintenance" if persisted_status == "maintenance" else "ok"


def _get_urgency_band(score: float) -> PredictiveBand:
    if score >= 80:
        return "critical"
    if score >= 58:
        return "priority"
    if score >= 34:
        return "watch"
    return "stable"


def _infer_data_source(machine: dict, live: dict, raw: dict) -> DataSource:
    source = str(raw.get("source") or live.get("source") or "").lower()
    if source == "simulator_demo":
        return "simulator_demo"
    if live or raw:
        return "live_runtime"
    if machine.get("hi_courant") is not None or machine.get("rul_courant") is not None:
        return "persisted_reference"
    return "no_data"


def _freshness_state(data_source: DataSource, age_seconds: float | None) -> tuple[bool, str]:
    if age_seconds is None:
        return True, "indisponible"

    if data_source in {"live_runtime", "simulator_demo"}:
        if age_seconds <= 45:
            return False, "live"
        if age_seconds <= 180:
            return True, "retard_leger"
        return True, "retard"

    if data_source == "persisted_reference":
        if age_seconds <= 600:
            return True, "reference_recente"
        return True, "reference_figee"

    return True, "aucun_flux"


def _field_checks(axis: str | None, status: str) -> list[str]:
    if status == "critical":
        common = ["Vérifier la machine sur site avant toute poursuite en charge normale."]
    else:
        common = []

    axis_checks = {
        "thermal": [
            "Vérifier la ventilation moteur et le refroidissement autour de l'armoire.",
            "Comparer courant et température sur plusieurs montées consécutives.",
            "Contrôler les connexions électriques susceptibles de chauffer.",
        ],
        "vibration": [
            "Contrôler les roulements, l'alignement et la fixation moteur.",
            "Écouter les bruits anormaux en montée puis à vide.",
            "Vérifier l'absence de jeu mécanique ou de frottement parasite.",
        ],
        "load": [
            "Comparer courant, puissance et charge sur des cycles légers et chargés.",
            "Vérifier la surcharge, la répartition de charge et le contrepoids.",
            "Examiner les frottements de guidage ou d'entraînement.",
        ],
        "variability": [
            "Comparer des cycles stables et instables pour isoler le régime perturbateur.",
            "Vérifier la régularité de l'alimentation et des commandes.",
            "Contrôler les capteurs ou l'acquisition si les variations sont incohérentes.",
        ],
    }
    return common + axis_checks.get(axis or "", [
        "Vérifier les derniers cycles réels avant toute conclusion définitive.",
        "Comparer les mesures terrain avec les habitudes d'exploitation du site.",
    ])


def _task_template(machine_code: str, band: PredictiveBand, top_driver: str | None) -> dict[str, Any]:
    if band == "critical":
        return {
            "type": "corrective",
            "lead_days": 0,
            "title": f"Intervention corrective {machine_code}",
            "summary": "Traiter rapidement la dérive observée et confirmer la sécurité de poursuite.",
        }

    if band == "priority":
        return {
            "type": "inspection" if (top_driver or "").lower().startswith("vibr") else "preventive",
            "lead_days": 3,
            "title": f"Maintenance ciblée {machine_code}",
            "summary": "Préparer une intervention dans la fenêtre de maintenance recommandée.",
        }

    if band == "watch":
        return {
            "type": "inspection",
            "lead_days": 7,
            "title": f"Inspection renforcée {machine_code}",
            "summary": "Vérifier les signaux dominants avant réduction supplémentaire de la marge.",
        }

    return {
        "type": "preventive",
        "lead_days": 21,
        "title": f"Visite préventive {machine_code}",
        "summary": "Conserver le niveau de santé actuel avec une routine de suivi standard.",
    }


def _budget_model(
    hi: float | None,
    urgency_score: int,
    band: PredictiveBand,
    stress_value: float | None,
    alerts_24h: int,
    rul_days: float | None,
) -> tuple[float, float]:
    health_component = (1 - hi) if hi is not None else 0.35
    rul_pressure = _clamp((30 - rul_days) / 30, 0, 1) if rul_days is not None else 0.0
    anomaly_pressure = _clamp(alerts_24h / 12, 0, 1)
    multiplier = _clamp(
        0.85
        + health_component * 0.9
        + (stress_value or 0.0) * 0.35
        + (urgency_score / 100) * 0.55
        + rul_pressure * 0.45
        + anomaly_pressure * 0.2,
        0.85,
        3.2,
    )
    delay_multiplier = {
        "critical": 1.28,
        "priority": 1.18,
        "watch": 1.10,
        "stable": 1.05,
    }[band]
    return round(multiplier, 2), round(delay_multiplier, 2)


def fetch_alert_counts(
    machine_ids: list[str],
    *,
    window_hours: int = 24,
) -> dict[str, int]:
    if not machine_ids:
        return {}

    sb = get_supabase()
    since = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    counts: dict[str, int] = {machine_id: 0 for machine_id in machine_ids}
    try:
        res = sb.table("alertes").select("machine_id").in_("machine_id", machine_ids).gte(
            "created_at", since
        ).execute()
        for row in res.data or []:
            machine_id = row.get("machine_id")
            if machine_id:
                counts[machine_id] = counts.get(machine_id, 0) + 1
    except Exception as exc:
        logger.warning("Could not load alert counts: %s", exc)
    return counts


def fetch_open_task_counts(machine_ids: list[str]) -> dict[str, int]:
    if not machine_ids:
        return {}

    sb = get_supabase()
    counts: dict[str, int] = {machine_id: 0 for machine_id in machine_ids}
    try:
        res = (
            sb.table("gmao_taches")
            .select("machine_id")
            .in_("machine_id", machine_ids)
            .in_("statut", ["planifiee", "en_cours"])
            .execute()
        )
        for row in res.data or []:
            machine_id = row.get("machine_id")
            if machine_id:
                counts[machine_id] = counts.get(machine_id, 0) + 1
    except Exception as exc:
        logger.warning("Could not load open-task counts: %s", exc)
    return counts


def build_machine_decision_snapshot(
    machine: dict,
    manager,
    *,
    alerts_24h: int = 0,
    open_tasks: int = 0,
    rul_v2: dict | None | object = _RUL_V2_UNSET,
) -> dict[str, Any]:
    from routers.diagnostics_rul import (
        _build_diagnose_features,
        build_rul_v2_response,
        compute_stress_index,
        diagnose,
        hi_to_zone,
    )

    code = str(machine.get("code") or machine.get("id") or "")
    live = dict(manager.last_results.get(code) or {})
    raw = dict(manager.last_raw.get(code) or {})

    if rul_v2 is _RUL_V2_UNSET:
        try:
            rul_v2_payload = build_rul_v2_response(manager, code)
        except HTTPException as exc:
            if exc.status_code in {404, 425}:
                rul_v2_payload = None
            else:
                logger.warning("Could not build decision RUL v2 payload for %s: %s", code, exc)
                rul_v2_payload = None
        except Exception as exc:
            logger.warning("Could not build decision RUL v2 payload for %s: %s", code, exc)
            rul_v2_payload = None
    else:
        rul_v2_payload = rul_v2 if isinstance(rul_v2, dict) else None

    prediction = (rul_v2_payload or {}).get("prediction") or {}

    hi = _safe_float((rul_v2_payload or {}).get("hi_current"))
    if hi is None:
        hi = _safe_float(live.get("hi_smooth"))
    if hi is None:
        hi = _safe_float(machine.get("hi_courant"))

    zone = (
        live.get("zone")
        or (rul_v2_payload or {}).get("zone")
        or (hi_to_zone(hi) if hi is not None else None)
    )
    status = _hi_to_status(zone, hi, machine.get("statut"))

    data_source = _infer_data_source(machine, live, raw)
    updated_at = (
        _parse_iso(raw.get("observed_at"))
        or _parse_iso(live.get("updated_at"))
        or _parse_iso(machine.get("derniere_maj"))
    )
    age_seconds = (
        max(0.0, (datetime.now(timezone.utc) - updated_at).total_seconds())
        if updated_at is not None
        else None
    )
    is_stale, freshness_state = _freshness_state(data_source, age_seconds)

    stress_payload: dict[str, Any] | None = None
    diagnosis_payloads: list[dict[str, Any]] = []
    try:
        if code in manager.engines:
            features = _build_diagnose_features(manager, code)
            stress_payload = compute_stress_index(features).to_dict()
            diagnosis_payloads = [item.to_dict() for item in diagnose(features)]
    except Exception as exc:
        logger.warning("Could not compute decision diagnostics for %s: %s", code, exc)

    critical_diagnoses = [
        item
        for item in diagnosis_payloads
        if str(item.get("severity") or "").lower() == "critical"
    ]
    warning_diagnoses = [
        item
        for item in diagnosis_payloads
        if str(item.get("severity") or "").lower() == "warning"
    ]
    leading_diagnosis = (
        critical_diagnoses[0]
        if critical_diagnoses
        else warning_diagnoses[0]
        if warning_diagnoses
        else diagnosis_payloads[0]
        if diagnosis_payloads
        else None
    )

    stress_value = _safe_float((stress_payload or {}).get("value"))
    stress_band = (stress_payload or {}).get("band")
    dominant_axis_key = (stress_payload or {}).get("dominant")
    dominant_axis = AXIS_LABELS.get(str(dominant_axis_key), None) if dominant_axis_key else None

    if diagnosis_payloads:
        top_driver = diagnosis_payloads[0].get("cause")
    else:
        top_driver = dominant_axis

    prediction_mode = (rul_v2_payload or {}).get("mode")
    if prediction_mode is None and hi is not None and hi >= 0.8:
        prediction_mode = "no_prediction"
    elif prediction_mode is None and code in manager.engines:
        prediction_mode = "warming_up"
    rul_days = _safe_float(prediction.get("rul_days"))
    confidence = prediction.get("confidence")
    maintenance_window = (
        (rul_v2_payload or {}).get("maintenance_window")
        or prediction.get("maintenance_window")
    )
    stop_recommended = bool(prediction.get("stop_recommended"))

    base_score = 18
    if stop_recommended or status == "critical":
        base_score = 88
    elif prediction_mode == "prediction" and rul_days is not None:
        if rul_days <= 1:
            base_score = 88
        elif rul_days <= 3:
            base_score = 80
        elif rul_days <= 7:
            base_score = 70
        elif rul_days <= 15:
            base_score = 58
        elif rul_days <= 30:
            base_score = 45
        else:
            base_score = 28
    elif status == "degraded":
        base_score = 42
    elif prediction_mode == "warming_up":
        base_score = 28 if hi is None or hi >= 0.8 else 42
    elif prediction_mode == "no_prediction":
        base_score = 16 if hi is None or hi >= 0.8 else 30

    health_penalty = round((1 - hi) * 18) if hi is not None else 6
    stress_boost = round((stress_value or 0.0) * 22)
    anomaly_boost = 8 if alerts_24h > 10 else 4 if alerts_24h > 3 else 0
    confidence_penalty = 3 if confidence == "low" else 1 if confidence == "medium" else 0
    urgency_score = int(_clamp(base_score + health_penalty + stress_boost + anomaly_boost - confidence_penalty, 0, 100))

    if len(critical_diagnoses) >= 2:
        urgency_score = max(urgency_score, 88)
        maintenance_window = "Contrôle terrain prioritaire"
    elif critical_diagnoses:
        urgency_score = max(urgency_score, 72)
        maintenance_window = "Contrôle terrain prioritaire"
    elif warning_diagnoses:
        urgency_score = max(urgency_score, 45)

    urgency_band = _get_urgency_band(urgency_score)
    urgency_meta = URGENCY_META[urgency_band]

    if stop_recommended or urgency_band == "critical":
        summary = (
            f"Risque élevé sur {code} : la marge restante est courte"
            + (f" ({_format_fr_number(rul_days, 1)} j)." if rul_days is not None else ".")
        )
        plain_reason = (
            f"Le système détecte une combinaison de santé dégradée, de stress {STRESS_LABELS.get(str(stress_band), 'significatif').lower()} "
            "et de signaux nécessitant une action rapide."
        )
        impact = "Le risque de perturbation devient concret si l'équipe attend trop longtemps."
        recommended_action = maintenance_window or "Prioriser une inspection terrain et préparer une intervention rapide."
    elif urgency_band == "priority":
        summary = (
            f"Fenêtre de maintenance à préparer pour {code}"
            + (f" : environ {_format_fr_number(rul_days, 1)} j restants." if rul_days is not None else ".")
        )
        plain_reason = (
            "La machine reste exploitable, mais plusieurs indicateurs montrent que la marge de confort se réduit."
        )
        impact = "Une intervention planifiée évite une dérive vers le critique."
        recommended_action = maintenance_window or "Planifier une maintenance ciblée dans la prochaine fenêtre disponible."
    elif urgency_band == "watch":
        summary = (
            f"Surveillance renforcée sur {code} : le comportement reste acceptable mais mérite un suivi rapproché."
        )
        plain_reason = (
            "Les signaux restent contenus, mais ils révèlent une sollicitation ou une usure qui doit être suivie."
        )
        impact = "Pas d'urgence immédiate, mais la marge peut se contracter si la tendance se confirme."
        recommended_action = maintenance_window or "Vérifier la machine avant le prochain cycle de maintenance préventive."
    else:
        summary = f"{code} reste stable : aucun signe précurseur fort de dégradation rapide n'est observé."
        plain_reason = "Le Health Index reste confortable et les signaux récents ne montrent pas de dérive nette."
        impact = "Aucun arrêt à court terme n'est suggéré par les données récentes."
        recommended_action = maintenance_window or "Conserver la surveillance normale et la maintenance planifiée."

    if dominant_axis and dominant_axis not in plain_reason:
        plain_reason += f" La pression dominante se situe côté {dominant_axis.lower()}."

    leading_cause = str((leading_diagnosis or {}).get("cause") or "").strip()
    leading_action = str((leading_diagnosis or {}).get("action") or "").strip()
    if critical_diagnoses and leading_cause:
        if len(critical_diagnoses) >= 2:
            summary = (
                f"Alerte experte prioritaire sur {code} : {leading_cause.lower()} "
                f"et {len(critical_diagnoses) - 1} autre(s) signal(aux) critique(s)."
            )
        else:
            summary = f"Alerte experte prioritaire sur {code} : {leading_cause.lower()}."
    elif warning_diagnoses and urgency_band == "stable" and leading_cause:
        summary = f"Surveillance renforcée sur {code} : {leading_cause.lower()}."
    if leading_cause:
        cause_note = leading_cause.lower()
        if cause_note not in plain_reason.lower():
            plain_reason += f" Les règles expertes remontent aussi : {cause_note}."
    if critical_diagnoses and leading_action:
        recommended_action = leading_action
        impact = "Le niveau d'alerte expert invite à vérifier la machine sur le terrain sans attendre une dérive supplémentaire du RUL."

    trust_note: str
    if critical_diagnoses and prediction_mode == "no_prediction":
        trust_note = (
            "Le RUL live reste masqué tant que le HI demeure au-dessus du seuil méthodologique, "
            "mais les règles expertes justifient ici un contrôle terrain prioritaire."
        )
    elif critical_diagnoses and prediction_mode == "warming_up":
        trust_note = (
            "Le pronostic RUL se calibre encore, mais les règles expertes justifient déjà un contrôle terrain prioritaire."
        )
    elif prediction_mode == "prediction" and confidence:
        trust_note = f"Prédiction publiée avec un niveau de confiance {CONFIDENCE_LABELS.get(str(confidence), 'indéterminé')}."
    elif prediction_mode == "warming_up":
        trust_note = "Le système attend encore suffisamment d'historique avant de consolider le pronostic."
    elif prediction_mode == "no_prediction":
        trust_note = "Le système préfère conserver une référence stable plutôt que d'afficher un faux RUL."
    elif data_source == "persisted_reference":
        trust_note = "Lecture issue du dernier état persisté, sans flux capteur récent."
    else:
        trust_note = "Lecture fondée sur les derniers signaux disponibles."

    evidence: list[str] = []
    if hi is not None:
        evidence.append(f"HI {_format_fr_number(hi * 100, 0)} % ({zone or hi_to_zone(hi)})")
    if rul_days is not None:
        evidence.append(f"RUL estimé à {_format_fr_number(rul_days, 1)} j")
    elif prediction_mode == "no_prediction":
        l10_years = _safe_float(((rul_v2_payload or {}).get("l10") or {}).get("years_adjusted"))
        if l10_years is not None:
            evidence.append(f"Référence L10 {_format_fr_number(l10_years, 1)} ans")
    if leading_cause:
        evidence.append(f"Alerte experte : {leading_cause}")
    if dominant_axis:
        evidence.append(f"Axe dominant : {dominant_axis}")
    if stress_value is not None:
        evidence.append(
            f"Stress {_format_fr_number(stress_value * 100, 0)} % ({STRESS_LABELS.get(str(stress_band), 'Indéterminé')})"
        )
    if alerts_24h:
        evidence.append(f"{alerts_24h} alerte(s) sur 24 h")
    if open_tasks:
        evidence.append(f"{open_tasks} tâche(s) déjà ouverte(s)")
    if data_source == "persisted_reference":
        evidence.append("Affichage fondé sur le dernier état persisté")
    elif data_source == "no_data":
        evidence.append("Aucun flux capteur récent disponible")

    budget_multiplier, delay_multiplier = _budget_model(
        hi=hi,
        urgency_score=urgency_score,
        band=urgency_band,
        stress_value=stress_value,
        alerts_24h=alerts_24h,
        rul_days=rul_days,
    )

    return {
        "status": status,
        "zone": zone,
        "hi": _round(hi, 4),
        "rul_days": _round(rul_days, 1),
        "prediction_mode": prediction_mode,
        "confidence": confidence,
        "maintenance_window": maintenance_window,
        "stop_recommended": stop_recommended,
        "alerts_24h": alerts_24h,
        "open_tasks": open_tasks,
        "stress_value": _round(stress_value, 4),
        "stress_band": stress_band,
        "stress_label": STRESS_LABELS.get(str(stress_band), "Indisponible"),
        "dominant_axis": dominant_axis,
        "top_driver": top_driver,
        "urgency_score": urgency_score,
        "urgency_band": urgency_band,
        "urgency_label": urgency_meta["label"],
        "urgency_hex": urgency_meta["hex"],
        "summary": summary,
        "plain_reason": plain_reason,
        "impact": impact,
        "recommended_action": recommended_action,
        "trust_note": trust_note,
        "technical_story": (
            f"Zone {zone or 'inconnue'}, HI {_format_fr_number(hi, 3) if hi is not None else 'n/a'}, "
            f"source {DATA_SOURCE_LABELS.get(data_source, data_source)}, axe dominant {(dominant_axis or 'indéterminé').lower()}."
        ),
        "evidence": evidence,
        "field_checks": _field_checks(dominant_axis_key if isinstance(dominant_axis_key, str) else None, status),
        "task_template": _task_template(code, urgency_band, top_driver),
        "budget_model": {
            "multiplier": budget_multiplier,
            "delay_multiplier": delay_multiplier,
        },
        "diagnosis_count": len(diagnosis_payloads),
        "diagnoses": diagnosis_payloads[:3],
        "data_source": data_source,
        "updated_at": _to_iso(updated_at),
        "age_seconds": int(age_seconds) if age_seconds is not None else None,
        "is_stale": is_stale,
        "freshness_state": freshness_state,
    }
