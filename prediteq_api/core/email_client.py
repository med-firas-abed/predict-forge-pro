import html as html_mod
import logging
import smtplib
import ssl
from email.message import EmailMessage

from core.config import settings

logger = logging.getLogger(__name__)


def _smtp_password() -> str:
    # Gmail app passwords are often copied with spaces every 4 chars.
    # Accept both formats so Render env setup stays noob-friendly.
    return "".join(str(settings.SMTP_PASSWORD or "").split())


def _smtp_is_configured() -> bool:
    return bool(
        settings.SMTP_HOST
        and settings.SMTP_PORT
        and settings.SMTP_FROM
        and settings.SMTP_USERNAME
        and _smtp_password()
    )


def _send_via_smtp(to: str, subject: str, html_body: str) -> bool:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message.set_content(
        "Alerte PrediTeq. Activez la lecture HTML pour voir le detail."
    )
    message.add_alternative(html_body, subtype="html")

    try:
        if settings.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                context=ssl.create_default_context(),
                timeout=20,
            ) as server:
                server.login(settings.SMTP_USERNAME, _smtp_password())
                server.send_message(message)
        else:
            with smtplib.SMTP(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                timeout=20,
            ) as server:
                server.ehlo()
                if settings.SMTP_USE_TLS:
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                server.login(settings.SMTP_USERNAME, _smtp_password())
                server.send_message(message)

        logger.info("SMTP email sent to %s: %s", to, subject)
        return True
    except Exception as exc:
        logger.error("SMTP email failed for %s: %s", to, exc)
        return False


def send_alert_email(to: str, subject: str, html_body: str) -> bool:
    """Send an alert email via SMTP only."""
    if not _smtp_is_configured():
        logger.warning("SMTP not configured - email skipped")
        return False
    return _send_via_smtp(to, subject, html_body)


def build_urgence_html(
    machine_nom: str,
    machine_code: str,
    hi: float,
    rul_result: dict | None,
    recent_alerts: list[dict],
) -> str:
    machine_nom = html_mod.escape(machine_nom)
    machine_code = html_mod.escape(machine_code)
    hi_pct = f"{hi * 100:.0f}%"
    rul_str = (
        f"{rul_result['rul_days']} jours"
        if rul_result and rul_result.get("rul_days")
        else "N/A"
    )
    ci_str = ""
    if rul_result and rul_result.get("ci_low") is not None:
        ci_str = f" [{rul_result['ci_low']} - {rul_result['ci_high']}]"

    alerts_html = ""
    for alert in recent_alerts[:3]:
        alerts_html += (
            "<li><b>"
            f"{html_mod.escape(alert.get('titre', ''))}"
            "</b> - "
            f"{html_mod.escape(alert.get('description', ''))}"
            "</li>"
        )

    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #e74c3c;">URGENT - {machine_nom} ({machine_code})</h2>
        <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Indice de sante (HI)</b></td>
                <td style="padding: 8px; border: 1px solid #ddd; color: #e74c3c;"><b>{hi_pct}</b></td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Marge restante estimee (RUL)</b></td>
                <td style="padding: 8px; border: 1px solid #ddd;">{rul_str}{ci_str}</td></tr>
        </table>
        <h3>Dernieres alertes</h3>
        <ul>{alerts_html or '<li>Aucune alerte recente</li>'}</ul>
        <p><a href="{settings.DASHBOARD_URL}" style="color: #3498db;">
            Acceder au tableau de bord ->
        </a></p>
    </div>
    """


def build_surveillance_html(
    machine_nom: str,
    machine_code: str,
    hi: float,
    rul_result: dict | None,
) -> str:
    machine_nom = html_mod.escape(machine_nom)
    machine_code = html_mod.escape(machine_code)
    hi_pct = f"{hi * 100:.0f}%"
    rul_str = (
        f"{rul_result['rul_days']} jours"
        if rul_result and rul_result.get("rul_days")
        else "N/A"
    )
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #e67e22;">SURVEILLANCE - {machine_nom} ({machine_code})</h2>
        <p>Une degradation a ete detectee sur cette machine.</p>
        <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Indice de sante (HI)</b></td>
                <td style="padding: 8px; border: 1px solid #ddd; color: #e67e22;"><b>{hi_pct}</b></td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Marge restante estimee (RUL)</b></td>
                <td style="padding: 8px; border: 1px solid #ddd;">{rul_str}</td></tr>
        </table>
        <p>Surveillance hebdomadaire recommandee.</p>
        <p><a href="{settings.DASHBOARD_URL}" style="color: #3498db;">
            Acceder au tableau de bord ->
        </a></p>
    </div>
    """
