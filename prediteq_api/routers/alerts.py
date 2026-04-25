import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from core.supabase_client import get_supabase
from core.auth import CurrentUser, require_auth, get_machine_filter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    machine_code: str | None = Query(None, description="Filter by machine code"),
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
        elif machine_code:
            query = query.eq('machines.code', machine_code)

        if severite:
            query = query.eq('severite', severite)

        result = query.execute()
        return result.data
    except Exception as e:
        logger.error("DB error in list alerts: %s", e)
        raise HTTPException(502, "Erreur base de données")


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
