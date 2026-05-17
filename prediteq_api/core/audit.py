"""
Audit logging - logs critical admin actions to Supabase audit_logs.
Non-blocking: failures are logged but never raise.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
_audit_table_available: bool | None = None


def _is_missing_audit_table_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "audit_logs" in message and (
        "could not find the table" in message
        or "does not exist" in message
        or "undefined_table" in message
    )


def log_audit(
    actor_id: str,
    actor_email: str,
    action: str,
    details: dict | None = None,
):
    """Insert an audit row. Best-effort - never blocks the caller."""
    global _audit_table_available

    if _audit_table_available is False:
        logger.info("AUDIT | %s | %s | %s | %s", actor_email, action, details or {}, actor_id)
        return

    try:
        from core.supabase_client import get_supabase

        sb = get_supabase()
        sb.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "actor_email": actor_email,
                "action": action,
                "details": details or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
        _audit_table_available = True
    except Exception as exc:
        if _is_missing_audit_table_error(exc):
            if _audit_table_available is not False:
                logger.warning(
                    "Audit log table unavailable; skipping database audit inserts until restart: %s",
                    exc,
                )
            _audit_table_available = False
        else:
            logger.warning("Audit log failed: %s", exc)

    logger.info("AUDIT | %s | %s | %s | %s", actor_email, action, details or {}, actor_id)
