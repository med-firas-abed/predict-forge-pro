"""
APScheduler — runs every 60 seconds per active machine.
Updates Supabase, inserts historique_hi, triggers alerts & emails.
"""

import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from core.config import settings
from core.supabase_client import get_supabase
from core.email_client import (
    send_alert_email, build_urgence_html, build_surveillance_html,
)
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def _hi_to_statut(hi: float) -> str:
    if hi >= 0.6:
        return 'operational'
    elif hi >= 0.3:
        return 'degraded'
    return 'critical'


def _zone_to_severite(zone: str) -> str | None:
    """Map engine zone → Supabase severite (or None if no alert needed)."""
    if zone == 'Critical':
        return 'urgence'
    if zone == 'Degraded':
        return 'surveillance'
    return None


def _can_send_urgence(sb, machine_uuid: str) -> bool:
    """Use Supabase function: max 1 per machine per 24h."""
    try:
        result = sb.rpc('can_send_email', {
            'p_machine_id': machine_uuid,
            'p_type': 'hi',
        }).execute()
        return bool(result.data)
    except Exception as e:
        logger.error("can_send_email RPC error: %s", e)
        return False


def _can_send_surveillance(sb, machine_uuid: str) -> bool:
    """Check email_logs for last 7 days (weekly limit for surveillance)."""
    try:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        result = sb.table('email_logs') \
            .select('id') \
            .eq('machine_id', machine_uuid) \
            .eq('type', 'hi') \
            .eq('success', True) \
            .gte('created_at', week_ago) \
            .execute()
        return len(result.data) == 0
    except Exception as e:
        logger.error("Surveillance email check error: %s", e)
        return False


def _log_email(sb, machine_uuid: str, alert_type: str = 'hi', success: bool = True):
    """Insert into email_logs after sending (or failing)."""
    try:
        sb.table('email_logs').insert({
            'machine_id': machine_uuid,
            'type': alert_type,
            'recipient_email': settings.ADMIN_EMAIL,
            'success': success,
        }).execute()
    except Exception as e:
        logger.error("email_logs insert error: %s", e)


# ─── Main scheduled job ──────────────────────────────────────────────────────

def update_all_machines():
    """Called every 60 seconds. Updates Supabase for each active engine."""
    try:
        manager = get_manager()
        sb = get_supabase()
    except RuntimeError:
        return  # not initialized yet

    for code in list(manager.engines.keys()):
        try:
            _update_one_machine(manager, sb, code)
        except Exception as e:
            logger.error("Scheduler error for %s: %s", code, e)


def _update_one_machine(manager, sb, code: str):
    last = manager.last_results.get(code)
    if not last or last.get('hi_smooth') is None:
        return

    hi = last['hi_smooth']
    zone = last['zone']
    score_if = last.get('score_if')
    statut = _hi_to_statut(hi)

    machine_uuid = manager.get_uuid(code)
    if not machine_uuid:
        logger.warning("No UUID for machine %s — skipping", code)
        return

    # ── RUL prediction ────────────────────────────────────────────────────
    rul_result = manager.predict_rul(code)

    # ── Update machines table ─────────────────────────────────────────────
    now_iso = datetime.now(timezone.utc).isoformat()
    update_data = {
        'hi_courant': round(hi, 4),
        'statut': statut,
        'derniere_maj': now_iso,
    }
    if rul_result and rul_result.get('rul_days') is not None:
        update_data['rul_courant'] = int(rul_result['rul_days'])

    try:
        sb.table('machines').update(update_data).eq('id', machine_uuid).execute()
    except Exception as e:
        logger.error("machines update error for %s: %s", code, e)

    # ── Insert predictions_rul (RUL history + confidence intervals) ───────
    if rul_result and rul_result.get('rul_days') is not None:
        try:
            sb.table('predictions_rul').insert({
                'machine_id': machine_uuid,
                'rul_jours': round(rul_result['rul_days'], 2),
                'ic_bas': round(rul_result['ci_low'], 2) if rul_result.get('ci_low') is not None else None,
                'ic_haut': round(rul_result['ci_high'], 2) if rul_result.get('ci_high') is not None else None,
            }).execute()
        except Exception as e:
            logger.error("predictions_rul insert error for %s: %s", code, e)

    # ── Insert historique_hi ──────────────────────────────────────────────
    try:
        sb.table('historique_hi').insert({
            'machine_id': machine_uuid,
            'valeur_hi': round(hi, 4),
            'score_if': score_if,
            'statut': statut,
        }).execute()
    except Exception as e:
        logger.error("historique_hi insert error for %s: %s", code, e)

    # ── Check zone transition for alerts ──────────────────────────────────
    prev_zone = manager.previous_zones.get(code)
    manager.previous_zones[code] = zone
    severite = _zone_to_severite(zone)

    if prev_zone != zone and severite:
        machine_info = manager.get_machine_info(code) or {}
        machine_nom = machine_info.get('nom', code)

        rul_str = ""
        if rul_result and rul_result.get('rul_days') is not None:
            rul_str = f", RUL = {rul_result['rul_days']} jours"

        # Insert alert into Supabase
        try:
            sb.table('alertes').insert({
                'machine_id': machine_uuid,
                'type': 'hi',
                'titre': f"{'HI critique' if severite == 'urgence' else 'Dégradation détectée'} — {code}",
                'description': f"HI = {hi:.4f}{rul_str}",
                'severite': severite,
            }).execute()
        except Exception as e:
            logger.error("alertes insert error for %s: %s", code, e)

        # ── Email logic ───────────────────────────────────────────────────
        if severite == 'urgence' and _can_send_urgence(sb, machine_uuid):
            # Double-check with a fresh query to reduce race window
            if not _can_send_urgence(sb, machine_uuid):
                logger.info("Urgence email skipped (race guard) for %s", code)
            else:
                # Fetch recent alerts for email body
                recent_alerts = []
                try:
                    res = sb.table('alertes').select('titre, description') \
                        .eq('machine_id', machine_uuid) \
                        .order('created_at', desc=True) \
                        .limit(3).execute()
                    recent_alerts = res.data
                except Exception:
                    pass

                subject = f"[URGENCE] {machine_nom} — RUL {rul_result['rul_days'] if rul_result and rul_result.get('rul_days') else 'N/A'} jours"
                html = build_urgence_html(machine_nom, code, hi, rul_result, recent_alerts)
                # Log email BEFORE sending to claim the slot (reduces race window)
                _log_email(sb, machine_uuid, 'hi', success=True)
                sent = send_alert_email(settings.ADMIN_EMAIL, subject, html)
                if not sent:
                    # Update the log to reflect failure
                    _log_email(sb, machine_uuid, 'hi', success=False)

        elif severite == 'surveillance' and _can_send_surveillance(sb, machine_uuid):
            subject = f"[SURVEILLANCE] {machine_nom} — HI {hi:.2f}"
            html = build_surveillance_html(machine_nom, code, hi, rul_result)
            # Log before sending to claim the slot
            _log_email(sb, machine_uuid, 'hi', success=True)
            sent = send_alert_email(settings.ADMIN_EMAIL, subject, html)
            if not sent:
                _log_email(sb, machine_uuid, 'hi', success=False)


# ─── Scheduler lifecycle ─────────────────────────────────────────────────────

def start():
    scheduler.add_job(update_all_machines, 'interval', seconds=60,
                      id='update_machines', replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started — update_all_machines every 60s")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
