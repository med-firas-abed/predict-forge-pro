"""
Seuils (thresholds) — configurable alert thresholds per PFE doc §6.3.
Stored in Supabase table 'seuils', loaded by scheduler.
Admin-only read/write.

GET  /seuils          — current thresholds
PUT  /seuils          — update thresholds
"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator

from core.supabase_client import get_supabase
from core.auth import CurrentUser, require_admin
from core.audit import log_audit
from core.config import settings

logger = logging.getLogger(__name__)
PLACEHOLDER_EMAIL_DOMAINS = {"example.com", "example.org", "example.net"}

router = APIRouter(prefix="/seuils", tags=["seuils"])

# ─── Default thresholds (used if table empty or missing) ──────────────────────

DEFAULTS = {
    "hi_critical": 0.3,
    "hi_surveillance": 0.6,
    "rul_critical_days": 7,
    "rul_surveillance_days": 30,
    "manager_email": settings.ADMIN_EMAIL or None,
    "technician_email": None,
}

LOCAL_OVERRIDES_PATH = Path(__file__).resolve().parents[1] / ".runtime" / "seuils_overrides.json"

# ─── Module-level cache (loaded at startup, refreshed on PUT) ─────────────────

_cache: dict = dict(DEFAULTS)


def _read_local_overrides() -> dict:
    if not LOCAL_OVERRIDES_PATH.exists():
        return {}
    try:
        return json.loads(LOCAL_OVERRIDES_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("Could not read local seuils overrides: %s", e)
        return {}


def _write_local_overrides(values: dict):
    try:
        LOCAL_OVERRIDES_PATH.parent.mkdir(parents=True, exist_ok=True)
        LOCAL_OVERRIDES_PATH.write_text(
            json.dumps(
                {
                    "manager_email": values.get("manager_email"),
                    "technician_email": values.get("technician_email"),
                },
                ensure_ascii=True,
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning("Could not write local seuils overrides: %s", e)


def _merge_with_defaults(row: dict | None, local_overrides: dict | None = None) -> dict:
    source = row or {}
    overrides = local_overrides or {}
    has_db_email_columns = "manager_email" in source or "technician_email" in source

    manager_email = source.get("manager_email") if has_db_email_columns else overrides.get("manager_email", DEFAULTS["manager_email"])
    technician_email = source.get("technician_email") if has_db_email_columns else overrides.get("technician_email", DEFAULTS["technician_email"])

    return {
        "hi_critical": float(source["hi_critical"]) if source.get("hi_critical") is not None else DEFAULTS["hi_critical"],
        "hi_surveillance": float(source["hi_surveillance"]) if source.get("hi_surveillance") is not None else DEFAULTS["hi_surveillance"],
        "rul_critical_days": float(source["rul_critical_days"]) if source.get("rul_critical_days") is not None else DEFAULTS["rul_critical_days"],
        "rul_surveillance_days": float(source["rul_surveillance_days"]) if source.get("rul_surveillance_days") is not None else DEFAULTS["rul_surveillance_days"],
        "manager_email": str(manager_email).strip() if manager_email else None,
        "technician_email": str(technician_email).strip() if technician_email else None,
    }


def _get_approved_admin_emails() -> list[str]:
    try:
        sb = get_supabase()
        profiles = (
            sb.table("profiles")
            .select("id")
            .eq("role", "admin")
            .eq("status", "approved")
            .execute()
            .data
            or []
        )
    except Exception as e:
        logger.warning("Could not load approved admin profiles for alerts: %s", e)
        return []

    emails: list[str] = []
    for profile in profiles:
        try:
            auth_user = sb.auth.admin.get_user_by_id(profile["id"])
            email = auth_user.user.email if auth_user and auth_user.user else None
            if email:
                emails.append(str(email).strip())
        except Exception as e:
            logger.warning("Could not resolve admin email for %s: %s", profile.get("id"), e)

    filtered: list[str] = []
    for email in emails:
        normalized = str(email).strip().lower()
        domain = normalized.split("@", 1)[1] if "@" in normalized else ""
        if domain in PLACEHOLDER_EMAIL_DOMAINS:
            logger.info("Ignoring placeholder admin email for alerts: %s", email)
            continue
        filtered.append(str(email).strip())

    return list(dict.fromkeys(email for email in filtered if email))


def get_thresholds() -> dict:
    """Return cached thresholds — used by scheduler."""
    return _cache


def get_admin_alert_recipients() -> list[str]:
    """Return approved admin emails, or the backend fallback when empty."""
    recipients = _get_approved_admin_emails()
    if recipients:
        return recipients
    if settings.ADMIN_EMAIL:
        return [settings.ADMIN_EMAIL]
    return []


def get_alert_recipients() -> list[str]:
    configured = [
        _cache.get("manager_email"),
        _cache.get("technician_email"),
    ]
    recipients = get_admin_alert_recipients() + [str(value).strip() for value in configured if value]
    if recipients:
        return list(dict.fromkeys(recipients))
    if settings.ADMIN_EMAIL:
        return [settings.ADMIN_EMAIL]
    return []


def load_thresholds_from_db():
    """Load thresholds from Supabase (called at startup)."""
    global _cache
    local_overrides = _read_local_overrides()
    try:
        sb = get_supabase()
        res = sb.table("seuils").select("*").limit(1).execute()
        if res.data:
            row = res.data[0] or {}
            _cache = _merge_with_defaults(row, local_overrides)
            logger.info("Loaded seuils from DB: %s", _cache)
        else:
            _cache = _merge_with_defaults({}, local_overrides)
            logger.info("No seuils in DB — using defaults: %s", _cache)
    except Exception as e:
        _cache = _merge_with_defaults({}, local_overrides)
        logger.warning("Could not load seuils from DB (using defaults): %s", e)


# ─── Request model ────────────────────────────────────────────────────────────

class SeuilsUpdate(BaseModel):
    hi_critical: float = Field(ge=0.0, le=1.0, description="HI below → urgence")
    hi_surveillance: float = Field(ge=0.0, le=1.0, description="HI below → surveillance")
    rul_critical_days: float = Field(ge=0, description="RUL below → urgence (days)")
    rul_surveillance_days: float = Field(ge=0, description="RUL below → surveillance (days)")
    manager_email: EmailStr | None = Field(default=None, description="Primary alert recipient")
    technician_email: EmailStr | None = Field(default=None, description="Secondary alert recipient")

    @field_validator("manager_email", "technician_email", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


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
        threshold_only = {
            "hi_critical": new_vals["hi_critical"],
            "hi_surveillance": new_vals["hi_surveillance"],
            "rul_critical_days": new_vals["rul_critical_days"],
            "rul_surveillance_days": new_vals["rul_surveillance_days"],
        }
        try:
            existing = sb.table("seuils").select("id").limit(1).execute()
            if existing.data:
                sb.table("seuils").update(threshold_only).eq("id", existing.data[0]["id"]).execute()
            else:
                sb.table("seuils").insert(threshold_only).execute()
        except Exception as inner_e:
            logger.warning("Could not persist thresholds to DB: %s", inner_e)
        logger.warning("Could not persist alert recipients to DB, using local fallback: %s", e)
        _write_local_overrides(new_vals)

    _cache = new_vals
    logger.info("Seuils updated: %s (by %s)", new_vals, admin.email)
    log_audit(admin.id, admin.email, "seuils.update", {"old": old_vals, "new": new_vals})
    return {"status": "ok", "seuils": _cache}
