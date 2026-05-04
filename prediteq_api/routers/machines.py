import logging
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.audit import log_audit
from core.auth import CurrentUser, get_machine_filter, require_admin, require_auth
from core.demo_context import get_surfaceable_demo_scenario
from core.decision_snapshot import (
    build_machine_decision_snapshot,
    fetch_alert_counts,
    fetch_open_task_counts,
)
from core.supabase_client import get_supabase
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/machines", tags=["machines"])

_MACHINE_CODE_RE = re.compile(r"^[A-Z]{2,5}-[A-Z0-9]{1,5}$")


class MachineCreateRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=32)
    name: str = Field(..., min_length=2, max_length=200)
    city: str = ""
    lat: float = 0.0
    lon: float = 0.0
    model: str = ""
    floors: int = 0
    loc: str = ""
    status: Literal["ok", "degraded", "critical", "maintenance"] = "ok"
    hi: float | None = None
    rul: float | None = None


class MachineUpdateRequest(BaseModel):
    name: str | None = None
    city: str | None = None
    lat: float | None = None
    lon: float | None = None
    model: str | None = None
    floors: int | None = None
    loc: str | None = None
    status: Literal["ok", "degraded", "critical", "maintenance"] | None = None
    hi: float | None = None
    rul: float | None = None


def _zone_to_statut(zone: str | None, hi: float | None = None) -> str:
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


def _status_to_db(status: str) -> str:
    if status == "ok":
        return "operational"
    if status == "maintenance":
        return "maintenance"
    if status == "critical":
        return "critical"
    return "degraded"


def _sync_machine_cache(manager, machine: dict) -> None:
    code = machine.get("code")
    if not code:
        return
    manager.machine_cache[code] = {
        **manager.machine_cache.get(code, {}),
        **machine,
    }


def _attach_rul_v2_summary(manager, machine: dict) -> None:
    try:
        from routers.diagnostics_rul import build_rul_v2_response

        machine["rul_v2"] = build_rul_v2_response(manager, machine["code"])
    except HTTPException as exc:
        # 404/425 are normal during engine warmup or before the simulator
        # has seeded a machine; expose no summary without polluting logs.
        if exc.status_code in {404, 425}:
            machine["rul_v2"] = None
            return
        logger.warning("Could not build RUL v2 summary for %s: %s", machine.get("code"), exc)
        machine["rul_v2"] = None
    except Exception as exc:
        logger.warning("Could not build RUL v2 summary for %s: %s", machine.get("code"), exc)
        machine["rul_v2"] = None


def _attach_runtime_view(machine: dict, manager) -> None:
    code = machine["code"]
    machine["engine_status"] = manager.get_status(code)

    live = manager.last_results.get(code)
    if live and live.get("hi_smooth") is not None:
        live_hi = float(live["hi_smooth"])
        live_zone = live.get("zone")
        machine["hi_courant"] = round(live_hi, 4)
        machine["statut"] = _zone_to_statut(live_zone, live_hi)
        machine["zone_live"] = live_zone

    demo_scenario = get_surfaceable_demo_scenario(code)
    if demo_scenario is not None:
        machine["demo_scenario"] = demo_scenario

    _attach_rul_v2_summary(manager, machine)

    raw = manager.last_raw.get(code)
    if raw:
        machine["last_sensors"] = {
            "rms_mms": round(raw.get("rms_mms", 0), 3),
            "vibration_rms": round(raw.get("vibration_rms", raw.get("rms_mms", 0)), 3),
            "power_kw": round(raw.get("power_kw", 0), 3),
            "temp_c": round(raw.get("temp_c", 0), 1),
            "humidity_rh": round(raw.get("humidity_rh", 0), 1),
            "observed_at": raw.get("observed_at"),
            "source": raw.get("source", "runtime_ingest"),
        }
        if raw.get("current_a") is not None:
            machine["last_sensors"]["current_a"] = round(raw.get("current_a", 0), 3)
        if raw.get("load_kg") is not None:
            machine["last_sensors"]["load_kg"] = round(raw.get("load_kg", 0), 1)
        if raw.get("vibration_raw") is not None:
            machine["last_sensors"]["vibration_raw"] = round(raw.get("vibration_raw", 0), 3)
        if raw.get("status") is not None:
            machine["last_sensors"]["status"] = raw.get("status")
    else:
        machine["last_sensors"] = None

    machine["cycles_today"] = manager._cycle_counts.get(code)
    machine["last_result"] = manager.last_results.get(code)
    machine["rul_live"] = manager.predict_rul(code)


def _attach_decision_bundle(machines: list[dict], manager) -> None:
    if not machines:
        return

    alert_counts = fetch_alert_counts([machine["id"] for machine in machines])
    open_task_counts = fetch_open_task_counts([machine["id"] for machine in machines])

    for machine in machines:
        machine["anom_count"] = alert_counts.get(machine["id"], 0)
        machine["open_task_count"] = open_task_counts.get(machine["id"], 0)
        try:
            machine["decision"] = build_machine_decision_snapshot(
                machine,
                manager,
                alerts_24h=machine["anom_count"],
                open_tasks=machine["open_task_count"],
                rul_v2=machine.get("rul_v2"),
            )
        except Exception as exc:
            logger.warning(
                "Could not build decision snapshot for %s: %s",
                machine.get("code"),
                exc,
            )
            machine["decision"] = None


@router.get("")
async def list_machines(user: CurrentUser = Depends(require_auth)):
    sb = get_supabase()
    try:
        query = sb.table("machines").select("*").order("code")
        machine_filter = get_machine_filter(user)
        if machine_filter:
            query = query.eq("id", machine_filter)
        result = query.execute()
        machines = result.data or []
    except Exception as exc:
        logger.error("DB error in list_machines: %s", exc)
        raise HTTPException(502, "Erreur de base de données")

    manager = get_manager()
    for machine in machines:
        _attach_runtime_view(machine, manager)
    _attach_decision_bundle(machines, manager)

    return machines


@router.post("")
async def create_machine(
    body: MachineCreateRequest,
    user: CurrentUser = Depends(require_admin),
):
    code = body.code.strip().upper()
    if not _MACHINE_CODE_RE.match(code):
        raise HTTPException(400, "Code machine invalide")

    payload = {
        "code": code,
        "nom": body.name,
        "region": body.city,
        "latitude": body.lat,
        "longitude": body.lon,
        "modele": body.model,
        "etages": body.floors,
        "emplacement": body.loc,
        "statut": _status_to_db(body.status),
        "hi_courant": body.hi,
        "rul_courant": body.rul,
        "derniere_maj": datetime.now(timezone.utc).isoformat(),
    }

    sb = get_supabase()
    try:
        result = sb.table("machines").insert(payload).execute()
    except Exception as exc:
        logger.error("Machine create failed for %s: %s", code, exc)
        if "duplicate" in str(exc).lower():
            raise HTTPException(409, f"Machine '{code}' deja existante")
        raise HTTPException(502, "Erreur de base de donnees")

    created = (result.data or [{}])[0]
    _sync_machine_cache(get_manager(), created)
    log_audit(user.id, user.email, "machine.create", {"machine_code": code})
    return {"status": "ok", "machine_code": code}


@router.patch("/{machine_code}")
async def update_machine(
    machine_code: str,
    body: MachineUpdateRequest,
    user: CurrentUser = Depends(require_admin),
):
    if not _MACHINE_CODE_RE.match(machine_code):
        raise HTTPException(400, "Code machine invalide")

    payload = {}
    if body.name is not None:
        payload["nom"] = body.name
    if body.city is not None:
        payload["region"] = body.city
    if body.lat is not None:
        payload["latitude"] = body.lat
    if body.lon is not None:
        payload["longitude"] = body.lon
    if body.model is not None:
        payload["modele"] = body.model
    if body.floors is not None:
        payload["etages"] = body.floors
    if body.loc is not None:
        payload["emplacement"] = body.loc
    if body.status is not None:
        payload["statut"] = _status_to_db(body.status)
    if body.hi is not None:
        payload["hi_courant"] = body.hi
    if body.rul is not None:
        payload["rul_courant"] = body.rul

    if not payload:
        return {"status": "ok", "machine_code": machine_code}

    sb = get_supabase()
    try:
        existing = (
            sb.table("machines")
            .select("*")
            .eq("code", machine_code)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Machine lookup failed for %s: %s", machine_code, exc)
        raise HTTPException(502, "Erreur de base de donnees")

    if not existing.data:
        raise HTTPException(404, f"Machine '{machine_code}' introuvable")

    try:
        sb.table("machines").update(payload).eq("code", machine_code).execute()
        refreshed = (
            sb.table("machines")
            .select("*")
            .eq("code", machine_code)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Machine update failed for %s: %s", machine_code, exc)
        raise HTTPException(502, "Erreur de base de donnees")

    if refreshed.data:
        _sync_machine_cache(get_manager(), refreshed.data[0])

    log_audit(user.id, user.email, "machine.update", {"machine_code": machine_code})
    return {"status": "ok", "machine_code": machine_code}


@router.delete("/{machine_code}")
async def delete_machine(
    machine_code: str,
    user: CurrentUser = Depends(require_admin),
):
    if not _MACHINE_CODE_RE.match(machine_code):
        raise HTTPException(400, "Code machine invalide")

    sb = get_supabase()
    try:
        existing = (
            sb.table("machines")
            .select("id, code")
            .eq("code", machine_code)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Machine delete lookup failed for %s: %s", machine_code, exc)
        raise HTTPException(502, "Erreur de base de donnees")

    if not existing.data:
        raise HTTPException(404, f"Machine '{machine_code}' introuvable")

    try:
        sb.table("machines").delete().eq("code", machine_code).execute()
    except Exception as exc:
        logger.error("Machine delete failed for %s: %s", machine_code, exc)
        raise HTTPException(502, "Erreur de base de donnees")

    manager = get_manager()
    manager.reset(machine_code)
    manager.machine_cache.pop(machine_code, None)

    log_audit(user.id, user.email, "machine.delete", {"machine_code": machine_code})
    return {"status": "ok", "machine_code": machine_code}


@router.get("/{machine_code}")
async def get_machine(machine_code: str, user: CurrentUser = Depends(require_auth)):
    if not _MACHINE_CODE_RE.match(machine_code):
        raise HTTPException(400, "Code machine invalide")

    sb = get_supabase()
    try:
        result = sb.table("machines").select("*").eq("code", machine_code).execute()
    except Exception as exc:
        logger.error("DB error in get_machine %s: %s", machine_code, exc)
        raise HTTPException(502, "Erreur de base de données")

    if not result.data:
        raise HTTPException(404, f"Machine '{machine_code}' not found")

    machine = result.data[0]
    machine_filter = get_machine_filter(user)
    if machine_filter and machine["id"] != machine_filter:
        raise HTTPException(403, "Acces interdit a cette machine")

    manager = get_manager()
    _attach_runtime_view(machine, manager)
    _attach_decision_bundle([machine], manager)

    return machine


@router.get("/{machine_code}/sensors")
async def get_sensor_history(
    machine_code: str,
    user: CurrentUser = Depends(require_auth),
):
    manager = get_manager()

    machine_filter = get_machine_filter(user)
    if machine_filter:
        uuid = manager.get_uuid(machine_code)
        if not uuid or uuid != machine_filter:
            raise HTTPException(403, "Acces interdit a cette machine")

    history = manager.sensor_history.get(machine_code)
    if history:
        return list(history)

    return []


import time as _time

_recent_resets: dict[str, float] = {}


@router.post("/reset/{machine_code}")
async def reset_after_maintenance(
    machine_code: str,
    user: CurrentUser = Depends(require_auth),
):
    if not _MACHINE_CODE_RE.match(machine_code):
        raise HTTPException(400, "Code machine invalide")

    now = _time.time()
    if machine_code in _recent_resets and (now - _recent_resets[machine_code]) < 300:
        raise HTTPException(429, "Reset appele trop recemment - attendez 5 minutes")
    _recent_resets[machine_code] = now

    sb = get_supabase()
    manager = get_manager()

    uuid = manager.get_uuid(machine_code)
    if not uuid:
        raise HTTPException(404, f"Machine '{machine_code}' not found in cache")

    machine_filter = get_machine_filter(user)
    if machine_filter and uuid != machine_filter:
        raise HTTPException(403, "Acces interdit a cette machine")

    manager.reset(machine_code)

    try:
        sb.table("machines").update(
            {
                "statut": "operational",
                "hi_courant": 1.0,
                "rul_courant": None,
                "derniere_maj": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", uuid).execute()

        sb.table("alertes").insert(
            {
                "machine_id": uuid,
                "type": "hi",
                "titre": f"Reset post-maintenance - {machine_code}",
                "description": "Reset post-maintenance effectue. Buffers reinitialises.",
                "severite": "info",
            }
        ).execute()
    except Exception as exc:
        logger.error("Reset DB update error for %s: %s", machine_code, exc)
        raise HTTPException(502, "Reset effectue en memoire mais erreur DB")

    log_audit(user.id, user.email, "machine.reset", {"machine_code": machine_code})

    return {
        "status": "ok",
        "machine_code": machine_code,
        "message": "Engine reset, status -> operational",
    }
