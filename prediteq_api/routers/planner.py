"""
Structured maintenance planner.

The planner relies on the shared decision snapshot used elsewhere in the app.
It returns deterministic JSON for fleet ranking and proposed actions, so the
frontend does not have to infer planning data from free-form prose.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth import CurrentUser, require_admin
from core.cost_model import get_budget_reference_cost
from core.decision_snapshot import (
    build_machine_decision_snapshot,
    fetch_alert_counts,
    fetch_open_task_counts,
)
from core.machine_labels import get_machine_public_label
from core.supabase_client import get_supabase
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/planner", tags=["planner"])

OPEN_TASK_STATUSES = {"planifiee", "en_cours"}
TASK_TYPE_LABELS = {
    "preventive": "maintenance preventive",
    "corrective": "intervention corrective",
    "inspection": "inspection",
}


class PlanRequest(BaseModel):
    focus_machine: str | None = None


class ApproveTaskRequest(BaseModel):
    machine_code: str
    titre: str = Field(..., min_length=3, max_length=200)
    type: Literal["preventive", "corrective", "inspection"] = "preventive"
    priorite: Literal["haute", "moyenne", "basse"] = "moyenne"
    date_planifiee: str | None = None
    cout_estime: float | None = None
    description: str = ""
    technicien: str = ""


def _load_machines(focus_machine: str | None = None) -> list[dict[str, Any]]:
    sb = get_supabase()
    try:
        query = sb.table("machines").select("*").order("code")
        if focus_machine:
            query = query.eq("code", focus_machine)
        result = query.execute()
        return result.data or []
    except Exception as exc:
        logger.error("Planner machine load failed: %s", exc)
        raise HTTPException(502, "Erreur de base de donnees")


def _load_avg_costs(machine_ids: list[str]) -> dict[str, float]:
    if not machine_ids:
        return {}

    sb = get_supabase()
    averages: dict[str, list[float]] = {machine_id: [] for machine_id in machine_ids}
    try:
        res = sb.table("couts").select("machine_id, total").in_("machine_id", machine_ids).execute()
        for row in res.data or []:
            machine_id = row.get("machine_id")
            total = row.get("total")
            if machine_id and total is not None:
                averages.setdefault(machine_id, []).append(float(total))
    except Exception as exc:
        logger.warning("Planner cost load failed: %s", exc)

    return {
        machine_id: (sum(values) / len(values) if values else 0.0)
        for machine_id, values in averages.items()
    }


def _suggested_date(days_from_now: int) -> str:
    return (
        datetime.now(timezone.utc) + timedelta(days=max(days_from_now, 0))
    ).date().isoformat()


def _priority_from_band(band: str) -> str:
    if band == "critical":
        return "haute"
    if band == "priority":
        return "moyenne"
    return "basse"


def _projected_cost(avg_cost: float, decision: dict[str, Any], task_type: str) -> tuple[int, int]:
    budget = decision.get("budget_model") or {}
    multiplier = float(budget.get("multiplier") or 1.0)
    delay_multiplier = float(budget.get("delay_multiplier") or 1.05)
    projected = int(round(get_budget_reference_cost(task_type, avg_cost) * multiplier))
    delayed = int(round(projected * delay_multiplier))
    return projected, delayed


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_metric(
    value: float | None,
    *,
    scale: float = 1.0,
    digits: int = 0,
    suffix: str = "",
) -> str | None:
    if value is None:
        return None

    scaled = value * scale
    if digits <= 0:
        return f"{int(round(scaled))}{suffix}"

    return f"{scaled:.{digits}f}".rstrip("0").rstrip(".") + suffix


def _clean_task_fragment(
    value: Any,
    *,
    fallback: str | None = None,
    max_length: int = 72,
) -> str | None:
    text = " ".join(str(value or fallback or "").replace("\n", " ").split()).strip(" .,;:-")
    if not text:
        return fallback
    if len(text) <= max_length:
        return text
    return text[: max_length - 3].rstrip(" ,;-") + "..."


def _parse_task_datetime(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"

    parsed: datetime | None = None
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(f"{normalized}T00:00:00")
        except ValueError:
            return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _load_task_history(machine_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    if not machine_ids:
        return {}

    sb = get_supabase()
    history: dict[str, list[dict[str, Any]]] = {machine_id: [] for machine_id in machine_ids}
    since = (datetime.now(timezone.utc) - timedelta(days=180)).isoformat()

    try:
        res = (
            sb.table("gmao_taches")
            .select("machine_id, titre, type, statut, date_planifiee, created_at")
            .in_("machine_id", machine_ids)
            .gte("created_at", since)
            .order("created_at", desc=True)
            .execute()
        )
        for row in res.data or []:
            machine_id = row.get("machine_id")
            if machine_id:
                history.setdefault(machine_id, []).append(row)
    except Exception as exc:
        logger.warning("Planner task history load failed: %s", exc)

    return history


def _summarize_task_history(machine_tasks: list[dict[str, Any]], task_type: str) -> dict[str, Any]:
    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=60)
    same_type_tasks = [
        task for task in machine_tasks if str(task.get("type") or "") == task_type
    ]

    open_same_type = 0
    completed_same_type = 0
    recent_completed_same_type = 0
    latest_completed_at: datetime | None = None

    for task in same_type_tasks:
        status = str(task.get("statut") or "")
        when = _parse_task_datetime(task.get("date_planifiee") or task.get("created_at"))

        if status in OPEN_TASK_STATUSES:
            open_same_type += 1
            continue

        if status == "terminee":
            completed_same_type += 1
            if when and when >= recent_cutoff:
                recent_completed_same_type += 1
            if when and (latest_completed_at is None or when > latest_completed_at):
                latest_completed_at = when

    return {
        "task_type": task_type,
        "total_machine_tasks": len(machine_tasks),
        "same_type_tasks": len(same_type_tasks),
        "open_same_type": open_same_type,
        "completed_same_type": completed_same_type,
        "recent_completed_same_type": recent_completed_same_type,
        "latest_completed_at": latest_completed_at,
    }


def _build_task_history_note(history_summary: dict[str, Any]) -> str | None:
    task_label = TASK_TYPE_LABELS.get(
        str(history_summary.get("task_type") or ""),
        str(history_summary.get("task_type") or "action"),
    )
    open_same_type = int(history_summary.get("open_same_type") or 0)
    recent_completed_same_type = int(history_summary.get("recent_completed_same_type") or 0)
    completed_same_type = int(history_summary.get("completed_same_type") or 0)
    latest_completed_at = history_summary.get("latest_completed_at")

    if open_same_type > 0:
        return (
            f"Contexte calendrier: {open_same_type} tache(s) de {task_label} sont deja ouvertes sur cette machine; "
            "la relance reste volontairement autorisee si un nouveau passage ou un renfort est necessaire."
        )

    if recent_completed_same_type > 0:
        latest = (
            latest_completed_at.strftime("%d/%m/%Y")
            if isinstance(latest_completed_at, datetime)
            else "date recente"
        )
        return (
            f"Historique: {recent_completed_same_type} action(s) similaires ont deja ete cloturees recemment "
            f"(derniere le {latest}); la repetition reste coherente si les signaux n'ont pas disparu."
        )

    if completed_same_type > 0 and isinstance(latest_completed_at, datetime):
        return (
            f"Historique: une action comparable a deja ete menee (derniere le {latest_completed_at.strftime('%d/%m/%Y')})."
        )

    return None


def _build_task_title(
    machine: dict[str, Any],
    decision: dict[str, Any],
    task_template: dict[str, Any],
    history_summary: dict[str, Any],
) -> str:
    machine_code = str(machine.get("code") or machine.get("id") or "").strip()
    base_title = _clean_task_fragment(
        task_template.get("title"),
        fallback=f"Intervention {machine_code}",
        max_length=120,
    ) or f"Intervention {machine_code}"
    if machine_code and machine_code not in base_title:
        base_title = f"{base_title} {machine_code}"

    qualifiers: list[str] = []
    driver_label = _clean_task_fragment(
        decision.get("top_driver") or decision.get("dominant_axis"),
        max_length=38,
    )
    if driver_label:
        qualifiers.append(driver_label)

    urgency_band = str(decision.get("urgency_band") or "")
    rul_label = _format_metric(_safe_float(decision.get("rul_days")), suffix=" j")
    hi_label = _format_metric(_safe_float(decision.get("hi")), scale=100, suffix="%")
    if urgency_band in {"critical", "priority"} and rul_label:
        qualifiers.append(f"RUL {rul_label}")
    elif urgency_band in {"critical", "watch"} and hi_label:
        qualifiers.append(f"HI {hi_label}")

    if (
        int(history_summary.get("open_same_type") or 0) > 0
        or int(history_summary.get("recent_completed_same_type") or 0) > 0
    ):
        qualifiers.append("reprise")

    title = base_title
    for qualifier in qualifiers:
        candidate = f"{title} - {qualifier}"
        if len(candidate) > 200:
            break
        title = candidate

    return title[:200]


def _build_task_description(
    decision: dict[str, Any],
    history_summary: dict[str, Any],
) -> str:
    parts: list[str] = []
    recommended_action = _clean_task_fragment(decision.get("recommended_action"), max_length=260)
    plain_reason = _clean_task_fragment(decision.get("plain_reason"), max_length=320)
    impact = _clean_task_fragment(decision.get("impact"), max_length=220)
    maintenance_window = _clean_task_fragment(decision.get("maintenance_window"), max_length=120)

    evidence = [
        item
        for item in (
            _clean_task_fragment(entry, max_length=90)
            for entry in (decision.get("evidence") or [])[:3]
        )
        if item
    ]
    field_check = _clean_task_fragment(
        ((decision.get("field_checks") or [])[:1] or [None])[0],
        max_length=140,
    )

    state_parts: list[str] = []
    hi_label = _format_metric(_safe_float(decision.get("hi")), scale=100, suffix="%")
    rul_label = _format_metric(_safe_float(decision.get("rul_days")), suffix=" j")
    urgency_score = decision.get("urgency_score")
    zone = _clean_task_fragment(decision.get("zone"), max_length=32)
    driver = _clean_task_fragment(
        decision.get("top_driver") or decision.get("dominant_axis"),
        max_length=50,
    )
    if hi_label:
        state_parts.append(f"HI {hi_label}")
    if rul_label:
        state_parts.append(f"RUL {rul_label}")
    if zone:
        state_parts.append(f"zone {zone}")
    if isinstance(urgency_score, (int, float)):
        state_parts.append(f"score {int(round(float(urgency_score)))}/100")
    if driver:
        state_parts.append(f"signal dominant {driver}")

    if recommended_action:
        parts.append(f"Action: {recommended_action}.")
    if state_parts:
        parts.append(f"Etat: {', '.join(state_parts)}.")
    if plain_reason:
        parts.append(f"Motif: {plain_reason}.")
    if maintenance_window:
        parts.append(f"Fenetre: {maintenance_window}.")
    if impact:
        parts.append(f"Impact: {impact}.")
    if evidence:
        parts.append(f"Preuves: {' | '.join(evidence)}.")
    if field_check:
        parts.append(f"Controle terrain: {field_check}.")

    history_note = _build_task_history_note(history_summary)
    if history_note:
        parts.append(history_note)

    return " ".join(parts).strip()


def _build_approval_repeat_note(
    existing_tasks: list[dict[str, Any]],
    *,
    title: str,
    task_type: str,
) -> str | None:
    same_title_open = 0
    same_type_open = 0
    same_type_completed = 0
    latest_same_type_at: datetime | None = None
    normalized_title = title.strip().lower()

    for task in existing_tasks:
        status = str(task.get("statut") or "")
        same_type = str(task.get("type") or "") == task_type
        same_title = str(task.get("titre") or "").strip().lower() == normalized_title
        when = _parse_task_datetime(task.get("date_planifiee") or task.get("created_at"))

        if same_title and status in OPEN_TASK_STATUSES:
            same_title_open += 1
        if same_type and status in OPEN_TASK_STATUSES:
            same_type_open += 1
        if same_type and status == "terminee":
            same_type_completed += 1
            if when and (latest_same_type_at is None or when > latest_same_type_at):
                latest_same_type_at = when

    if same_title_open > 0:
        return (
            f"Relance planner autorisee: {same_title_open} tache(s) au meme titre sont deja ouvertes; "
            "la nouvelle insertion reste permise si une reprise ou un second passage est necessaire."
        )

    if same_type_open > 0:
        task_label = TASK_TYPE_LABELS.get(task_type, task_type)
        return (
            f"Coordination calendrier: {same_type_open} tache(s) de {task_label} sont deja ouvertes sur cette machine."
        )

    if same_type_completed > 0 and latest_same_type_at is not None:
        task_label = TASK_TYPE_LABELS.get(task_type, task_type)
        return (
            f"Historique planner: {same_type_completed} action(s) de {task_label} ont deja ete realisees, "
            f"derniere le {latest_same_type_at.strftime('%d/%m/%Y')}."
        )

    return None


def _build_planner_rows(machines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    manager = get_manager()
    machine_ids = [str(machine["id"]) for machine in machines]
    alert_counts = fetch_alert_counts(machine_ids)
    open_task_counts = fetch_open_task_counts(machine_ids)
    avg_costs = _load_avg_costs(machine_ids)
    task_history = _load_task_history(machine_ids)

    rows: list[dict[str, Any]] = []
    for machine in machines:
        machine_id = str(machine["id"])
        decision = build_machine_decision_snapshot(
            machine,
            manager,
            alerts_24h=alert_counts.get(machine_id, 0),
            open_tasks=open_task_counts.get(machine_id, 0),
        )

        task_template = decision.get("task_template") or {}
        task_type = str(task_template.get("type") or "inspection")
        avg_cost = float(avg_costs.get(machine_id, 0.0))
        projected_cost, delayed_cost = _projected_cost(avg_cost, decision, task_type)
        history_summary = _summarize_task_history(task_history.get(machine_id, []), task_type)
        task_context = _build_task_history_note(history_summary)
        task_title = _build_task_title(machine, decision, task_template, history_summary)
        task_description = _build_task_description(decision, history_summary)

        rows.append(
            {
                "machine_code": machine["code"],
                "nom": machine.get("nom", ""),
                "region": machine.get("region", ""),
                "status": decision.get("status"),
                "zone": decision.get("zone"),
                "hi": decision.get("hi"),
                "rul_days": decision.get("rul_days"),
                "prediction_mode": decision.get("prediction_mode"),
                "confidence": decision.get("confidence"),
                "urgency_score": decision.get("urgency_score"),
                "urgency_band": decision.get("urgency_band"),
                "urgency_label": decision.get("urgency_label"),
                "urgency_hex": decision.get("urgency_hex"),
                "risk_score": decision.get("urgency_score"),
                "risk_level": decision.get("urgency_band"),
                "risk_label": decision.get("urgency_label"),
                "summary": decision.get("summary"),
                "plain_reason": decision.get("plain_reason"),
                "impact": decision.get("impact"),
                "recommended_action": decision.get("recommended_action"),
                "maintenance_window": decision.get("maintenance_window"),
                "field_checks": decision.get("field_checks", []),
                "evidence": decision.get("evidence", []),
                "data_source": decision.get("data_source"),
                "updated_at": decision.get("updated_at"),
                "age_seconds": decision.get("age_seconds"),
                "is_stale": decision.get("is_stale"),
                "alerts_24h": alert_counts.get(machine_id, 0),
                "open_tasks": open_task_counts.get(machine_id, 0),
                "projected_cost": projected_cost,
                "delayed_cost": delayed_cost,
                "delay_penalty": delayed_cost - projected_cost,
                "task_context": task_context,
                "similar_open_tasks": history_summary["open_same_type"],
                "recent_completed_tasks": history_summary["recent_completed_same_type"],
                "task_template": task_template,
                "task_suggestion": {
                    "machine_code": machine["code"],
                    "titre": task_title,
                    "type": task_type,
                    "priorite": _priority_from_band(str(decision.get("urgency_band") or "watch")),
                    "date_planifiee": _suggested_date(int(task_template.get("lead_days") or 0)),
                    "cout_estime": projected_cost,
                    "description": task_description,
                    "technicien": "",
                },
            }
        )

    rows.sort(key=lambda row: row.get("urgency_score") or 0, reverse=True)
    return rows


def _render_markdown(rows: list[dict[str, Any]], focus_machine: str | None = None) -> str:
    lines: list[str] = []
    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    priority_rows = [row for row in rows if row["urgency_band"] in {"critical", "priority"}]
    watch_rows = [row for row in rows if row["urgency_band"] == "watch"]
    uncertain_rows = [row for row in rows if row["data_source"] in {"persisted_reference", "no_data"}]

    lines.append("# Plan de maintenance structure")
    lines.append(f"*Genere le {now}*")
    lines.append("")
    lines.append("## 1. Resume executif")
    if focus_machine:
        lines.append(f"- Focus demande sur **{get_machine_public_label(focus_machine)}**.")
    lines.append(f"- **{len(priority_rows)}** machine(s) a traiter rapidement.")
    lines.append(f"- **{len(watch_rows)}** machine(s) a suivre de pres.")
    if uncertain_rows:
        lines.append(
            f"- **{len(uncertain_rows)}** machine(s) s'appuient sur une reference figee ou un flux incomplet : "
            + ", ".join(
                get_machine_public_label(row["machine_code"], row.get("nom")) for row in uncertain_rows
            )
            + "."
        )

    lines.append("")
    lines.append("## 2. Classement des risques")
    lines.append("| Machine | Priorite | HI | RUL | Action |")
    lines.append("|---|---|---:|---:|---|")
    for row in rows:
        hi = f"{round(float(row['hi']) * 100)}%" if row.get("hi") is not None else "-"
        rul = f"{row['rul_days']} j" if row.get("rul_days") is not None else "-"
        lines.append(
            f"| {get_machine_public_label(row['machine_code'], row.get('nom'))} | {row['urgency_label']} | {hi} | {rul} | {row['recommended_action']} |"
        )

    lines.append("")
    lines.append("## 3. Plan d'action")
    for row in rows:
        task = row["task_suggestion"]
        lines.append(f"### {get_machine_public_label(row['machine_code'], row.get('nom'))}")
        lines.append(f"- **Etat**: {row['summary']}")
        lines.append(f"- **Pourquoi**: {row['plain_reason']}")
        lines.append(f"- **Impact**: {row['impact']}")
        lines.append(f"- **Action recommandee**: {row['recommended_action']}")
        lines.append(
            f"- **Tache proposee**: {task['titre']} ({task['type']}) le {task['date_planifiee']} - {task['cout_estime']} TND"
        )
        if row.get("task_context"):
            lines.append(f"- **Contexte calendrier**: {row['task_context']}")
        if row["evidence"]:
            lines.append(f"- **Preuves**: {' ; '.join(row['evidence'])}")
        if row["field_checks"]:
            lines.append("- **Controles terrain**:")
            for check in row["field_checks"][:3]:
                lines.append(f"  - {check}")
        lines.append("")

    lines.append("## 4. Budget previsionnel")
    total_projected = sum(int(row["projected_cost"]) for row in rows)
    total_penalty = sum(int(row["delay_penalty"]) for row in rows)
    lines.append(f"- Cout total projete des prochaines interventions : **{total_projected} TND**")
    lines.append(f"- Surcout potentiel si la fenetre suivante est manquee : **{total_penalty} TND**")
    lines.append("- Base d'estimation sans historique : main-d'oeuvre 30 DT/h + forfait pieces par type d'action.")

    if uncertain_rows:
        lines.append("")
        lines.append("## 5. Incertitudes et donnees")
        lines.append(
            "Les machines ci-dessous n'ont pas toutes le meme niveau de fraicheur de donnees. "
            "La recommandation reste utile, mais doit etre confirmee sur le terrain :"
        )
        for row in uncertain_rows:
            source = row["data_source"]
            updated = row["updated_at"] or "indisponible"
            lines.append(
                f"- {get_machine_public_label(row['machine_code'], row.get('nom'))} : "
                f"source `{source}`, derniere lecture `{updated}`"
            )

    return "\n".join(lines)


@router.get("/status")
async def fleet_risk_status(user: CurrentUser = Depends(require_admin)):
    rows = _build_planner_rows(_load_machines())
    return [
        {
            "machine_code": row["machine_code"],
            "nom": row["nom"],
            "region": row["region"],
            "hi": row["hi"],
            "rul_days": row["rul_days"],
            "zone": row["zone"],
            "risk_score": row["risk_score"],
            "risk_level": row["risk_level"],
            "risk_label": row["risk_label"],
            "summary": row["summary"],
            "recommended_action": row["recommended_action"],
            "maintenance_window": row["maintenance_window"],
            "open_tasks": row["open_tasks"],
            "data_source": row["data_source"],
            "updated_at": row["updated_at"],
            "is_stale": row["is_stale"],
        }
        for row in rows
    ]


@router.post("/generate")
async def generate_plan(body: PlanRequest, user: CurrentUser = Depends(require_admin)):
    machines = _load_machines(body.focus_machine)
    if body.focus_machine and not machines:
        raise HTTPException(404, f"Machine '{body.focus_machine}' introuvable")

    rows = _build_planner_rows(machines)
    markdown = _render_markdown(rows, body.focus_machine)
    tasks = [row["task_suggestion"] for row in rows if row["urgency_band"] != "stable"]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "focus_machine": body.focus_machine,
        "markdown": markdown,
        "tasks": tasks,
        "fleet": rows,
    }


@router.post("/approve")
async def approve_task(
    body: ApproveTaskRequest,
    user: CurrentUser = Depends(require_admin),
):
    manager = get_manager()
    sb = get_supabase()

    uuid = manager.get_uuid(body.machine_code)
    if not uuid:
        raise HTTPException(404, f"Machine '{body.machine_code}' not found")

    existing_tasks: list[dict[str, Any]] = []
    try:
        existing = (
            sb.table("gmao_taches")
            .select("id, titre, type, statut, created_at, date_planifiee")
            .eq("machine_id", uuid)
            .order("created_at", desc=True)
            .execute()
        )
        existing_tasks = existing.data or []
    except Exception as exc:
        logger.warning("Planner could not inspect existing tasks for %s: %s", body.machine_code, exc)

    repeat_note = _build_approval_repeat_note(
        existing_tasks,
        title=body.titre,
        task_type=body.type,
    )

    description_parts = ["[Agent planificateur]"]
    if repeat_note:
        description_parts.append(repeat_note)
    if body.description.strip():
        description_parts.append(body.description.strip())

    insert_data = {
        "machine_id": uuid,
        "titre": body.titre,
        "description": " ".join(description_parts).strip(),
        "statut": "planifiee",
        "type": body.type,
        "priorite": body.priorite,
    }
    if body.date_planifiee:
        insert_data["date_planifiee"] = body.date_planifiee
    if body.cout_estime is not None:
        insert_data["cout_estime"] = body.cout_estime
    if body.technicien:
        insert_data["technicien"] = body.technicien

    try:
        sb.table("gmao_taches").insert(insert_data).execute()
    except Exception as exc:
        logger.error("GMAO insert error: %s", exc)
        raise HTTPException(500, "Echec de creer la tache")

    logger.info(
        "Planner approved task '%s' for %s by %s",
        body.titre,
        body.machine_code,
        user.email,
    )

    return {
        "status": "ok",
        "message": f"Tache '{body.titre}' creee pour {body.machine_code}",
        "machine_code": body.machine_code,
        "repeat_note": repeat_note,
    }
