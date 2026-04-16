"""
Audit logging — logs critical admin actions to Supabase 'audit_logs' table.
Non-blocking: failures are logged but never raise.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def log_audit(actor_id: str, actor_email: str, action: str, details: dict | None = None):
    """Insert an audit row. Best-effort — never blocks the caller."""
    try:
        from core.supabase_client import get_supabase
        sb = get_supabase()
        sb.table("audit_logs").insert({
            "actor_id": actor_id,
            "actor_email": actor_email,
            "action": action,
            "details": details or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        # Table might not exist — just log it, never crash
        logger.warning("Audit log failed (table may not exist): %s", e)

    # Always log to stdout regardless of DB
    logger.info("AUDIT | %s | %s | %s | %s", actor_email, action, details or {}, actor_id)
