import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from core.config import settings
from core.supabase_client import get_supabase
from ml.engine_manager import get_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])

_MACHINE_CODE_RE = re.compile(r"^[A-Z]{2,5}-[A-Z0-9]{1,5}$")


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
) -> None:
    expected = str(settings.LIVE_INGEST_TOKEN or "").strip()
    if not expected:
        raise HTTPException(
            503,
            "LIVE_INGEST_TOKEN is not configured on the backend.",
        )

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


@router.post("/live")
async def ingest_live_payload(
    body: LiveIngestRequest,
    authorization: str | None = Header(default=None),
    x_prediteq_ingest_token: str | None = Header(default=None),
):
    _require_ingest_token(authorization, x_prediteq_ingest_token)

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
        result = manager.ingest(machine_code, payload)
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
