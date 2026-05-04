import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from core.supabase_client import get_supabase
from core.auth import CurrentUser, require_auth, get_machine_filter
from core.email_history import read_email_events

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    machine_code: str | None = Query(None, description="Filter by machine code"),
    machine_id: str | None = Query(None, description="Filter by machine UUID"),
    severite: str | None = Query(None, description="Filter by severity"),
    limit: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_auth),
):
    """GET /alerts — list alerts, scoped by user's machine."""
    sb = get_supabase()
    try:
        query = sb.table('alertes').select(
            '*, machines!inner(code, nom)'
        ).order('created_at', desc=True).limit(limit)

        # Machine scoping: non-admin users only see their machine's alerts
        machine_filter = get_machine_filter(user)
        if machine_filter:
            query = query.eq('machine_id', machine_filter)
        elif machine_id:
            query = query.eq('machine_id', machine_id)
        elif machine_code:
            query = query.eq('machines.code', machine_code)

        if severite:
            query = query.eq('severite', severite)

        result = query.execute()
        return result.data
    except Exception as e:
        logger.error("DB error in list alerts: %s", e)
        raise HTTPException(502, "Erreur base de données")


@router.get("/email-history")
async def list_alert_email_history(
    machine_code: str | None = Query(None, description="Filter by machine code"),
    machine_id: str | None = Query(None, description="Filter by machine UUID"),
    limit: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_auth),
):
    """GET /alerts/email-history — recent alert email attempts."""
    try:
        machine_filter = get_machine_filter(user)
        scoped_machine_id = machine_filter or machine_id

        rows = read_email_events(limit=limit * 4)
        filtered: list[dict] = []

        for row in rows:
            row_machine_id = str(row.get("machine_id") or "")
            row_machine_code = str(row.get("machine_code") or "")

            if scoped_machine_id and row_machine_id != scoped_machine_id:
                continue
            if not scoped_machine_id and machine_code and row_machine_code != machine_code:
                continue

            filtered.append(
                {
                    "id": row.get("id"),
                    "machine_id": row_machine_id,
                    "machine_code": row_machine_code,
                    "machine_name": row.get("machine_name"),
                    "recipient_email": row.get("recipient_email"),
                    "success": bool(row.get("success")),
                    "type": row.get("type") or "hi",
                    "source": row.get("source") or "scheduler",
                    "severity": row.get("severity"),
                    "subject": row.get("subject"),
                    "note": row.get("note"),
                    "created_at": row.get("created_at"),
                }
            )
            if len(filtered) >= limit:
                break

        return filtered
    except Exception as e:
        logger.error("Error in list alert email history: %s", e)
        raise HTTPException(502, "Erreur historique emails")


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, user: CurrentUser = Depends(require_auth)):
    """POST /alerts/{id}/acknowledge — mark alert as acknowledged."""
    sb = get_supabase()

    try:
        existing = sb.table('alertes').select('id, machine_id').eq('id', alert_id).execute()
    except Exception as e:
        logger.error("DB error in acknowledge lookup: %s", e)
        raise HTTPException(502, "Erreur base de données")
    if not existing.data:
        raise HTTPException(404, f"Alert '{alert_id}' not found")

    # Enforce machine scoping
    machine_filter = get_machine_filter(user)
    if machine_filter and existing.data[0].get('machine_id') != machine_filter:
        raise HTTPException(403, "Accès interdit à cette alerte")

    try:
        sb.table('alertes').update({'acquitte': True}).eq('id', alert_id).execute()
    except Exception as e:
        logger.error("DB error in acknowledge update: %s", e)
        raise HTTPException(502, "Erreur base de données")
    return {"status": "ok", "alert_id": alert_id, "acquitte": True}
