import html as html_mod
import json
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage
from urllib import error as urllib_error
from urllib import request as urllib_request

from core.config import settings

logger = logging.getLogger(__name__)


def _html_to_text(html_body: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\\1>", " ", html_body)
    text = re.sub(r"(?i)<br\\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p>", "\n\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_mod.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _smtp_password() -> str:
    # Gmail app passwords are often copied with spaces every 4 chars.
    # Accept both formats so Render env setup stays noob-friendly.
    return "".join(str(settings.SMTP_PASSWORD or "").split())


def _brevo_is_configured() -> bool:
    return bool(settings.BREVO_API_KEY and settings.EMAIL_SENDER_EMAIL)


def _emailjs_is_configured() -> bool:
    return bool(settings.EMAILJS_PUBLIC_KEY and settings.EMAILJS_TEMPLATE_ID)


def _smtp_is_configured() -> bool:
    return bool(
        settings.SMTP_HOST
        and settings.SMTP_PORT
        and settings.SMTP_FROM
        and settings.SMTP_USERNAME
        and _smtp_password()
    )


def _send_via_emailjs(to: str, subject: str, html_body: str) -> tuple[bool, str | None]:
    message_text = _html_to_text(html_body)
    payload = {
        "service_id": settings.EMAILJS_SERVICE_ID or "default_service",
        "template_id": settings.EMAILJS_TEMPLATE_ID,
        "user_id": settings.EMAILJS_PUBLIC_KEY,
        "accessToken": settings.EMAILJS_PRIVATE_KEY,
        "template_params": {
            "to_email": to,
            "subject": subject,
            "sender_name": settings.EMAIL_SENDER_NAME,
            "sender_email": settings.EMAIL_SENDER_EMAIL,
            "dashboard_url": settings.DASHBOARD_URL,
            "dashboard_uri": settings.DASHBOARD_URL,
            "message_html": html_body,
            "message_text": message_text,
        },
    }
    req = urllib_request.Request(
        url=f"{settings.EMAILJS_API_BASE.rstrip('/')}/api/v1.0/email/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "origin": settings.DASHBOARD_URL,
            "referer": f"{settings.DASHBOARD_URL.rstrip('/')}/",
            "content-type": "application/json",
            "accept": "application/json,text/plain,*/*",
            # EmailJS sits behind edge protections that expect a browser-like client.
            "user-agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/136.0 Safari/537.36"
            ),
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=20) as response:
            status = getattr(response, "status", 200)
            body = response.read().decode("utf-8", errors="replace")
            if 200 <= status < 300:
                logger.info("EmailJS email sent to %s: %s", to, subject)
                return True, None
            logger.error("EmailJS email failed for %s: HTTP %s %s", to, status, body)
            return False, f"EmailJS HTTP {status}: {body[:240]}"
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.error("EmailJS email failed for %s: HTTP %s %s", to, exc.code, body)
        return False, f"EmailJS HTTP {exc.code}: {body[:240]}"
    except Exception as exc:
        logger.error("EmailJS email failed for %s: %s", to, exc)
        return False, str(exc)


def _send_via_brevo(to: str, subject: str, html_body: str) -> tuple[bool, str | None]:
    payload = {
        "sender": {
            "email": settings.EMAIL_SENDER_EMAIL,
            "name": settings.EMAIL_SENDER_NAME,
        },
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html_body,
    }
    req = urllib_request.Request(
        url=f"{settings.BREVO_API_BASE.rstrip('/')}/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "accept": "application/json",
            "api-key": settings.BREVO_API_KEY,
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=20) as response:
            status = getattr(response, "status", 200)
            body = response.read().decode("utf-8", errors="replace")
            if 200 <= status < 300:
                logger.info("Brevo email sent to %s: %s", to, subject)
                return True, None
            logger.error("Brevo email failed for %s: HTTP %s %s", to, status, body)
            return False, f"Brevo HTTP {status}: {body[:240]}"
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.error("Brevo email failed for %s: HTTP %s %s", to, exc.code, body)
        return False, f"Brevo HTTP {exc.code}: {body[:240]}"
    except Exception as exc:
        logger.error("Brevo email failed for %s: %s", to, exc)
        return False, str(exc)


def _send_via_smtp(to: str, subject: str, html_body: str) -> tuple[bool, str | None]:
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
        return True, None
    except Exception as exc:
        logger.error("SMTP email failed for %s: %s", to, exc)
        return False, str(exc)


def send_alert_email_detailed(to: str, subject: str, html_body: str) -> tuple[bool, str | None]:
    """Send an alert email and return `(success, error_message)`."""
    if _emailjs_is_configured():
        return _send_via_emailjs(to, subject, html_body)
    if _brevo_is_configured():
        return _send_via_brevo(to, subject, html_body)
    if _smtp_is_configured():
        return _send_via_smtp(to, subject, html_body)
    note = "No email provider configured"
    logger.warning("%s - email skipped", note)
    return False, note


def send_alert_email(to: str, subject: str, html_body: str) -> bool:
    """Send an alert email via the configured provider."""
    sent, _ = send_alert_email_detailed(to, subject, html_body)
    return sent


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
