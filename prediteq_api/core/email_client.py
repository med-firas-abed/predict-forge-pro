import logging
import html as html_mod
import resend
from core.config import settings

logger = logging.getLogger(__name__)

# Set API key once at module load
if settings.RESEND_API_KEY:
    resend.api_key = settings.RESEND_API_KEY

# Warn loudly if RESEND_FROM is not configured for production
if settings.RESEND_API_KEY and (
    not settings.RESEND_FROM
    or settings.RESEND_FROM == "PrediTeq Alerts <onboarding@resend.dev>"
):
    logger.error(
        "RESEND_FROM is not configured (using Resend demo address). "
        "Production emails will FAIL. Set RESEND_FROM in your environment."
    )


def send_alert_email(to: str, subject: str, html_body: str) -> bool:
    """Send an alert email via Resend. Returns True on success."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — email skipped")
        return False
    if not settings.RESEND_FROM or settings.RESEND_FROM == "PrediTeq Alerts <onboarding@resend.dev>":
        logger.warning("RESEND_FROM not configured or using demo address — email may fail")
    try:
        sender = settings.RESEND_FROM or "PrediTeq Alerts <onboarding@resend.dev>"
        resend.Emails.send({
            "from": sender,
            "to": [to],
            "subject": subject,
            "html": html_body,
        })
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as e:
        logger.error("Failed to send email: %s", e)
        return False


def build_urgence_html(machine_nom: str, machine_code: str,
                       hi: float, rul_result: dict | None,
                       recent_alerts: list[dict]) -> str:
    machine_nom = html_mod.escape(machine_nom)
    machine_code = html_mod.escape(machine_code)
    rul_str = f"{rul_result['rul_days']} jours" if rul_result and rul_result.get('rul_days') else "N/A"
    ci_str = ""
    if rul_result and rul_result.get('ci_low') is not None:
        ci_str = f" [{rul_result['ci_low']} – {rul_result['ci_high']}]"

    alerts_html = ""
    for a in recent_alerts[:3]:
        alerts_html += f"<li><b>{html_mod.escape(a.get('titre', ''))}</b> — {html_mod.escape(a.get('description', ''))}</li>"

    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #e74c3c;">⚠️ URGENCE — {machine_nom} ({machine_code})</h2>
        <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Health Index</b></td>
                <td style="padding: 8px; border: 1px solid #ddd; color: #e74c3c;"><b>{hi:.4f}</b></td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>RUL estimé</b></td>
                <td style="padding: 8px; border: 1px solid #ddd;">{rul_str}{ci_str}</td></tr>
        </table>
        <h3>Dernières alertes</h3>
        <ul>{alerts_html or '<li>Aucune alerte récente</li>'}</ul>
        <p><a href="{settings.DASHBOARD_URL}" style="color: #3498db;">
            Accéder au tableau de bord →
        </a></p>
    </div>
    """


def build_surveillance_html(machine_nom: str, machine_code: str,
                             hi: float, rul_result: dict | None) -> str:
    machine_nom = html_mod.escape(machine_nom)
    machine_code = html_mod.escape(machine_code)
    rul_str = f"{rul_result['rul_days']} jours" if rul_result and rul_result.get('rul_days') else "N/A"
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #e67e22;">🔍 SURVEILLANCE — {machine_nom} ({machine_code})</h2>
        <p>Une dégradation a été détectée sur cette machine.</p>
        <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Health Index</b></td>
                <td style="padding: 8px; border: 1px solid #ddd; color: #e67e22;"><b>{hi:.4f}</b></td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>RUL estimé</b></td>
                <td style="padding: 8px; border: 1px solid #ddd;">{rul_str}</td></tr>
        </table>
        <p>Surveillance hebdomadaire recommandée.</p>
        <p><a href="{settings.DASHBOARD_URL}" style="color: #3498db;">
            Accéder au tableau de bord →
        </a></p>
    </div>
    """
