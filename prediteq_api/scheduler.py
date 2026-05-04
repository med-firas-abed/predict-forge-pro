"""
APScheduler — runs every 60 seconds per active machine.
Updates Supabase, inserts historique_hi, triggers alerts & emails.

RUL v2 (F4) — Adds an hourly calibration metrics job:
    update_calibration_metrics()
which maintains power_avg_30j (EMA, 30-day effective window) and
cycles_avg_7j (from manager observation) on the machines table. These
power the FPT + observed-rate display layer (rul_calibration.py).
"""

import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from core.config import settings
from core.supabase_client import get_supabase
from core.email_client import (
    send_alert_email, build_urgence_html, build_surveillance_html,
)
from core.email_history import append_email_event
from ml.engine_manager import get_manager
from routers.seuils import get_alert_recipients

# FPT gate (IEEE 1856-2017 §6.2) — décide si on persiste un RUL chiffré
# pour une machine donnée. Au-dessus du seuil HI=0.80 (zone Excellent
# ISO 10816-3 « neuf/remis à neuf »), le RUL chiffré est masqué.
from diagnostics import should_show_rul

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

# Keep the alert center actionable by throttling repeated equivalent HI alerts
# while the previous one is still open.
ALERT_DEDUP_HOURS: int = 12

# ─── RUL v2 calibration constants ───────────────────────────────────────────
#
# EMA alpha for the 30-day effective window when the job fires hourly :
#     n_eff = 30 days × 24 hours = 720 samples → alpha = 1/n_eff ≈ 0.00139
#
# Survives Render restarts because the previous EMA value is reloaded from
# Supabase at startup into manager.machine_cache (see main.py step 4) and
# we read it back via cached.get('power_avg_30j') below.
ALPHA_POWER_30D: float = 1.0 / 720.0

# Power threshold above which we consider a sample "useful" for the EMA :
# ascent power for SITI FC100L1-4 is ~1.5 kW, descent 0.35 kW, pause 0 kW.
# The 44-second cycle-mean from last_raw['power_kw'] is roughly
# (12·1.5 + 12·0.35 + 20·0) / 44 ≈ 0.50 kW for a healthy nominal cycle.
# We accept any sample > 0.10 kW (machine running) and let the EMA smooth.
POWER_SAMPLE_MIN_KW: float = 0.10


def _zone_to_statut(zone: str | None, hi: float | None = None) -> str:
    """Map the runtime HI zone to the persisted machine status.

    We only expose 3 product states in Supabase/UI:
      - operational
      - degraded
      - critical

    Runtime diagnostics use 4 PHM/ISO bands:
      - Excellent
      - Good
      - Degraded
      - Critical

    To keep the product narration coherent:
      Excellent -> operational
      Good/Degraded -> degraded (surveillance bucket)
      Critical -> critical
    """
    if zone == 'Excellent':
        return 'operational'
    if zone in {'Good', 'Degraded'}:
        return 'degraded'
    if zone == 'Critical':
        return 'critical'
    if hi is None:
        return 'operational'
    if hi >= 0.8:
        return 'operational'
    if hi >= 0.3:
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


def _log_email(
    sb,
    machine_uuid: str,
    recipient_email: str,
    alert_type: str = 'hi',
    success: bool = True,
):
    """Insert into email_logs after sending (or failing)."""
    try:
        sb.table('email_logs').insert({
            'machine_id': machine_uuid,
            'type': alert_type,
            'recipient_email': recipient_email,
            'success': success,
        }).execute()
    except Exception as e:
        logger.error("email_logs insert error: %s", e)


def _send_alert_emails(
    sb,
    machine_uuid: str,
    subject: str,
    html: str,
    alert_type: str = 'hi',
    machine_code: str | None = None,
    machine_name: str | None = None,
    severity: str | None = None,
) -> bool:
    recipients = get_alert_recipients()
    if not recipients:
        logger.warning("No alert email recipients configured for machine %s", machine_uuid)
        return False

    # Claim the rate-limit slot before sending, using the primary recipient.
    primary_recipient = recipients[0]
    _log_email(sb, machine_uuid, primary_recipient, alert_type, success=True)

    any_success = False
    for index, recipient in enumerate(recipients):
        sent = send_alert_email(recipient, subject, html)
        append_email_event(
            machine_id=machine_uuid,
            machine_code=machine_code,
            machine_name=machine_name,
            recipient_email=recipient,
            success=sent,
            alert_type=alert_type,
            source="scheduler",
            severity=severity,
            subject=subject,
        )
        if sent:
            any_success = True
            if index > 0:
                _log_email(sb, machine_uuid, recipient, alert_type, success=True)
        else:
            _log_email(sb, machine_uuid, recipient, alert_type, success=False)

    return any_success


def _has_recent_equivalent_alert(
    sb,
    machine_uuid: str,
    alert_type: str,
    severite: str,
    titre: str,
    dedupe_hours: int = ALERT_DEDUP_HOURS,
) -> bool:
    """True when an equivalent non-acknowledged alert is already open."""
    try:
        since = (datetime.now(timezone.utc) - timedelta(hours=dedupe_hours)).isoformat()
        result = (
            sb.table('alertes')
            .select('id')
            .eq('machine_id', machine_uuid)
            .eq('type', alert_type)
            .eq('severite', severite)
            .eq('titre', titre)
            .eq('acquitte', False)
            .gte('created_at', since)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception as e:
        logger.error("alert dedupe check error for %s: %s", machine_uuid, e)
        return False


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
    statut = _zone_to_statut(zone, hi)

    machine_uuid = manager.get_uuid(code)
    if not machine_uuid:
        logger.warning("No UUID for machine %s — skipping", code)
        return

    # ── RUL prediction ────────────────────────────────────────────────────
    rul_result = manager.predict_rul(code)

    # ── FPT gate (IEEE 1856-2017 §6.2 — First Predicting Time) ────────────
    # On NE PERSISTE PAS de RUL chiffré tant que la machine est saine
    # (HI ≥ FPT_HI_THRESHOLD = 0.80, zone Excellent ISO 10816-3). Sinon
    # toutes les pages qui consomment `rul_courant` (Tableau de bord,
    # Machines, Géolocalisation, Rapports) afficheraient un chiffre
    # extrapolé hors plage d'entraînement, contredisant le pronostic
    # conditionnel affiché sur la page Diagnostics RUL.
    #
    # Cohérence garantie : une seule source de vérité pour le RUL chiffré.
    fpt_show = should_show_rul(hi)

    # ── Update machines table ─────────────────────────────────────────────
    now_iso = datetime.now(timezone.utc).isoformat()
    update_data = {
        'hi_courant': round(hi, 4),
        'statut': statut,
        'derniere_maj': now_iso,
    }
    if fpt_show and rul_result and rul_result.get('rul_days') is not None:
        update_data['rul_courant'] = int(rul_result['rul_days'])
    else:
        # FPT actif (machine saine) OU pas de prédiction disponible :
        # on remet explicitement à NULL pour effacer toute valeur stale.
        update_data['rul_courant'] = None

    try:
        sb.table('machines').update(update_data).eq('id', machine_uuid).execute()
    except Exception as e:
        logger.error("machines update error for %s: %s", code, e)

    # ── Insert predictions_rul (RUL history + confidence intervals) ───────
    # Pareillement gated par FPT : pas d'historique chiffré pour machines
    # saines. L'historique reste fidèle aux décisions présentées à l'UI.
    if fpt_show and rul_result and rul_result.get('rul_days') is not None:
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
        alert_type = 'hi'
        alert_title = f"{'HI critique' if severite == 'urgence' else 'Dégradation détectée'} — {code}"
        alert_description = f"HI = {hi:.4f}{rul_str}"
        should_insert_alert = not _has_recent_equivalent_alert(
            sb,
            machine_uuid,
            alert_type,
            severite,
            alert_title,
        )
        if not should_insert_alert:
            logger.info(
                "Skipping duplicate alert for %s (%s/%s) within %sh window",
                code,
                alert_type,
                severite,
                ALERT_DEDUP_HOURS,
            )

        # Insert alert into Supabase
        if should_insert_alert:
            try:
                sb.table('alertes').insert({
                    'machine_id': machine_uuid,
                    'type': alert_type,
                    'titre': alert_title,
                    'description': alert_description,
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
                _send_alert_emails(
                    sb,
                    machine_uuid,
                    subject,
                    html,
                    'hi',
                    machine_code=code,
                    machine_name=machine_nom,
                    severity=severite,
                )

        elif severite == 'surveillance' and _can_send_surveillance(sb, machine_uuid):
            subject = f"[SURVEILLANCE] {machine_nom} — HI {hi:.2f}"
            html = build_surveillance_html(machine_nom, code, hi, rul_result)
            _send_alert_emails(
                sb,
                machine_uuid,
                subject,
                html,
                'hi',
                machine_code=code,
                machine_name=machine_nom,
                severity=severite,
            )


# ─── RUL v2 — Hourly calibration metrics update ─────────────────────────────

def update_calibration_metrics():
    """Hourly: refresh power_avg_30j (EMA) and cycles_avg_7j on machines.

    Both metrics feed prediteq_ml/diagnostics/rul_calibration.py :
      - power_avg_30j → l10_adjusted_years() (ISO 281 cube law)
      - cycles_avg_7j → convert_min_to_days() (observed-rate factor)

    Persistence model :
      The previous EMA value is held in manager.machine_cache (loaded from
      Supabase at startup). We read prev → compute new EMA → write back to
      Supabase + update cache. This survives Render restarts cleanly.

    No-op for any machine that hasn't received any sensor data yet
    (last_raw missing) — keeps Supabase columns NULL until real data arrives.
    """
    try:
        manager = get_manager()
        sb = get_supabase()
    except RuntimeError:
        return  # not initialized yet

    for code in list(manager.engines.keys()):
        try:
            _update_calibration_one(manager, sb, code)
        except Exception as e:
            logger.error("Calibration metrics error for %s: %s", code, e)


def _update_calibration_one(manager, sb, code: str):
    """Per-machine update of power_avg_30j + cycles_avg_7j."""
    machine_uuid = manager.get_uuid(code)
    if not machine_uuid:
        return

    update_data: dict = {}
    cached = manager.machine_cache.setdefault(code, {})

    # ── power_avg_30j : EMA over the last completed ASCENT phase ──────────
    # ISO 281 §7 expects the dynamic equivalent load on the bearing, which
    # is dominated by the ascent power (descent and pause contribute little).
    # We sample the per-ascent average via get_recent_ascent_power_kw(),
    # which extracts e_cycle_kwh × 3600 / T_ASCENT_S from the feature buffer.
    p_obs = manager.get_recent_ascent_power_kw(code)
    if p_obs is not None and p_obs > POWER_SAMPLE_MIN_KW:
        prev = cached.get('power_avg_30j')
        if prev is None:
            # First-ever sample → seed
            new_avg = float(p_obs)
        else:
            new_avg = (
                ALPHA_POWER_30D * float(p_obs)
                + (1.0 - ALPHA_POWER_30D) * float(prev)
            )
        update_data['power_avg_30j'] = round(new_avg, 4)
        cached['power_avg_30j'] = new_avg

    # ── cycles_avg_7j : observed (override OR wall-clock) ─────────────────
    cpd = manager.get_cycles_per_day(code)
    if cpd is not None:
        update_data['cycles_avg_7j'] = round(float(cpd), 1)
        cached['cycles_avg_7j'] = float(cpd)

    if not update_data:
        return  # nothing to write — leave Supabase NULL until we have data

    update_data['metrics_updated'] = datetime.now(timezone.utc).isoformat()
    try:
        sb.table('machines').update(update_data).eq('id', machine_uuid).execute()
    except Exception as e:
        # If migration 006 not applied, the columns don't exist → log + skip.
        # Don't crash the scheduler.
        logger.warning(
            "calibration metrics update failed for %s "
            "(migration 006 applied?): %s", code, e
        )


# ─── Scheduler lifecycle ─────────────────────────────────────────────────────

def start():
    scheduler.add_job(update_all_machines, 'interval', seconds=60,
                      id='update_machines', replace_existing=True)
    # RUL v2 : hourly calibration metrics refresh
    scheduler.add_job(update_calibration_metrics, 'interval', hours=1,
                      id='update_calibration', replace_existing=True)
    scheduler.start()
    logger.info(
        "Scheduler started — update_all_machines every 60s + "
        "update_calibration_metrics every 1h"
    )


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
