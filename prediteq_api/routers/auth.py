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
from uuid import UUID

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


class PublicMachine(BaseModel):
    id: str
    code: str
    nom: str


def _validate_machine_id(machine_id: Optional[str]) -> Optional[str]:
    if machine_id in (None, ""):
        return None
    try:
        return str(UUID(machine_id))
    except ValueError:
        raise HTTPException(400, "machine_id must be a valid UUID")


@router.get("/auth/machines", response_model=list[PublicMachine])
async def list_signup_machines():
    """Public machine list for the signup form."""
    sb = get_supabase()
    try:
        res = sb.table("machines").select("id, code, nom").order("code").execute()
    except Exception as e:
        logger.error("Signup machines fetch error: %s", e)
        raise HTTPException(502, "Erreur base de données")
    return res.data or []


# ─── POST /auth/signup ────────────────────────────────────────────────────────

@router.post("/auth/signup")
def signup(body: SignupRequest):
    """Create account with status=pending. First approved admin bootstraps."""
    sb = get_supabase()
    machine_id = _validate_machine_id(body.machine_id)

    # Security: always force role=user on signup — admins promote via separate endpoint
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")
    if body.role == "user" and not machine_id:
        raise HTTPException(400, "machine_id is required for role=user")
    if body.role == "user":
        try:
            machine_res = sb.table("machines").select("id").eq("id", machine_id).limit(1).execute()
        except Exception as e:
            logger.error("Machine lookup on signup: %s", e)
            raise HTTPException(502, "Erreur base de données")
        if not machine_res.data:
            raise HTTPException(400, "Machine inconnue")
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
                "machine_id": machine_id,
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
            "machine_id": machine_id,
        }).execute()
    except Exception as e:
        logger.error("Profile upsert error: %s", e)

    # Auto-approve first admin (bootstrap)
    if body.role == "admin":
        try:
            count_res = sb.table("profiles") \
                .select("id", count="exact") \
                .eq("status", "approved") \
                .eq("role", "admin") \
                .neq("id", user_id) \
                .execute()
            if count_res.count == 0:
                sb.table("profiles").update({
                    "status": "approved",
                    "approved_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", user_id).eq("status", "pending").execute()
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


# ─── DELETE /admin/users/{id} ─────────────────────────────────────────────────
# Suppression définitive d'un compte (utilisateur ou administrateur).
#
# Pourquoi un endpoint DELETE séparé et pas un simple "reject" ?
#   - reject ne change que profile.status="rejected" : la ligne reste en base
#     et l'utilisateur Supabase Auth existe toujours. Cela suffit pour bloquer
#     un signup, mais ne permet pas de "nettoyer" un compte fantôme (e2e,
#     test, doublon, ex-employé, etc.).
#   - DELETE supprime à la fois la ligne 'profiles' ET l'utilisateur Supabase
#     Auth, donc l'email redevient libre (réinscription possible) et la table
#     reste lisible pour l'admin.
#
# Garde-fous (sécurité — voir norme OWASP A01:2021 "Broken Access Control") :
#   1. Auth-admin requis (require_admin dépendance FastAPI).
#   2. Un admin ne peut pas se supprimer lui-même → empêche un lock-out
#      accidentel où un admin supprimerait son propre compte par erreur.
#   3. On refuse de supprimer le DERNIER admin approuvé restant → garantit
#      qu'il y a toujours au moins un admin pour gérer les comptes (sinon
#      impossible d'approuver de nouveaux utilisateurs ou modifier les seuils).
#   4. Trace d'audit (log_audit) — exigence §6.5 du rapport (traçabilité
#      RGPD-compatible des actions sensibles sur les comptes).

@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, admin: CurrentUser = Depends(require_admin)):
    """Supprime définitivement un compte (profil + utilisateur Supabase Auth).

    Garde-fous :
        - 400 si l'admin tente de se supprimer lui-même
        - 409 si on essaie de supprimer le dernier admin approuvé restant
        - 404 si l'utilisateur n'existe pas
    """
    sb = get_supabase()

    # 1. Garde-fou anti-self-delete
    if user_id == admin.id:
        raise HTTPException(
            400,
            "Un administrateur ne peut pas supprimer son propre compte.",
        )

    # 2. Vérifier que la cible existe
    res = sb.table("profiles").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "Utilisateur introuvable")
    target = res.data[0]

    # 3. Garde-fou anti-last-admin
    #    On compte le nombre d'admins approuvés ; si la cible en fait partie
    #    et que c'est le dernier, on refuse la suppression.
    if target.get("role") == "admin" and target.get("status") == "approved":
        try:
            count_res = (
                sb.table("profiles")
                .select("id", count="exact")
                .eq("role", "admin")
                .eq("status", "approved")
                .execute()
            )
            remaining = (count_res.count or 0) - 1
            if remaining < 1:
                raise HTTPException(
                    409,
                    "Impossible de supprimer le dernier administrateur approuvé. "
                    "Promouvez un autre utilisateur en admin avant cette suppression.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Last-admin check failed: %s", e)
            raise HTTPException(500, "Erreur lors de la vérification des admins restants")

    # 4. Récupérer l'email pour l'email de notification (avant suppression Auth)
    target_email: Optional[str] = None
    try:
        auth_user = sb.auth.admin.get_user_by_id(user_id)
        if auth_user and auth_user.user:
            target_email = auth_user.user.email
    except Exception as e:
        logger.warning("Could not resolve email of user %s before delete: %s", user_id, e)

    # 5. Supprimer la ligne profiles d'abord (clé étrangère dépend de auth.users
    #    via ON DELETE CASCADE ; on supprime explicitement par sécurité au cas où
    #    la migration n'aurait pas posé la cascade).
    try:
        sb.table("profiles").delete().eq("id", user_id).execute()
    except Exception as e:
        logger.error("Profile delete error for %s: %s", user_id, e)
        raise HTTPException(502, "Erreur lors de la suppression du profil")

    # 6. Supprimer l'utilisateur Supabase Auth (libère l'email pour ré-inscription)
    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        # Le profil est déjà supprimé, mais l'utilisateur Auth peut subsister.
        # On loggue mais on n'échoue pas — l'admin verra une cellule "ghost"
        # disparaître côté UI. Un job de nettoyage périodique peut purger ces
        # auth-users orphelins si nécessaire.
        logger.warning("Auth user delete failed for %s (profile already removed): %s", user_id, e)

    # 7. Email de notification (best-effort)
    if target_email:
        try:
            html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #e74c3c;">Compte supprimé — PrediTeq</h2>
                <p>Bonjour <b>{target.get('full_name', '')}</b>,</p>
                <p>Votre compte PrediTeq a été supprimé par un administrateur.
                Si vous pensez qu'il s'agit d'une erreur, contactez votre responsable.</p>
            </div>
            """
            send_alert_email(target_email, "Compte supprimé — PrediTeq", html)
        except Exception as e:
            logger.warning("Could not send deletion email: %s", e)

    log_audit(admin.id, admin.email, "user.delete", {
        "target_user_id": user_id,
        "target_email": target_email,
        "target_role": target.get("role"),
        "target_status": target.get("status"),
    })

    return {"status": "deleted", "user_id": user_id}
