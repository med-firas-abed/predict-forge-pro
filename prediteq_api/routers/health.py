import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends

from core.auth import CurrentUser, require_admin
from ml.engine_manager import get_manager
from routers.mqtt import is_connected as mqtt_is_connected

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


def _collect_dependency_statuses() -> dict[str, dict[str, str]]:
    deps: dict[str, dict[str, str]] = {}

    try:
        from core.supabase_client import get_supabase

        sb = get_supabase()
        sb.table("machines").select("id").limit(1).execute()
        deps["supabase"] = {"status": "ok"}
    except Exception as exc:
        logger.error("Supabase health check failed: %s", exc)
        deps["supabase"] = {"status": "error", "message": "Connection failed"}

    try:
        from core.config import settings

        deps["groq"] = {
            "status": "ok" if settings.GROQ_API_KEY else "not_configured",
        }
    except Exception as exc:
        deps["groq"] = {"status": "error", "message": str(exc)}

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
    except Exception as exc:
        deps["smtp"] = {"status": "error", "message": str(exc)}

    deps["mqtt"] = {"status": "connected" if mqtt_is_connected() else "disconnected"}

    try:
        from core.config import settings

        deps["live_ingest"] = {
            "status": "ok" if settings.LIVE_INGEST_TOKEN else "not_configured",
        }
    except Exception as exc:
        deps["live_ingest"] = {"status": "error", "message": str(exc)}

    return deps


def _overall_status_from_dependencies(deps: dict[str, dict[str, str]]) -> str:
    if any(dep.get("status") == "error" for dep in deps.values()):
        return "degraded"
    if any(dep.get("status") == "disconnected" for dep in deps.values()):
        return "degraded"
    return "ok"


@router.get("/health")
def health_check():
    """GET /health - liveness probe (public, minimal info)."""
    try:
        get_manager()
        return {"status": "ok", "version": "1.0.0"}
    except RuntimeError:
        return {"status": "starting"}


@router.get("/health/resilience")
def health_resilience():
    checked_at_utc = datetime.now(timezone.utc).isoformat()

    try:
        manager = get_manager()
    except RuntimeError:
        return {
            "status": "starting",
            "checked_at_utc": checked_at_utc,
            "active_engines": 0,
            "active_machines": 0,
            "capabilities": {
                "maintenance_writes": "queued_only",
                "planner": "local_fallback",
                "ai_reports": "local_fallback",
                "email_alerts": "unavailable",
                "live_telemetry": "stale_only",
                "machine_reads": "cached_only",
            },
            "dependencies": {
                "supabase": "starting",
                "groq": "starting",
                "smtp": "starting",
                "mqtt": "starting",
                "live_ingest": "starting",
            },
        }

    deps = _collect_dependency_statuses()
    overall = _overall_status_from_dependencies(deps)

    supabase_ok = deps.get("supabase", {}).get("status") == "ok"
    groq_ok = deps.get("groq", {}).get("status") == "ok"
    email_ok = deps.get("smtp", {}).get("status") == "ok"
    mqtt_ok = deps.get("mqtt", {}).get("status") == "connected"
    live_ingest_ok = deps.get("live_ingest", {}).get("status") == "ok"

    return {
        "status": overall,
        "checked_at_utc": checked_at_utc,
        "active_engines": len(manager.engines),
        "active_machines": len(manager.active_machines),
        "capabilities": {
            "maintenance_writes": "ok" if supabase_ok else "queued_only",
            "planner": "ok" if supabase_ok else "local_fallback",
            "ai_reports": "ok" if groq_ok else "local_fallback",
            "email_alerts": "ok" if email_ok else "unavailable",
            "live_telemetry": "ok" if mqtt_ok or live_ingest_ok else "stale_only",
            "machine_reads": "ok" if supabase_ok else "cached_only",
        },
        "dependencies": {
            "supabase": deps.get("supabase", {}).get("status", "unknown"),
            "groq": deps.get("groq", {}).get("status", "unknown"),
            "smtp": deps.get("smtp", {}).get("status", "unknown"),
            "mqtt": deps.get("mqtt", {}).get("status", "unknown"),
            "live_ingest": deps.get("live_ingest", {}).get("status", "unknown"),
        },
    }


@router.get("/health/public-metrics")
def public_metrics():
    repo_root = Path(__file__).resolve().parents[2]
    outputs_dir = repo_root / "prediteq_ml" / "outputs"
    metrics = _read_metrics_file(outputs_dir / "metrics.json") or _FALLBACK_METRICS
    cmapss = _read_metrics_file(outputs_dir / "cmapss_metrics.json") or _FALLBACK_CMAPSS

    anomaly = metrics.get("hybrid_ensemble") or metrics.get("anomaly_detection", {}).get(
        "hybrid_ensemble", {}
    )
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
def health_detail(admin: CurrentUser = Depends(require_admin)):
    """GET /health/detail - detailed probe (admin only)."""
    try:
        manager = get_manager()
        deps = _collect_dependency_statuses()
        overall = _overall_status_from_dependencies(deps)

        return {
            "status": overall,
            "version": "1.0.0",
            "mqtt_connected": mqtt_is_connected(),
            "active_engines": len(manager.engines),
            "dependencies": deps,
            "machines": {
                code: {
                    "hi": manager.last_results.get(code, {}).get("hi_smooth"),
                    "zone": manager.last_results.get(code, {}).get("zone"),
                    "uptime_s": manager.last_results.get(code, {}).get("uptime_seconds"),
                }
                for code in manager.active_machines
            },
        }
    except RuntimeError:
        return {"status": "starting", "message": "API is still initializing"}
