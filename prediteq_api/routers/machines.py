import logging
import re
from typing import Optional
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from core.supabase_client import get_supabase
from core.auth import CurrentUser, require_auth, require_admin, get_machine_filter
from core.audit import log_audit
from ml.engine_manager import get_manager

# Valid machine code pattern: ASC-XX where X is alphanumeric
_MACHINE_CODE_RE = re.compile(r'^[A-Z]{2,5}-[A-Z0-9]{1,5}$')

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/machines", tags=["machines"])

# Static demo sensor data for machines without live engine data (B2, C3)
_DEMO_SENSORS: dict[str, dict] = {
    'ASC-B2': {'rms_mms': 3.1, 'power_kw': 2.34, 'temp_c': 27.1, 'humidity_rh': 44.0},
    'ASC-C3': {'rms_mms': 6.8, 'power_kw': 2.49, 'temp_c': 31.2, 'humidity_rh': 51.0},
}
_DEMO_CYCLES: dict[str, int] = {'ASC-B2': 22, 'ASC-C3': 8}


@router.get("")
async def list_machines(user: CurrentUser = Depends(require_auth)):
    """GET /machines — scoped by user's machine_id."""
    sb = get_supabase()
    try:
        query = sb.table('machines').select('*').order('code')

        machine_filter = get_machine_filter(user)
        if machine_filter:
            query = query.eq('id', machine_filter)

        result = query.execute()
        machines = result.data
    except Exception as e:
        logger.error("DB error in list machines: %s", e)
        raise HTTPException(502, "Erreur base de données")

    manager = get_manager()
    for m in machines:
        status = manager.get_status(m['code'])
        m['engine_status'] = status
        # Attach latest raw sensor values from simulator/MQTT
        raw = manager.last_raw.get(m['code'])
        if raw:
            m['last_sensors'] = {
                'rms_mms': round(raw.get('rms_mms', 0), 3),
                'power_kw': round(raw.get('power_kw', 0), 3),
                'temp_c': round(raw.get('temp_c', 0), 1),
                'humidity_rh': round(raw.get('humidity_rh', 0), 1),
            }
        elif m['code'] in _DEMO_SENSORS:
            m['last_sensors'] = _DEMO_SENSORS[m['code']]
        # Cycle count from engine
        m['cycles_today'] = manager._cycle_counts.get(m['code'], 0) or _DEMO_CYCLES.get(m['code'], 0)

    # Batch-fetch anomaly counts (alertes in last 24h) per machine
    try:
        since_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        anom_query = sb.table('alertes').select('machine_id').gte('created_at', since_24h)
        if machine_filter:
            anom_query = anom_query.eq('machine_id', machine_filter)
        anom_res = anom_query.execute()
        anom_counts: dict[str, int] = {}
        for a in (anom_res.data or []):
            mid = a.get('machine_id', '')
            anom_counts[mid] = anom_counts.get(mid, 0) + 1
        for m in machines:
            m['anom_count'] = anom_counts.get(m['id'], 0)
    except Exception:
        pass  # non-critical

    return machines


@router.get("/{machine_code}")
async def get_machine(machine_code: str, user: CurrentUser = Depends(require_auth)):
    """GET /machines/{code} — single machine with engine + RUL info."""
    if not _MACHINE_CODE_RE.match(machine_code):
        raise HTTPException(400, "Code machine invalide")
    sb = get_supabase()
    try:
        result = sb.table('machines').select('*').eq('code', machine_code).execute()
    except Exception as e:
        logger.error("DB error in get machine %s: %s", machine_code, e)
        raise HTTPException(502, "Erreur base de données")
    if not result.data:
        raise HTTPException(404, f"Machine '{machine_code}' not found")

    machine = result.data[0]

    # Enforce machine scoping for non-admin users
    machine_filter = get_machine_filter(user)
    if machine_filter and machine['id'] != machine_filter:
        raise HTTPException(403, "Accès interdit à cette machine")

    manager = get_manager()
    machine['engine_status'] = manager.get_status(machine_code)
    machine['last_result'] = manager.last_results.get(machine_code)

    rul = manager.predict_rul(machine_code)
    machine['rul_live'] = rul

    return machine


@router.get("/{machine_code}/sensors")
async def get_sensor_history(machine_code: str,
                             user: CurrentUser = Depends(require_auth)):
    """GET /machines/{code}/sensors — rolling sensor time-series for charts."""
    manager = get_manager()

    # Enforce machine scoping for non-admin users
    machine_filter = get_machine_filter(user)
    if machine_filter:
        uuid = manager.get_uuid(machine_code)
        if not uuid or uuid != machine_filter:
            raise HTTPException(403, "Accès interdit à cette machine")

    history = manager.sensor_history.get(machine_code)
    if history:
        return list(history)

    # Return static demo history for demo machines
    demo = _DEMO_SENSORS.get(machine_code)
    if demo:
        import random
        now = datetime.now(timezone.utc)
        pts = []
        # Smooth random walk — small drift per step for plausible curves
        rms = demo['rms_mms']
        pkw = demo['power_kw']
        tmp = demo['temp_c']
        for i in range(36):
            ts = now - timedelta(minutes=(35 - i) * 10)
            rms += random.uniform(-0.15, 0.15)
            pkw += random.uniform(-0.05, 0.05)
            tmp += random.uniform(-0.3, 0.3)
            # Keep values near the base with gentle pull-back
            rms = rms * 0.95 + demo['rms_mms'] * 0.05
            pkw = pkw * 0.95 + demo['power_kw'] * 0.05
            tmp = tmp * 0.95 + demo['temp_c'] * 0.05
            pts.append({
                'ts': ts.isoformat(),
                'rms_mms': round(rms, 3),
                'power_kw': round(pkw, 3),
                'temp_c': round(tmp, 1),
            })
        return pts

    return []


import time as _time
_recent_resets: dict[str, float] = {}


@router.post("/reset/{machine_code}")
async def reset_after_maintenance(machine_code: str,
                                   admin: CurrentUser = Depends(require_admin)):
    """
    POST /machines/reset/{machine_code}
    Called when a GMAO task is marked 'terminee'.
    Resets engine buffers and updates Supabase. Admin only.
    """
    if not _MACHINE_CODE_RE.match(machine_code):
        raise HTTPException(400, "Code machine invalide")

    # Rate limit: 1 reset per machine per 5 minutes
    now = _time.time()
    if machine_code in _recent_resets and (now - _recent_resets[machine_code]) < 300:
        raise HTTPException(429, "Reset appelé trop récemment — attendez 5 minutes")
    _recent_resets[machine_code] = now

    sb = get_supabase()
    manager = get_manager()

    uuid = manager.get_uuid(machine_code)
    if not uuid:
        raise HTTPException(404, f"Machine '{machine_code}' not found in cache")

    # Reset ML engine
    manager.reset(machine_code)

    # Update machine status in Supabase
    try:
        sb.table('machines').update({
            'statut': 'operational',
            'hi_courant': 1.0,
            'rul_courant': None,
            'derniere_maj': datetime.now(timezone.utc).isoformat(),
        }).eq('id', uuid).execute()

        # Insert info alert
        sb.table('alertes').insert({
            'machine_id': uuid,
            'type': 'hi',
            'titre': f'Reset post-maintenance — {machine_code}',
            'description': 'Reset post-maintenance effectué. Buffers réinitialisés.',
            'severite': 'info',
        }).execute()
    except Exception as e:
        logger.error("Reset DB update error for %s: %s", machine_code, e)
        raise HTTPException(502, "Reset effectué en mémoire mais erreur DB")

    log_audit(admin.id, admin.email, "machine.reset", {"machine_code": machine_code})

    return {"status": "ok", "machine_code": machine_code, "message": "Engine reset, status → operational"}
