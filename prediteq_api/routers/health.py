import logging

from fastapi import APIRouter, Depends
from routers.mqtt import is_connected as mqtt_is_connected
from ml.engine_manager import get_manager
from core.auth import CurrentUser, require_auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    """GET /health — liveness probe (public, minimal info)."""
    try:
        get_manager()
        return {"status": "ok", "version": "1.0.0"}
    except RuntimeError:
        return {"status": "starting"}


@router.get("/health/detail")
def health_detail(user: CurrentUser = Depends(require_auth)):
    """GET /health/detail — detailed probe (requires authentication)."""
    try:
        manager = get_manager()

        # ── Dependency checks ─────────────────────────────────────────────
        deps = {}

        # Supabase
        try:
            from core.supabase_client import get_supabase
            sb = get_supabase()
            sb.table("machines").select("id").limit(1).execute()
            deps["supabase"] = {"status": "ok"}
        except Exception as e:
            deps["supabase"] = {"status": "error", "message": str(e)}

        # Groq LLM
        try:
            from core.config import settings
            deps["groq"] = {
                "status": "ok" if settings.GROQ_API_KEY else "not_configured",
            }
        except Exception as e:
            deps["groq"] = {"status": "error", "message": str(e)}

        # Resend (email)
        try:
            from core.config import settings
            deps["resend"] = {
                "status": "ok" if settings.RESEND_API_KEY else "not_configured",
            }
        except Exception as e:
            deps["resend"] = {"status": "error", "message": str(e)}

        # MQTT
        deps["mqtt"] = {"status": "connected" if mqtt_is_connected() else "disconnected"}

        # Overall status
        any_error = any(d.get("status") == "error" for d in deps.values())
        overall = "degraded" if any_error else "ok"

        return {
            "status": overall,
            "version": "1.0.0",
            "mqtt_connected": mqtt_is_connected(),
            "active_engines": len(manager.engines),
            "dependencies": deps,
            "machines": {
                code: {
                    "hi": manager.last_results.get(code, {}).get('hi_smooth'),
                    "zone": manager.last_results.get(code, {}).get('zone'),
                    "uptime_s": manager.last_results.get(code, {}).get('uptime_seconds'),
                }
                for code in manager.active_machines
            },
        }
    except RuntimeError:
        return {"status": "starting", "message": "API is still initializing"}
