"""
Auth & Admin endpoints — per PFE documentation §6.2.
POST /auth/signup       — public, creates account with status=pending
POST /auth/login        — public, verifies status=approved before returning JWT
GET  /me/status         — authenticated, returns account status
GET  /admin/users/pending   — admin, lists pending accounts
PATCH /admin/users/{id}/approve — admin
PATCH /admin/users/{id}/reject  — admin
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from core.supabase_client import get_supabase
from core.config import settings
from core.auth import CurrentUser, require_auth, require_admin, _get_user_from_token
from core.email_client import send_alert_email
from core.audit import log_audit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


# ─── Request / Response models ────────────────────────────────────────────────

import re as _re

_PASSWORD_RE = _re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$'
)


class SignupRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str = "user"  # "user" | "admin"
    machine_id: Optional[str] = None  # UUID — required for role=user


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class StatusResponse(BaseModel):
    id: str
    email: str
    role: str
    status: str
    machine_id: Optional[str] = None
    machine_code: Optional[str] = None


class PendingUser(BaseModel):
    id: str
    full_name: str
    email: Optional[str] = None
    role: str
    status: str
    machine_id: Optional[str] = None
    machine_code: Optional[str] = None
    created_at: Optional[str] = None


# ─── POST /auth/signup ────────────────────────────────────────────────────────

@router.post("/auth/signup")
def signup(body: SignupRequest):
    """Create account with status=pending. First approved admin bootstraps."""
    sb = get_supabase()

    # Security: always force role=user on signup — admins promote via separate endpoint
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")
    if body.role == "user" and not body.machine_id:
        raise HTTPException(400, "machine_id is required for role=user")
    # Block admin self-registration in production: only allow via first-bootstrap
    if body.role == "admin":
        try:
            count_res = sb.table("profiles") \
                .select("id", count="exact") \
                .eq("status", "approved") \
                .eq("role", "admin") \
                .execute()
            if count_res.count and count_res.count > 0:
                raise HTTPException(403, "L'inscription admin n'est pas autorisée. Contactez un administrateur existant.")
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Bootstrap check on signup: %s", e)

    # Password strength: min 8 chars, 1 upper, 1 lower, 1 digit
    if not _PASSWORD_RE.match(body.password):
        raise HTTPException(400, "Mot de passe trop faible : min 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre")

    # Create Supabase Auth user
    try:
        res = sb.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,  # skip email verification for SaaS
            "user_metadata": {
                "full_name": body.full_name,
                "role": body.role,
                "machine_id": body.machine_id,
            },
        })
        user_id = res.user.id
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower():
            raise HTTPException(409, "Un compte avec cet email existe déjà")
        logger.error("Signup error: %s", e)
        raise HTTPException(400, "Erreur lors de la création du compte")

    # Insert profile row (trigger might do this, but ensure it)
    try:
        sb.table("profiles").upsert({
            "id": user_id,
            "full_name": body.full_name,
            "role": body.role,
            "status": "pending",
            "machine_id": body.machine_id,
        }).execute()
    except Exception as e:
        logger.error("Profile upsert error: %s", e)

    # Auto-approve first admin (bootstrap)
    if body.role == "admin":
        try:
            count_res = sb.table("profiles") \
                .select("id", count="exact") \
                .eq("status", "approved") \
                .execute()
            if count_res.count == 0:
                sb.table("profiles").update({
                    "status": "approved",
                    "approved_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", user_id).execute()
                logger.info("Auto-approved first admin: %s", body.email)
                return {"status": "approved", "message": "Premier admin — approuvé automatiquement"}
        except Exception as e:
            logger.error("Bootstrap check error: %s", e)

    return {"status": "pending", "message": "Compte créé. En attente d'approbation."}


# ─── POST /auth/login ─────────────────────────────────────────────────────────

@router.post("/auth/login")
def login(body: LoginRequest):
    """Login — verify status=approved before returning session."""
    sb = get_supabase()

    try:
        res = sb.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
        user = res.user
        session = res.session
    except Exception as e:
        raise HTTPException(401, "Email ou mot de passe incorrect")

    # Check profile status
    try:
        profile_res = sb.table("profiles") \
            .select("*, machines(code)") \
            .eq("id", user.id) \
            .execute()
        if not profile_res.data:
            raise HTTPException(403, "Profil introuvable")
        profile = profile_res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Profile fetch on login: %s", e)
        raise HTTPException(500, "Erreur profil")

    status = profile.get("status", "pending")
    if status == "pending":
        raise HTTPException(403, "Votre compte est en attente d'approbation.")
    if status == "rejected":
        raise HTTPException(403, "Votre demande d'accès a été refusée.")

    # Approved → return session tokens
    machine = profile.get("machines")
    return {
        "status": "approved",
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "role": profile.get("role", "user"),
            "machine_id": profile.get("machine_id"),
            "machine_code": machine.get("code") if machine else None,
            "full_name": profile.get("full_name", ""),
        },
    }


# ─── GET /me/status ───────────────────────────────────────────────────────────

@router.get("/me/status", response_model=StatusResponse)
async def get_my_status(user: CurrentUser = Depends(_get_user_from_token)):
    """Returns current account status (for pending page polling)."""
    sb = get_supabase()
    try:
        profile_res = sb.table("profiles") \
            .select("*, machines(code)") \
            .eq("id", user.id) \
            .execute()
    except Exception as e:
        logger.error("Profile fetch for /me/status: %s", e)
        raise HTTPException(502, "Erreur base de données")

    if not profile_res.data:
        raise HTTPException(404, "Profile not found")

    p = profile_res.data[0]
    machine = p.get("machines")
    return StatusResponse(
        id=user.id,
        email=user.email,
        role=p.get("role", "user"),
        status=p.get("status", "pending"),
        machine_id=p.get("machine_id"),
        machine_code=machine.get("code") if machine else None,
    )


# ─── GET /admin/users ──────────────────────────────────────────────────────────

@router.get("/admin/users")
async def list_all_users(admin: CurrentUser = Depends(require_admin)):
    """List all users with emails resolved from auth.users."""
    sb = get_supabase()
    res = sb.table("profiles") \
        .select("*, machines(code)") \
        .order("created_at", desc=True) \
        .execute()

    users = []
    for p in res.data:
        # Resolve email from auth.users
        email = ""
        try:
            auth_user = sb.auth.admin.get_user_by_id(p["id"])
            if auth_user and auth_user.user:
                email = auth_user.user.email or ""
        except Exception:
            pass
        machine = p.get("machines")
        users.append({
            "id": p["id"],
            "full_name": p.get("full_name", ""),
            "email": email,
            "role": p.get("role", "user"),
            "status": p.get("status", "pending"),
            "machine_id": p.get("machine_id"),
            "machine_code": machine.get("code") if machine else None,
            "created_at": p.get("created_at"),
            "approved_at": p.get("approved_at"),
        })
    return users


# ─── GET /admin/users/pending ─────────────────────────────────────────────────

@router.get("/admin/users/pending", response_model=list[PendingUser])
async def list_pending_users(admin: CurrentUser = Depends(require_admin)):
    """List all pending user accounts, separated by role."""
    sb = get_supabase()
    res = sb.table("profiles") \
        .select("*, machines(code)") \
        .eq("status", "pending") \
        .order("created_at", desc=True) \
        .execute()

    users = []
    for p in res.data:
        machine = p.get("machines")
        users.append(PendingUser(
            id=p["id"],
            full_name=p.get("full_name", ""),
            role=p.get("role", "user"),
            status="pending",
            machine_id=p.get("machine_id"),
            machine_code=machine.get("code") if machine else None,
            created_at=p.get("created_at"),
        ))
    return users


# ─── PATCH /admin/users/{id}/approve ──────────────────────────────────────────

@router.patch("/admin/users/{user_id}/approve")
async def approve_user(user_id: str, admin: CurrentUser = Depends(require_admin)):
    """Approve a pending account. Sends confirmation email."""
    sb = get_supabase()

    # Fetch target user
    res = sb.table("profiles").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    target = res.data[0]

    if target.get("status") == "approved":
        return {"status": "already_approved"}

    # Cannot self-approve
    if user_id == admin.id:
        raise HTTPException(400, "Un administrateur ne peut pas approuver son propre compte")

    now_iso = datetime.now(timezone.utc).isoformat()
    sb.table("profiles").update({
        "status": "approved",
        "approved_at": now_iso,
        "approved_by": admin.id,
    }).eq("id", user_id).execute()

    # Send confirmation email
    try:
        auth_user = sb.auth.admin.get_user_by_id(user_id)
        email = auth_user.user.email if auth_user and auth_user.user else None
        if email:
            html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #27ae60;">✅ Compte approuvé — PrediTeq</h2>
                <p>Bonjour <b>{target.get('full_name', '')}</b>,</p>
                <p>Votre compte a été approuvé. Vous pouvez désormais vous connecter.</p>
                <p><a href="{settings.DASHBOARD_URL}" style="color: #3498db;">
                    Accéder à PrediTeq →
                </a></p>
            </div>
            """
            send_alert_email(email, "Compte approuvé — PrediTeq", html)
    except Exception as e:
        logger.warning("Could not send approval email: %s", e)

    log_audit(admin.id, admin.email, "user.approve", {"target_user_id": user_id})

    return {"status": "approved", "user_id": user_id, "approved_by": admin.id}


# ─── PATCH /admin/users/{id}/reject ───────────────────────────────────────────

@router.patch("/admin/users/{user_id}/reject")
async def reject_user(user_id: str, admin: CurrentUser = Depends(require_admin)):
    """Reject a pending account. Notifies user."""
    sb = get_supabase()

    res = sb.table("profiles").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    target = res.data[0]

    if target.get("status") == "approved":
        raise HTTPException(400, "Impossible de rejeter un utilisateur déjà approuvé")

    sb.table("profiles").update({
        "status": "rejected",
    }).eq("id", user_id).execute()

    # Send rejection email
    try:
        auth_user = sb.auth.admin.get_user_by_id(user_id)
        email = auth_user.user.email if auth_user and auth_user.user else None
        if email:
            html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #e74c3c;">❌ Demande refusée — PrediTeq</h2>
                <p>Bonjour <b>{target.get('full_name', '')}</b>,</p>
                <p>Votre demande d'accès a été refusée. Contactez votre administrateur.</p>
            </div>
            """
            send_alert_email(email, "Demande refusée — PrediTeq", html)
    except Exception as e:
        logger.warning("Could not send rejection email: %s", e)

    log_audit(admin.id, admin.email, "user.reject", {"target_user_id": user_id})

    return {"status": "rejected", "user_id": user_id}
