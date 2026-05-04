"""
Structured maintenance planner.

The planner now relies on the shared decision snapshot used elsewhere in the
app. It returns a deterministic JSON payload for risk ranking and proposed
tasks, so the frontend no longer has to parse free-form AI markdown.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth import CurrentUser, require_admin
from core.decision_snapshot import (
    build_machine_decision_snapshot,
    fetch_alert_counts,
    fetch_open_task_counts,
)
from core.supabase_client import get_supabase
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/planner", tags=["planner"])


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


def _load_machines(focus_machine: str | None = None) -> list[dict]:
    sb = get_supabase()
    try:
        query = sb.table("machines").select("*").order("code")
        if focus_machine:
            query = query.eq("code", focus_machine)
        result = query.execute()
        return result.data or []
    except Exception as exc:
        logger.error("Planner machine load failed: %s", exc)
        raise HTTPException(502, "Erreur de base de données")


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
        machine_id: (sum(values) / len(values) if values else 320.0)
        for machine_id, values in averages.items()
    }


def _suggested_date(days_from_now: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=max(days_from_now, 0))).date().isoformat()


def _priority_from_band(band: str) -> str:
    if band == "critical":
        return "haute"
    if band == "priority":
        return "moyenne"
    return "basse"


def _projected_cost(avg_cost: float, decision: dict) -> tuple[int, int]:
    budget = decision.get("budget_model") or {}
    multiplier = float(budget.get("multiplier") or 1.0)
    delay_multiplier = float(budget.get("delay_multiplier") or 1.05)
    projected = int(round(max(avg_cost, 320.0) * multiplier))
    delayed = int(round(projected * delay_multiplier))
    return projected, delayed


def _build_planner_rows(machines: list[dict]) -> list[dict]:
    manager = get_manager()
    machine_ids = [machine["id"] for machine in machines]
    alert_counts = fetch_alert_counts(machine_ids)
    open_task_counts = fetch_open_task_counts(machine_ids)
    avg_costs = _load_avg_costs(machine_ids)

    rows: list[dict] = []
    for machine in machines:
        decision = build_machine_decision_snapshot(
            machine,
            manager,
            alerts_24h=alert_counts.get(machine["id"], 0),
            open_tasks=open_task_counts.get(machine["id"], 0),
        )

        task_template = decision.get("task_template") or {}
        avg_cost = float(avg_costs.get(machine["id"], 320.0))
        projected_cost, delayed_cost = _projected_cost(avg_cost, decision)

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
                "alerts_24h": alert_counts.get(machine["id"], 0),
                "open_tasks": open_task_counts.get(machine["id"], 0),
                "projected_cost": projected_cost,
                "delayed_cost": delayed_cost,
                "delay_penalty": delayed_cost - projected_cost,
                "task_template": task_template,
                "task_suggestion": {
                    "machine_code": machine["code"],
                    "titre": task_template.get("title", f"Intervention {machine['code']}"),
                    "type": task_template.get("type", "inspection"),
                    "priorite": _priority_from_band(str(decision.get("urgency_band") or "watch")),
                    "date_planifiee": _suggested_date(int(task_template.get("lead_days") or 0)),
                    "cout_estime": projected_cost,
                    "description": (
                        f"{decision.get('recommended_action', '')} "
                        f"Motif: {decision.get('plain_reason', '')}"
                    ).strip(),
                    "technicien": "",
                },
            }
        )

    rows.sort(key=lambda row: row.get("urgency_score") or 0, reverse=True)
    return rows


def _render_markdown(rows: list[dict], focus_machine: str | None = None) -> str:
    lines: list[str] = []
    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    priority_rows = [row for row in rows if row["urgency_band"] in {"critical", "priority"}]
    watch_rows = [row for row in rows if row["urgency_band"] == "watch"]
    uncertain_rows = [row for row in rows if row["data_source"] in {"persisted_reference", "no_data"}]

    lines.append("# Plan de maintenance structuré")
    lines.append(f"*Généré le {now}*")
    lines.append("")
    lines.append("## 1. Résumé exécutif")
    if focus_machine:
        lines.append(f"- Focus demande sur **{focus_machine}**.")
    lines.append(f"- **{len(priority_rows)}** machine(s) à traiter rapidement.")
    lines.append(f"- **{len(watch_rows)}** machine(s) à suivre de près.")
    if uncertain_rows:
        lines.append(
            f"- **{len(uncertain_rows)}** machine(s) s'appuient sur une référence figée ou un flux incomplet : "
            + ", ".join(row["machine_code"] for row in uncertain_rows)
            + "."
        )
    lines.append("")
    lines.append("## 2. Classement des risques")
    lines.append("| Machine | Priorité | HI | RUL | Action |")
    lines.append("|---|---|---:|---:|---|")
    for row in rows:
        hi = f"{round(float(row['hi']) * 100)}%" if row.get("hi") is not None else "-"
        rul = f"{row['rul_days']} j" if row.get("rul_days") is not None else "-"
        lines.append(
            f"| {row['machine_code']} | {row['urgency_label']} | {hi} | {rul} | {row['recommended_action']} |"
        )
    lines.append("")
    lines.append("## 3. Plan d'action")
    for row in rows:
        task = row["task_suggestion"]
        lines.append(f"### {row['machine_code']} - {row['nom']}")
        lines.append(f"- **État**: {row['summary']}")
        lines.append(f"- **Pourquoi**: {row['plain_reason']}")
        lines.append(f"- **Impact**: {row['impact']}")
        lines.append(f"- **Action recommandée**: {row['recommended_action']}")
        lines.append(
            f"- **Tâche proposée**: {task['titre']} ({task['type']}) le {task['date_planifiee']} - {task['cout_estime']} TND"
        )
        if row["evidence"]:
            lines.append(f"- **Preuves**: {' ; '.join(row['evidence'])}")
        if row["field_checks"]:
            lines.append("- **Contrôles terrain**:")
            for check in row["field_checks"][:3]:
                lines.append(f"  - {check}")
        lines.append("")
    lines.append("## 4. Budget prévisionnel")
    total_projected = sum(int(row["projected_cost"]) for row in rows)
    total_penalty = sum(int(row["delay_penalty"]) for row in rows)
    lines.append(f"- Coût total projeté des prochaines interventions : **{total_projected} TND**")
    lines.append(f"- Surcoût potentiel si la fenêtre suivante est manquée : **{total_penalty} TND**")
    if uncertain_rows:
        lines.append("")
        lines.append("## 5. Incertitudes et données")
        lines.append(
            "Les machines ci-dessous n'ont pas toutes le même niveau de fraîcheur de données. "
            "La recommandation reste utile, mais doit être confirmée sur le terrain :"
        )
        for row in uncertain_rows:
            source = row["data_source"]
            updated = row["updated_at"] or "indisponible"
            lines.append(f"- {row['machine_code']} : source `{source}`, dernière lecture `{updated}`")
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
            "risk_score": row["urgency_score"],
            "risk_level": row["urgency_band"],
            "risk_label": row["urgency_label"],
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

    try:
        existing = (
            sb.table("gmao_taches")
            .select("id, titre")
            .eq("machine_id", uuid)
            .in_("statut", ["planifiee", "en_cours"])
            .execute()
        )
        for task in existing.data or []:
            if task.get("titre", "").lower() == body.titre.lower():
                raise HTTPException(409, f"Tâche similaire déjà ouverte : {task['titre']}")
    except HTTPException:
        raise
    except Exception:
        pass

    insert_data = {
        "machine_id": uuid,
        "titre": body.titre,
        "description": f"[Agent planificateur] {body.description}",
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
        raise HTTPException(500, "Échec de créer la tâche")

    logger.info(
        "Planner approved task '%s' for %s by %s",
        body.titre,
        body.machine_code,
        user.email,
    )

    return {
        "status": "ok",
        "message": f"Tâche '{body.titre}' créée pour {body.machine_code}",
        "machine_code": body.machine_code,
    }
