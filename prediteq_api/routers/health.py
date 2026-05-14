import logging
import json
from pathlib import Path

from fastapi import APIRouter, Depends
from routers.mqtt import is_connected as mqtt_is_connected
from ml.engine_manager import get_manager
from core.auth import CurrentUser, require_auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

_FALLBACK_METRICS = {
    "generated_at_utc": "2026-04-27T23:49:30.117619+00:00",
    "pipeline_version": "2.0-no-leakage",
    "hybrid_ensemble": {
        "precision": 0.9468951741832591,
        "recall": 0.9300457986537586,
        "f1": 0.9383948576534484,
    },
    "rul_regression": {
        "holdout": {
            "rmse_days": 5.051103997022318,
            "mae_days": 2.3617192080419893,
            "r2": 0.9474814198564139,
        },
    },
}

_FALLBACK_CMAPSS = {
    "r2": 0.8862687482673741,
    "rmse_cycles": 14.106327960632301,
}


def _read_metrics_file(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Could not read metrics file %s: %s", path, exc)
        return {}


@router.get("/health")
def health_check():
    """GET /health — liveness probe (public, minimal info)."""
    try:
        get_manager()
        return {"status": "ok", "version": "1.0.0"}
    except RuntimeError:
        return {"status": "starting"}


@router.get("/health/public-metrics")
def public_metrics():
    repo_root = Path(__file__).resolve().parents[2]
    outputs_dir = repo_root / "prediteq_ml" / "outputs"
    metrics = _read_metrics_file(outputs_dir / "metrics.json") or _FALLBACK_METRICS
    cmapss = _read_metrics_file(outputs_dir / "cmapss_metrics.json") or _FALLBACK_CMAPSS

    anomaly = metrics.get("hybrid_ensemble") or metrics.get("anomaly_detection", {}).get("hybrid_ensemble", {})
    rul = metrics.get("rul_regression", {}).get("holdout", {})

    return {
        "generated_at_utc": metrics.get("generated_at_utc"),
        "pipeline_version": metrics.get("pipeline_version"),
        "verified_pipeline": {
            "trajectories": 200,
            "holdout_r2": rul.get("r2"),
            "holdout_rmse_days": rul.get("rmse_days"),
            "holdout_mae_days": rul.get("mae_days"),
            "hybrid_precision": anomaly.get("precision"),
            "hybrid_recall": anomaly.get("recall"),
            "hybrid_f1": anomaly.get("f1"),
            "cmapss_r2": cmapss.get("r2"),
            "cmapss_rmse_cycles": cmapss.get("rmse_cycles"),
        },
        "marketing_cards": {
            "r2_pct": round(float(rul.get("r2", 0)) * 100),
            "rmse_days": round(float(rul.get("rmse_days", 0)), 1),
            "hybrid_f1_pct": round(float(anomaly.get("f1", 0)) * 100),
            "cmapss_r2_pct": round(float(cmapss.get("r2", 0)) * 100),
            "trajectories": 200,
        },
    }


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
            logger.error("Supabase health check failed: %s", e)
            deps["supabase"] = {"status": "error", "message": "Connection failed"}

        # Groq LLM
        try:
            from core.config import settings
            deps["groq"] = {
                "status": "ok" if settings.GROQ_API_KEY else "not_configured",
            }
        except Exception as e:
            deps["groq"] = {"status": "error", "message": str(e)}

        # Email provider
        try:
            from core.config import settings
            email_provider = "none"
            if settings.EMAILJS_PUBLIC_KEY and settings.EMAILJS_TEMPLATE_ID:
                email_provider = "emailjs"
            elif settings.BREVO_API_KEY and settings.EMAIL_SENDER_EMAIL:
                email_provider = "brevo"
            elif (
                settings.SMTP_HOST
                and settings.SMTP_PORT
                and settings.SMTP_FROM
                and settings.SMTP_USERNAME
                and settings.SMTP_PASSWORD
            ):
                email_provider = "smtp"
            deps["smtp"] = {
                "status": "ok" if email_provider != "none" else "not_configured",
                "provider": email_provider,
            }
        except Exception as e:
            deps["smtp"] = {"status": "error", "message": str(e)}

        # MQTT
        deps["mqtt"] = {"status": "connected" if mqtt_is_connected() else "disconnected"}

        # HTTP live ingest
        deps["live_ingest"] = {
            "status": "ok" if settings.LIVE_INGEST_TOKEN else "not_configured",
        }

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
