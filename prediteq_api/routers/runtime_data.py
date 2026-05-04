import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.auth import CurrentUser, get_machine_filter, require_auth
from core.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/runtime-data", tags=["runtime-data"])


TaskStatus = Literal["planifiee", "en_cours", "terminee"]
TaskType = Literal["preventive", "corrective", "inspection"]


class TaskCreateRequest(BaseModel):
    machine_id: str = Field(..., min_length=1)
    titre: str = Field(..., min_length=3, max_length=200)
    description: str = ""
    statut: TaskStatus = "planifiee"
    technicien: str = ""
    date_planifiee: str | None = None
    cout_estime: float | None = None
    type: TaskType = "preventive"


class TaskUpdateRequest(BaseModel):
    description: str | None = None
    statut: TaskStatus | None = None
    technicien: str | None = None
    date_planifiee: str | None = None
    cout_estime: float | None = None
    type: TaskType | None = None


def _normalize_machine_join(row: dict) -> dict:
    machine = row.get("machines")
    if isinstance(machine, list):
        return machine[0] if machine else {}
    if isinstance(machine, dict):
        return machine
    return {}


def _resolve_machine_scope(user: CurrentUser, requested_machine_id: str | None) -> str | None:
    machine_filter = get_machine_filter(user)
    if not machine_filter:
        return requested_machine_id
    if requested_machine_id and requested_machine_id != machine_filter:
        raise HTTPException(403, "Acces interdit a cette machine")
    return machine_filter


def _load_task_for_update(task_id: str) -> dict:
    sb = get_supabase()
    try:
        result = (
            sb.table("gmao_taches")
            .select("id, machine_id")
            .eq("id", task_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Task lookup failed for %s: %s", task_id, exc)
        raise HTTPException(502, "Erreur base de donnees")

    if not result.data:
        raise HTTPException(404, f"Tache '{task_id}' introuvable")
    return result.data[0]


@router.get("/costs")
async def list_costs(
    machine_id: str | None = Query(None, description="Machine UUID"),
    limit: int = Query(120, ge=1, le=500),
    user: CurrentUser = Depends(require_auth),
):
    effective_machine_id = _resolve_machine_scope(user, machine_id)
    sb = get_supabase()

    try:
        query = (
            sb.table("couts")
            .select("*, machines(code)")
            .order("annee", desc=False)
            .order("mois", desc=False)
            .limit(limit)
        )
        if effective_machine_id:
            query = query.eq("machine_id", effective_machine_id)
        result = query.execute()
    except Exception as exc:
        logger.error("Cost list failed: %s", exc)
        raise HTTPException(502, "Erreur base de donnees")

    rows = []
    for row in result.data or []:
        machine = _normalize_machine_join(row)
        rows.append(
            {
                "id": row.get("id", ""),
                "machineId": row.get("machine_id", ""),
                "machineCode": machine.get("code", ""),
                "mois": row.get("mois", 1),
                "annee": row.get("annee", 2026),
                "mainOeuvre": row.get("main_oeuvre", 0),
                "pieces": row.get("pieces", 0),
                "total": row.get("total", 0),
            }
        )

    return rows


@router.get("/hi-history")
async def list_hi_history(
    machine_id: str = Query(..., description="Machine UUID"),
    days: int = Query(90, ge=1, le=365),
    limit: int = Query(4000, ge=1, le=10000),
    user: CurrentUser = Depends(require_auth),
):
    effective_machine_id = _resolve_machine_scope(user, machine_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    sb = get_supabase()

    try:
        result = (
            sb.table("historique_hi")
            .select("id, machine_id, valeur_hi, hi, created_at")
            .eq("machine_id", effective_machine_id)
            .gte("created_at", since.isoformat())
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        logger.error("HI history failed for %s: %s", effective_machine_id, exc)
        raise HTTPException(502, "Erreur base de donnees")

    return [
        {
            "id": row.get("id", ""),
            "machineId": row.get("machine_id", ""),
            "hi": row.get("valeur_hi", row.get("hi", 0)),
            "createdAt": row.get("created_at", ""),
        }
        for row in (result.data or [])
    ]


@router.get("/tasks")
async def list_tasks(
    machine_id: str | None = Query(None, description="Machine UUID"),
    limit: int = Query(200, ge=1, le=1000),
    user: CurrentUser = Depends(require_auth),
):
    effective_machine_id = _resolve_machine_scope(user, machine_id)
    sb = get_supabase()

    try:
        query = (
            sb.table("gmao_taches")
            .select("*, machines(code)")
            .order("created_at", desc=True)
            .limit(limit)
        )
        if effective_machine_id:
            query = query.eq("machine_id", effective_machine_id)
        result = query.execute()
    except Exception as exc:
        logger.error("Task list failed: %s", exc)
        raise HTTPException(502, "Erreur base de donnees")

    rows = []
    for row in result.data or []:
        machine = _normalize_machine_join(row)
        rows.append(
            {
                "id": row.get("id", ""),
                "machineId": row.get("machine_id", ""),
                "machineCode": machine.get("code", ""),
                "titre": row.get("titre", ""),
                "description": row.get("description", ""),
                "statut": row.get("statut", "planifiee"),
                "technicien": row.get("technicien", ""),
                "datePlanifiee": row.get("date_planifiee"),
                "coutEstime": row.get("cout_estime"),
                "type": row.get("type", "preventive"),
                "createdAt": row.get("created_at", ""),
            }
        )

    return rows


@router.post("/tasks")
async def create_task(
    body: TaskCreateRequest,
    user: CurrentUser = Depends(require_auth),
):
    effective_machine_id = _resolve_machine_scope(user, body.machine_id)
    sb = get_supabase()

    payload = {
        "machine_id": effective_machine_id,
        "titre": body.titre,
        "description": body.description,
        "statut": body.statut,
        "technicien": body.technicien,
        "type": body.type,
    }
    if body.date_planifiee:
        payload["date_planifiee"] = body.date_planifiee
    if body.cout_estime is not None:
        payload["cout_estime"] = body.cout_estime

    try:
        result = sb.table("gmao_taches").insert(payload).execute()
    except Exception as exc:
        logger.error("Task create failed: %s", exc)
        raise HTTPException(502, "Erreur base de donnees")

    created = (result.data or [{}])[0]
    return {
        "status": "ok",
        "taskId": created.get("id", ""),
    }


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdateRequest,
    user: CurrentUser = Depends(require_auth),
):
    task = _load_task_for_update(task_id)
    _resolve_machine_scope(user, task.get("machine_id"))
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        return {"status": "ok", "taskId": task_id}

    sb = get_supabase()
    try:
        sb.table("gmao_taches").update(payload).eq("id", task_id).execute()
    except Exception as exc:
        logger.error("Task update failed for %s: %s", task_id, exc)
        raise HTTPException(502, "Erreur base de donnees")

    return {"status": "ok", "taskId": task_id}


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user: CurrentUser = Depends(require_auth),
):
    task = _load_task_for_update(task_id)
    _resolve_machine_scope(user, task.get("machine_id"))
    sb = get_supabase()

    try:
        sb.table("gmao_taches").delete().eq("id", task_id).execute()
    except Exception as exc:
        logger.error("Task delete failed for %s: %s", task_id, exc)
        raise HTTPException(502, "Erreur base de donnees")

    return {"status": "ok", "taskId": task_id}
