import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from core.auth import CurrentUser
from core.config import settings
from core.demo_context import get_demo_scenario
from core.labview_demo import PROFILE_NAMES, SCENARIOS, build_runtime_history
from core.supabase_client import get_supabase
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])

_MACHINE_CODE_RE = re.compile(r"^[A-Z]{2,5}-[A-Z0-9]{1,5}$")
_STANDARD_USER_MACHINE_AUTOSEED_LOCKS: dict[str, asyncio.Lock] = {}


class LiveIngestRequest(BaseModel):
    machine_id: str = Field(..., min_length=3, max_length=32)
    observed_at: str | None = None
    timestamp: str | None = None
    rms_mms: float
    power_kw: float
    temp_c: float
    humidity_rh: float
    current_a: float | None = None
    load_kg: float | None = None
    vibration_raw: float | None = None
    vibration_rms: float | None = None
    status: str | None = None
    source: str | None = None


class LiveBootstrapRequest(BaseModel):
    machine_id: str = Field(..., min_length=3, max_length=32)
    scenario: Literal["healthy", "surveillance", "critical"] = "surveillance"
    profile: str | None = None
    duration_s: int = Field(default=3600, ge=600, le=86_400)
    seed: int = Field(default=42, ge=0)
    source: str | None = None
    persist_machine_metrics: bool = True
    cycles_per_day_override: float | None = Field(default=None, ge=0.0, le=2_000.0)
    power_avg_30j_override: float | None = Field(default=None, ge=0.0, le=10.0)


def _allow_extreme_source(source: str | None) -> bool:
    normalized = str(source or "").strip().lower()
    if not normalized:
        return False
    return any(
        hint in normalized
        for hint in (
            "labview",
            "bridge_pc",
            "site_bridge_pc",
            "relay_pc",
            "relay",
            "plc_bridge",
        )
    )


def _extract_token(
    authorization: str | None,
    x_prediteq_ingest_token: str | None,
) -> str | None:
    if x_prediteq_ingest_token:
        return x_prediteq_ingest_token.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def _require_ingest_token(
    authorization: str | None,
    x_prediteq_ingest_token: str | None,
    request: Request | None = None,
) -> None:
    expected = str(settings.LIVE_INGEST_TOKEN or "").strip()
    if not expected:
        client_host = (request.client.host if request and request.client else "").strip().lower()
        if client_host in {"127.0.0.1", "::1", "localhost"}:
            logger.warning(
                "LIVE_INGEST_TOKEN not configured - allowing loopback ingest request from %s",
                client_host or "unknown",
            )
            return
        raise HTTPException(503, "LIVE_INGEST_TOKEN is not configured on the backend.")

    provided = _extract_token(authorization, x_prediteq_ingest_token)
    if not provided or provided != expected:
        raise HTTPException(401, "Invalid ingest token")


def _load_machine_from_db(machine_code: str) -> dict | None:
    try:
        result = (
            get_supabase()
            .table("machines")
            .select("*")
            .eq("code", machine_code)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning(
            "Live ingest: could not refresh machine cache for %s: %s",
            machine_code,
            exc,
        )
        return None
    return (result.data or [None])[0]


def _ensure_machine_cached(machine_code: str, manager) -> dict:
    cached = manager.machine_cache.get(machine_code)
    if cached is not None:
        return cached

    row = _load_machine_from_db(machine_code)
    if row is None:
        raise HTTPException(404, f"Machine '{machine_code}' is not registered")

    manager.machine_cache[machine_code] = {
        **manager.machine_cache.get(machine_code, {}),
        **row,
    }
    logger.info(
        "Live ingest: loaded machine %s from Supabase after first HTTP payload",
        machine_code,
    )
    return manager.machine_cache[machine_code]


def _zone_to_statut(zone: str | None, hi: float | None = None) -> str:
    if zone == "Excellent":
        return "operational"
    if zone in {"Good", "Degraded"}:
        return "degraded"
    if zone == "Critical":
        return "critical"
    if hi is None:
        return "operational"
    if hi >= 0.8:
        return "operational"
    if hi >= 0.3:
        return "degraded"
    return "critical"


def _apply_bootstrap_metric_overrides(
    machine_code: str,
    manager,
    *,
    cycles_per_day_override: float | None,
    power_avg_30j_override: float | None,
) -> None:
    cached = manager.machine_cache.get(machine_code)
    if cached is None:
        return

    if cycles_per_day_override is not None:
        manager.set_cycles_per_day_override(machine_code, float(cycles_per_day_override))
        cached["cycles_avg_7j"] = round(float(cycles_per_day_override), 1)

    if power_avg_30j_override is not None:
        cached["power_avg_30j"] = round(float(power_avg_30j_override), 4)

    if cycles_per_day_override is not None or power_avg_30j_override is not None:
        cached["metrics_updated"] = datetime.now(timezone.utc).isoformat()


def _stable_machine_seed(machine_code: str) -> int:
    score = sum((idx + 1) * ord(char) for idx, char in enumerate(machine_code))
    return max(1, score % 9_973)


def _machine_has_runtime_snapshot(manager, machine_code: str) -> bool:
    if manager.last_raw.get(machine_code):
        return True
    if manager.last_results.get(machine_code):
        return True
    history = manager.sensor_history.get(machine_code)
    return bool(history and len(history) > 0)


def _scenario_from_health_state(health_state: str | None) -> Literal["healthy", "surveillance", "critical"] | None:
    normalized = str(health_state or "").strip().lower()
    if normalized in {"healthy", "good", "operational", "excellent"}:
        return "healthy"
    if normalized in {"surveillance", "watch", "degraded", "maintenance"}:
        return "surveillance"
    if normalized == "critical":
        return "critical"
    return None


def _resolve_standard_user_autoseed_plan(machine_code: str, machine_row: dict, manager) -> dict:
    if machine_code == "ARO-01":
        return {
            "scenario": "healthy",
            "profile": "A_linear",
            "cycles_per_day_override": 280.0,
            "power_avg_30j_override": 1.18,
        }

    demo_scenario = get_demo_scenario(machine_code) or {}
    mapped_demo_scenario = _scenario_from_health_state(demo_scenario.get("health_state"))
    if mapped_demo_scenario is not None:
        cycles_per_day = demo_scenario.get("cycles_per_day")
        power_avg = demo_scenario.get("power_avg_30j_kw")
        return {
            "scenario": mapped_demo_scenario,
            "profile": demo_scenario.get("profile"),
            "cycles_per_day_override": float(cycles_per_day) if cycles_per_day is not None else None,
            "power_avg_30j_override": float(power_avg) if power_avg is not None else None,
        }

    live = dict(manager.last_results.get(machine_code) or {})
    hi_raw = live.get("hi_smooth")
    if hi_raw is None:
        hi_raw = machine_row.get("hi_courant")

    try:
        hi_value = float(hi_raw) if hi_raw is not None else None
    except (TypeError, ValueError):
        hi_value = None

    zone = str(live.get("zone") or "").strip().lower()
    statut = str(machine_row.get("statut") or "").strip().lower()
    scenario = "surveillance"
    if zone == "critical" or statut == "critical" or (hi_value is not None and hi_value <= 0.30):
        scenario = "critical"
    elif zone in {"excellent", "good"} or statut == "operational" or (hi_value is not None and hi_value >= 0.80):
        scenario = "healthy"

    cycles_per_day = machine_row.get("cycles_avg_7j")
    power_avg = machine_row.get("power_avg_30j")
    return {
        "scenario": scenario,
        "profile": None,
        "cycles_per_day_override": float(cycles_per_day) if cycles_per_day is not None else None,
        "power_avg_30j_override": float(power_avg) if power_avg is not None else None,
    }


async def ensure_standard_user_machine_runtime_ready(
    machine_code: str,
    user: CurrentUser,
    *,
    manager=None,
    machine_row: dict | None = None,
) -> dict | None:
    machine_code = str(machine_code or "").strip().upper()
    if not _MACHINE_CODE_RE.match(machine_code):
        return None
    if user.is_admin or not user.is_approved or not user.machine_id:
        return None
    if not settings.STANDARD_USER_MACHINE_AUTOSEED_ENABLED:
        return None

    manager = manager or get_manager()

    try:
        if machine_row is None:
            machine_row = _ensure_machine_cached(machine_code, manager)
        else:
            manager.machine_cache[machine_code] = {
                **manager.machine_cache.get(machine_code, {}),
                **machine_row,
            }
    except Exception as exc:
        logger.warning(
            "Standard-user autoseed: could not resolve machine %s for %s: %s",
            machine_code,
            user.id,
            exc,
        )
        return None

    if str(machine_row.get("id") or "") != str(user.machine_id):
        return None
    if _machine_has_runtime_snapshot(manager, machine_code):
        return None

    lock = _STANDARD_USER_MACHINE_AUTOSEED_LOCKS.setdefault(machine_code, asyncio.Lock())
    async with lock:
        if _machine_has_runtime_snapshot(manager, machine_code):
            return None

        plan = _resolve_standard_user_autoseed_plan(machine_code, machine_row, manager)
        source_label = "simulator_user_machine"
        try:
            payload = await asyncio.to_thread(
                bootstrap_live_machine,
                machine_code,
                scenario=plan["scenario"],
                profile=plan["profile"],
                duration_s=3600,
                seed=_stable_machine_seed(machine_code),
                source=source_label,
                persist_machine_metrics=True,
                cycles_per_day_override=plan["cycles_per_day_override"],
                power_avg_30j_override=plan["power_avg_30j_override"],
            )
        except HTTPException as exc:
            logger.warning(
                "Standard-user autoseed skipped for %s (%s): %s",
                machine_code,
                user.id,
                exc.detail,
            )
            return None
        except Exception as exc:
            logger.warning(
                "Standard-user autoseed failed for %s (%s): %s",
                machine_code,
                user.id,
                exc,
            )
            return None

        logger.info(
            "Standard-user autoseed prepared %s for user %s with scenario %s",
            machine_code,
            user.id,
            plan["scenario"],
        )
        return payload


def _persist_bootstrap_state(
    machine_code: str,
    manager,
    *,
    persist_machine_metrics: bool,
    cycles_per_day_override: float | None,
    power_avg_30j_override: float | None,
) -> dict:
    raw = dict(manager.last_raw.get(machine_code) or {})
    live = dict(manager.last_results.get(machine_code) or {})
    cached = manager.machine_cache.get(machine_code, {})

    update_data: dict = {
        "derniere_maj": raw.get("observed_at") or datetime.now(timezone.utc).isoformat(),
    }

    hi_smooth = live.get("hi_smooth")
    if hi_smooth is not None:
        update_data["hi_courant"] = round(float(hi_smooth), 4)
    zone = live.get("zone")
    if zone or hi_smooth is not None:
        update_data["statut"] = _zone_to_statut(zone, float(hi_smooth) if hi_smooth is not None else None)

    try:
        from routers.diagnostics_rul import build_calibrated_rul_response

        calibrated = build_calibrated_rul_response(manager, machine_code)
        prediction = (calibrated.get("prediction") or {}) if isinstance(calibrated, dict) else {}
        if calibrated.get("mode") == "prediction" and prediction.get("rul_days") is not None:
            update_data["rul_courant"] = float(prediction["rul_days"])
    except Exception as exc:
        logger.warning("Live bootstrap: could not persist calibrated RUL for %s: %s", machine_code, exc)

    should_persist_metric_snapshot = (
        bool(persist_machine_metrics)
        or cycles_per_day_override is not None
        or power_avg_30j_override is not None
    )

    if should_persist_metric_snapshot:
        power_avg = (
            float(power_avg_30j_override)
            if power_avg_30j_override is not None
            else manager.get_recent_ascent_power_mean_kw(machine_code)
        )
        if power_avg is not None:
            update_data["power_avg_30j"] = round(float(power_avg), 4)

        cycles_avg = (
            float(cycles_per_day_override)
            if cycles_per_day_override is not None
            else manager.get_cycles_per_day(machine_code)
        )
        if cycles_avg is not None:
            update_data["cycles_avg_7j"] = round(float(cycles_avg), 1)

        update_data["metrics_updated"] = datetime.now(timezone.utc).isoformat()

    cached.update(update_data)

    try:
        get_supabase().table("machines").update(update_data).eq("code", machine_code).execute()
    except Exception as exc:
        logger.warning("Live bootstrap: could not persist machine state for %s: %s", machine_code, exc)

    return update_data


def bootstrap_live_machine(
    machine_code: str,
    *,
    scenario: Literal["healthy", "surveillance", "critical"] = "surveillance",
    profile: str | None = None,
    duration_s: int = 3600,
    seed: int = 42,
    source: str | None = None,
    persist_machine_metrics: bool = True,
    cycles_per_day_override: float | None = None,
    power_avg_30j_override: float | None = None,
) -> dict:
    machine_code = str(machine_code).strip().upper()
    if not _MACHINE_CODE_RE.match(machine_code):
        raise HTTPException(400, "Invalid machine code")
    if profile is not None and profile not in PROFILE_NAMES:
        raise HTTPException(
            400,
            f"Invalid profile. Use one of: {', '.join(PROFILE_NAMES)}",
        )

    manager = get_manager()
    machine_row = _ensure_machine_cached(machine_code, manager)

    source_label = str(source or "labview_demo_bootstrap")
    try:
        raw_history = build_runtime_history(
            machine_id=machine_code,
            scenario=scenario,
            profile=profile,
            duration_s=int(duration_s),
            seed=int(seed),
            source=source_label,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    try:
        result = manager.bootstrap_history(machine_code, raw_history)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Live bootstrap failed for %s: %s", machine_code, exc)
        raise HTTPException(422, f"Could not bootstrap machine: {exc}") from exc

    _apply_bootstrap_metric_overrides(
        machine_code,
        manager,
        cycles_per_day_override=cycles_per_day_override,
        power_avg_30j_override=power_avg_30j_override,
    )

    persisted = _persist_bootstrap_state(
        machine_code,
        manager,
        persist_machine_metrics=bool(persist_machine_metrics),
        cycles_per_day_override=cycles_per_day_override,
        power_avg_30j_override=power_avg_30j_override,
    )

    calibrated_payload = None
    calibrated_mode = None
    rul_days = None
    try:
        from routers.diagnostics_rul import build_calibrated_rul_response

        calibrated_payload = build_calibrated_rul_response(manager, machine_code)
        calibrated_mode = (
            calibrated_payload.get("mode") if isinstance(calibrated_payload, dict) else None
        )
        prediction = (
            (calibrated_payload.get("prediction") or {})
            if isinstance(calibrated_payload, dict)
            else {}
        )
        if calibrated_mode == "prediction" and prediction.get("rul_days") is not None:
            rul_days = float(prediction["rul_days"])
    except Exception as exc:
        logger.warning(
            "Live bootstrap: calibrated RUL unavailable for %s: %s",
            machine_code,
            exc,
        )

    raw = dict(manager.last_raw.get(machine_code) or {})
    live = dict(manager.last_results.get(machine_code) or {})

    return {
        "status": "ok",
        "machine_code": machine_code,
        "machine_uuid": machine_row.get("id"),
        "scenario": scenario,
        "profile": profile or SCENARIOS[scenario]["default_profile"],
        "rows_seeded": len(raw_history),
        "duration_s": duration_s,
        "source": source_label,
        "observed_from": raw_history[0]["observed_at"] if raw_history else None,
        "observed_to": raw_history[-1]["observed_at"] if raw_history else None,
        "hi": live.get("hi_smooth") if live else (result or {}).get("hi_smooth"),
        "zone": live.get("zone") if live else (result or {}).get("zone"),
        "buffer_hi_len": live.get("buffer_hi_len") if live else (result or {}).get("buffer_hi_len"),
        "cycles_per_day": manager.get_cycles_per_day(machine_code),
        "power_avg_30j": manager.get_power_avg_30j(machine_code),
        "calibrated_mode": calibrated_mode,
        "rul_days": rul_days,
        "persisted": persisted,
        "note": (
            "Bootstrap complete. You can now start the relay-PC CSV replay and the app will "
            "continue on the same live-runtime machine."
        ),
    }


@router.post("/live")
async def ingest_live_payload(
    body: LiveIngestRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_prediteq_ingest_token: str | None = Header(default=None),
):
    _require_ingest_token(authorization, x_prediteq_ingest_token, request)

    machine_code = str(body.machine_id).strip().upper()
    if not _MACHINE_CODE_RE.match(machine_code):
        raise HTTPException(400, "Invalid machine code")

    manager = get_manager()
    machine_row = _ensure_machine_cached(machine_code, manager)

    payload = body.model_dump(exclude_none=True)
    payload["machine_id"] = machine_code
    if payload.get("timestamp") and not payload.get("observed_at"):
        payload["observed_at"] = payload["timestamp"]
    if not payload.get("observed_at"):
        payload["observed_at"] = datetime.now(timezone.utc).isoformat()
    payload["source"] = str(payload.get("source") or "http_bridge")

    try:
        result = manager.ingest(
            machine_code,
            payload,
            allow_extreme=_allow_extreme_source(payload.get("source")),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Live ingest failed for %s: %s",
            machine_code,
            exc,
        )
        raise HTTPException(422, f"Could not ingest payload: {exc}")

    return {
        "status": "ok",
        "machine_code": machine_code,
        "machine_uuid": machine_row.get("id"),
        "observed_at": payload["observed_at"],
        "source": payload["source"],
        "hi": result.get("hi_smooth") if isinstance(result, dict) else None,
        "zone": result.get("zone") if isinstance(result, dict) else None,
    }


@router.post("/bootstrap/labview-demo")
async def bootstrap_labview_demo_payload(
    body: LiveBootstrapRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_prediteq_ingest_token: str | None = Header(default=None),
):
    """Seed a real machine with one realistic recent history before live CSV replay.

    This is the smooth jury/demo path for the real-machine integration:
      relay-PC CSV path stays the same,
      but the runtime gets enough recent history to publish HI/RUL immediately.
    """
    _require_ingest_token(authorization, x_prediteq_ingest_token, request)

    return bootstrap_live_machine(
        body.machine_id,
        scenario=body.scenario,
        profile=body.profile,
        duration_s=int(body.duration_s),
        seed=int(body.seed),
        source=body.source,
        persist_machine_metrics=bool(body.persist_machine_metrics),
        cycles_per_day_override=body.cycles_per_day_override,
        power_avg_30j_override=body.power_avg_30j_override,
    )
