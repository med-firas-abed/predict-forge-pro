"""
Outil one-shot — suppression d'un compte (profil + Supabase Auth user).

Pourquoi ce script existe :
    L'endpoint DELETE /admin/users/{id} (voir routers/auth.py) couvre le cas
    général (admin connecté, suppression via UI). Mais quand on doit purger un
    compte de test/E2E sans redémarrer le backend, ce script lit directement
    les credentials Supabase service-role du .env et supprime le compte.

Usage :
    cd prediteq_api
    python scripts/delete_user.py opencode.e2e.1777305465@example.com
    # ou par UUID :
    python scripts/delete_user.py 4b7a-...-uuid

Garde-fous :
    - Demande confirmation interactive avant suppression.
    - Refuse de supprimer le DERNIER admin approuvé.
"""

import argparse
import os
import re
import sys

from dotenv import load_dotenv
from supabase import create_client


UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def main() -> int:
    # Charge .env du même dossier que prediteq_api/
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(os.path.dirname(here), ".env")
    load_dotenv(env_path)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERREUR : SUPABASE_URL / SUPABASE_SERVICE_KEY manquants dans .env", file=sys.stderr)
        return 1

    parser = argparse.ArgumentParser(description="Supprime un compte (profil + auth user)")
    parser.add_argument("identifier", help="Email ou UUID du compte à supprimer")
    parser.add_argument("--yes", action="store_true", help="Skip la confirmation interactive")
    args = parser.parse_args()

    sb = create_client(url, key)

    # Résolution identifier -> user_id
    if UUID_RE.match(args.identifier):
        user_id = args.identifier
        # On vérifie l'existence
        prof_res = sb.table("profiles").select("*").eq("id", user_id).execute()
    else:
        # Recherche par email via auth.users
        try:
            auth_users = sb.auth.admin.list_users()
        except Exception as e:
            print(f"ERREUR liste auth users : {e}", file=sys.stderr)
            return 1
        match = next((u for u in auth_users if (getattr(u, "email", None) or "").lower() == args.identifier.lower()), None)
        if not match:
            print(f"Aucun utilisateur Supabase Auth avec email={args.identifier}")
            return 2
        user_id = match.id
        prof_res = sb.table("profiles").select("*").eq("id", user_id).execute()

    if not prof_res.data:
        print(f"Aucun profil trouvé pour user_id={user_id} — peut-être déjà supprimé ?")
        # Tentative quand même de purger auth user
        try:
            sb.auth.admin.delete_user(user_id)
            print(f"Auth user {user_id} supprimé.")
            return 0
        except Exception as e:
            print(f"Impossible de supprimer auth user : {e}", file=sys.stderr)
            return 3

    profile = prof_res.data[0]
    print("Cible :")
    print(f"  - id     : {user_id}")
    print(f"  - nom    : {profile.get('full_name')}")
    print(f"  - role   : {profile.get('role')}")
    print(f"  - status : {profile.get('status')}")

    # Garde-fou anti-last-admin
    if profile.get("role") == "admin" and profile.get("status") == "approved":
        admin_count = (
            sb.table("profiles")
            .select("id", count="exact")
            .eq("role", "admin")
            .eq("status", "approved")
            .execute()
        ).count or 0
        if admin_count <= 1:
            print(
                "REFUS : c'est le dernier administrateur approuvé. "
                "Promouvez quelqu'un d'autre avant de supprimer celui-ci.",
                file=sys.stderr,
            )
            return 4

    if not args.yes:
        ans = input("Confirmer la suppression DÉFINITIVE ? [y/N] ").strip().lower()
        if ans not in ("y", "yes", "o", "oui"):
            print("Annulé.")
            return 0

    # Suppression profil
    try:
        sb.table("profiles").delete().eq("id", user_id).execute()
        print("  ✓ Profil supprimé")
    except Exception as e:
        print(f"  ✗ Erreur suppression profil : {e}", file=sys.stderr)
        return 5

    # Suppression auth user
    try:
        sb.auth.admin.delete_user(user_id)
        print("  ✓ Utilisateur Supabase Auth supprimé")
    except Exception as e:
        print(f"  ✗ Erreur suppression auth user (profil déjà supprimé) : {e}", file=sys.stderr)
        return 6

    print("OK — compte supprimé définitivement.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
