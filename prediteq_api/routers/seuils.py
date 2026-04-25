"""
Seuils (thresholds) — configurable alert thresholds per PFE doc §6.3.
Stored in Supabase table 'seuils', loaded by scheduler.
Admin-only read/write.

GET  /seuils          — current thresholds
PUT  /seuils          — update thresholds
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.supabase_client import get_supabase
from core.auth import CurrentUser, require_admin
from core.audit import log_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/seuils", tags=["seuils"])

# ─── Default thresholds (used if table empty or missing) ──────────────────────

DEFAULTS = {
    "hi_critical": 0.3,
    "hi_surveillance": 0.6,
    "rul_critical_days": 7,
    "rul_surveillance_days": 30,
}

# ─── Module-level cache (loaded at startup, refreshed on PUT) ─────────────────

_cache: dict = dict(DEFAULTS)


def get_thresholds() -> dict:
    """Return cached thresholds — used by scheduler."""
    return _cache


def load_thresholds_from_db():
    """Load thresholds from Supabase (called at startup)."""
    global _cache
    try:
        sb = get_supabase()
        res = sb.table("seuils").select("*").limit(1).execute()
        if res.data:
            row = res.data[0]
            _cache = {
                "hi_critical": float(row["hi_critical"]) if row.get("hi_critical") is not None else DEFAULTS["hi_critical"],
                "hi_surveillance": float(row["hi_surveillance"]) if row.get("hi_surveillance") is not None else DEFAULTS["hi_surveillance"],
                "rul_critical_days": float(row["rul_critical_days"]) if row.get("rul_critical_days") is not None else DEFAULTS["rul_critical_days"],
                "rul_surveillance_days": float(row["rul_surveillance_days"]) if row.get("rul_surveillance_days") is not None else DEFAULTS["rul_surveillance_days"],
            }
            logger.info("Loaded seuils from DB: %s", _cache)
        else:
            logger.info("No seuils in DB — using defaults: %s", DEFAULTS)
    except Exception as e:
        logger.warning("Could not load seuils from DB (using defaults): %s", e)


# ─── Request model ────────────────────────────────────────────────────────────

class SeuilsUpdate(BaseModel):
    hi_critical: float = Field(ge=0.0, le=1.0, description="HI below → urgence")
    hi_surveillance: float = Field(ge=0.0, le=1.0, description="HI below → surveillance")
    rul_critical_days: float = Field(ge=0, description="RUL below → urgence (days)")
    rul_surveillance_days: float = Field(ge=0, description="RUL below → surveillance (days)")


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/public")
async def get_seuils_public():
    """GET /seuils/public — thresholds for frontend display (non-sensitive)."""
    return {
        "hi_critical": _cache["hi_critical"],
        "hi_surveillance": _cache["hi_surveillance"],
    }


@router.get("")
async def get_seuils(admin: CurrentUser = Depends(require_admin)):
    """GET /seuils — current alert thresholds (admin only, includes RUL)."""
    return _cache


@router.put("")
async def update_seuils(body: SeuilsUpdate,
                         admin: CurrentUser = Depends(require_admin)):
    """PUT /seuils — update thresholds in DB and cache."""
    global _cache

    if body.hi_critical >= body.hi_surveillance:
        raise HTTPException(400, "hi_critical must be less than hi_surveillance")
    if body.rul_critical_days >= body.rul_surveillance_days:
        raise HTTPException(400, "rul_critical_days must be less than rul_surveillance_days")
    if body.hi_critical < 0.05 or body.hi_critical > 0.95:
        raise HTTPException(400, "hi_critical must be between 0.05 and 0.95")
    if body.hi_surveillance < 0.05 or body.hi_surveillance > 0.95:
        raise HTTPException(400, "hi_surveillance must be between 0.05 and 0.95")
    if body.rul_critical_days < 1:
        raise HTTPException(400, "rul_critical_days must be at least 1")
    if body.rul_surveillance_days < 2:
        raise HTTPException(400, "rul_surveillance_days must be at least 2")

    new_vals = body.model_dump()
    old_vals = dict(_cache)

    sb = get_supabase()
    try:
        # Upsert: use a single row (id = 1 or first row)
        existing = sb.table("seuils").select("id").limit(1).execute()
        if existing.data:
            sb.table("seuils").update(new_vals).eq("id", existing.data[0]["id"]).execute()
        else:
            sb.table("seuils").insert(new_vals).execute()
    except Exception as e:
        # Table might not exist yet — just update cache
        logger.warning("Could not persist seuils to DB: %s", e)

    _cache = new_vals
    logger.info("Seuils updated: %s (by %s)", new_vals, admin.email)
    log_audit(admin.id, admin.email, "seuils.update", {"old": old_vals, "new": new_vals})
    return {"status": "ok", "seuils": _cache}
