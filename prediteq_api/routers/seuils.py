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
DEMO_CRITICAL_GUARANTEE: dict[str, list[str]] = {
    # Demo safeguard: ASC-C3 is the intentionally critical machine in the
    # simulator story, and this mailbox must keep receiving its alerts even if
    # profile resolution or configurable recipients drift.
    "ASC-C3": ["firasabed007@gmail.com"],
}

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


def _normalize_recipient(candidate: str | None, *, source: str = "alert") -> str | None:
    if not candidate:
        return None

    email = str(candidate).strip()
    if not email or "@" not in email:
        return None

    normalized = email.lower()
    domain = normalized.split("@", 1)[1] if "@" in normalized else ""
    if domain in PLACEHOLDER_EMAIL_DOMAINS:
        logger.info("Ignoring placeholder %s email for alerts: %s", source, email)
        return None
    return email


def _dedupe_recipients(candidates: list[str | None]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        email = _normalize_recipient(candidate)
        if not email:
            continue
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(email)
    return deduped


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

    emails: list[str | None] = []
    for profile in profiles:
        email = _resolve_profile_email(sb, profile.get("id"))
        if email:
            emails.append(email)

    return _dedupe_recipients(emails)


def _resolve_profile_email(sb, profile_id: str | None) -> str | None:
    if not profile_id:
        return None
    try:
        auth_user = sb.auth.admin.get_user_by_id(profile_id)
        email = auth_user.user.email if auth_user and auth_user.user else None
        return _normalize_recipient(email, source="profile")
    except Exception as e:
        logger.warning("Could not resolve profile email for %s: %s", profile_id, e)
        return None


def _get_machine_user_emails(machine_id: str | None) -> list[str]:
    if not machine_id:
        return []

    try:
        sb = get_supabase()
        profiles = (
            sb.table("profiles")
            .select("id")
            .eq("role", "user")
            .eq("status", "approved")
            .eq("machine_id", machine_id)
            .execute()
            .data
            or []
        )
    except Exception as e:
        logger.warning("Could not load approved machine users for alerts (%s): %s", machine_id, e)
        return []

    emails: list[str | None] = []
    for profile in profiles:
        email = _resolve_profile_email(sb, profile.get("id"))
        if email:
            emails.append(email)

    return _dedupe_recipients(emails)


def _get_machine_user_contacts(machine_id: str | None) -> list[dict]:
    if not machine_id:
        return []

    try:
        sb = get_supabase()
        profiles = (
            sb.table("profiles")
            .select("id, full_name")
            .eq("role", "user")
            .eq("status", "approved")
            .eq("machine_id", machine_id)
            .execute()
            .data
            or []
        )
    except Exception as e:
        logger.warning("Could not load approved machine user contacts for alerts (%s): %s", machine_id, e)
        return []

    contacts_by_email: dict[str, dict] = {}
    for profile in profiles:
        email = _resolve_profile_email(sb, profile.get("id"))
        if not email:
            continue
        contacts_by_email[email.lower()] = {
            "id": profile.get("id"),
            "full_name": str(profile.get("full_name") or "").strip(),
            "email": email,
        }

    return list(contacts_by_email.values())


def _get_machine_code(machine_id: str | None) -> str | None:
    if not machine_id:
        return None

    try:
        sb = get_supabase()
        result = (
            sb.table("machines")
            .select("code")
            .eq("id", machine_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not result:
            return None
        code = str(result[0].get("code") or "").strip()
        return code or None
    except Exception as e:
        logger.warning("Could not resolve machine code for recipients preview (%s): %s", machine_id, e)
        return None


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


def describe_alert_recipients(machine_id: str | None = None) -> dict:
    admin_emails = get_admin_alert_recipients()
    machine_users = _get_machine_user_contacts(machine_id)
    machine_code = _get_machine_code(machine_id)
    configured_manager = _normalize_recipient(_cache.get("manager_email"), source="manager_email")
    configured_technician = _normalize_recipient(_cache.get("technician_email"), source="technician_email")

    recipient_map: dict[str, dict] = {}

    def _register(
        email: str | None,
        source: str,
        *,
        contact_name: str | None = None,
    ) -> None:
        normalized = _normalize_recipient(email, source=source)
        if not normalized:
            return

        key = normalized.lower()
        entry = recipient_map.setdefault(
            key,
            {
                "email": normalized,
                "sources": [],
                "contact_names": [],
            },
        )

        if source not in entry["sources"]:
            entry["sources"].append(source)

        if contact_name:
            clean_name = str(contact_name).strip()
            if clean_name and clean_name not in entry["contact_names"]:
                entry["contact_names"].append(clean_name)

    for email in admin_emails:
        _register(email, "admin")

    for user in machine_users:
        _register(
            user.get("email"),
            "machine_user",
            contact_name=user.get("full_name"),
        )

    _register(configured_manager, "manager_email")
    _register(configured_technician, "technician_email")

    for guaranteed_email in DEMO_CRITICAL_GUARANTEE.get(machine_code or "", []):
        _register(guaranteed_email, "demo_critical_fallback")

    recipients = sorted(
        recipient_map.values(),
        key=lambda item: str(item.get("email") or "").lower(),
    )

    return {
        "machine_id": machine_id,
        "machine_code": machine_code,
        "admins": admin_emails,
        "machine_users": machine_users,
        "configured": {
            "manager_email": configured_manager,
            "technician_email": configured_technician,
        },
        "recipients": recipients,
    }


def get_alert_recipients(machine_id: str | None = None) -> list[str]:
    preview = describe_alert_recipients(machine_id)
    recipients = [
        str(entry.get("email")).strip()
        for entry in preview.get("recipients", [])
        if entry.get("email")
    ]
    if recipients:
        return recipients
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


@router.get("/recipients-preview")
async def get_recipients_preview(admin: CurrentUser = Depends(require_admin)):
    sb = get_supabase()
    try:
        machines = (
            sb.table("machines")
            .select("id, code, nom")
            .order("code")
            .execute()
            .data
            or []
        )
    except Exception as e:
        logger.error("Could not load machines for recipients preview: %s", e)
        raise HTTPException(502, "Erreur base de donnees")

    preview: list[dict] = []
    for machine in machines:
        summary = describe_alert_recipients(str(machine.get("id") or ""))
        preview.append(
            {
                "machine_id": machine.get("id"),
                "machine_code": machine.get("code"),
                "machine_name": machine.get("nom"),
                "admins": summary["admins"],
                "machine_users": summary["machine_users"],
                "configured": summary["configured"],
                "recipients": summary["recipients"],
            }
        )

    return preview


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
