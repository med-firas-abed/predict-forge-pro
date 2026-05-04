"""
JWT authentication dependency for FastAPI.
Verifies Supabase JWT tokens, extracts user profile.
"""

import logging
import asyncio
from typing import Optional

from fastapi import Depends, HTTPException, Header
from core.supabase_client import get_supabase

logger = logging.getLogger(__name__)


class CurrentUser:
    """Represents an authenticated user extracted from JWT + profiles table."""
    __slots__ = ("id", "email", "role", "status", "machine_id")

    def __init__(self, id: str, email: str, role: str, status: str,
                 machine_id: Optional[str]):
        self.id = id
        self.email = email
        self.role = role
        self.status = status
        self.machine_id = machine_id

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_approved(self) -> bool:
        return self.status == "approved"


def _metadata_value(user: object, *keys: str) -> Optional[str]:
    metadata = getattr(user, "user_metadata", None)
    if not isinstance(metadata, dict):
        return None

    for key in keys:
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return None


async def _get_user_from_token(authorization: str = Header(...)) -> CurrentUser:
    """
    Validate Supabase JWT and load profile.
    Expects: Authorization: Bearer <token>
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization[7:]

    sb = get_supabase()

    # Verify token with Supabase Auth
    try:
        user_resp = sb.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(401, "Invalid or expired token")
        user = user_resp.user
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Token verification failed: %s", e)
        raise HTTPException(401, "Invalid or expired token")

    # Fetch profile from profiles table
    profile = None
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            profile_res = sb.table("profiles").select("*").eq("id", user.id).execute()
            if not profile_res.data:
                raise HTTPException(403, "Profile not found")
            profile = profile_res.data[0]
            break
        except HTTPException:
            raise
        except Exception as e:
            last_error = e
            logger.warning("Profile fetch error (attempt %s/2) for %s: %s", attempt + 1, user.id, e)
            if attempt == 0:
                await asyncio.sleep(0.15)

    if profile is None:
        fallback_role = _metadata_value(user, "role") or "user"
        fallback_machine_id = _metadata_value(user, "machine_id")

        if fallback_role in {"admin", "user"}:
            logger.warning(
                "Falling back to auth metadata for %s after profile fetch failure: %s",
                user.id,
                last_error,
            )
            return CurrentUser(
                id=user.id,
                email=user.email or "",
                role=fallback_role,
                status="approved",
                machine_id=fallback_machine_id,
            )

        logger.error("Profile fetch error without fallback for %s: %s", user.id, last_error)
        raise HTTPException(500, "Could not fetch profile")

    return CurrentUser(
        id=user.id,
        email=user.email or "",
        role=profile.get("role", "user"),
        status=profile.get("status", "pending"),
        machine_id=profile.get("machine_id"),
    )


async def require_auth(user: CurrentUser = Depends(_get_user_from_token)) -> CurrentUser:
    """Dependency: requires approved account."""
    if not user.is_approved:
        raise HTTPException(403, "Account not approved")
    return user


async def require_admin(user: CurrentUser = Depends(require_auth)) -> CurrentUser:
    """Dependency: requires approved admin account."""
    if not user.is_admin:
        raise HTTPException(403, "Admin access required")
    return user


def get_machine_filter(user: CurrentUser) -> Optional[str]:
    """
    Returns machine UUID to filter by, or None if admin (sees all).
    Enforces data scoping: users only see their assigned machine.
    """
    if user.is_admin:
        return None  # admin sees all
    return user.machine_id
