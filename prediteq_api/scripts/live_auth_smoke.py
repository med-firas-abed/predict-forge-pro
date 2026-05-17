"""
Disposable live auth smoke for PrediTeq.

What it verifies:
    - public backend endpoints respond
    - backend login works with a real approved admin account
    - protected admin GET routes respond with a real bearer token
    - public signup creates a pending operator
    - pending accounts cannot log in
    - admin approval unlocks operator login
    - protected user GET routes respond and stay scoped to the assigned machine
    - admin deletion removes the disposable operator again

The script creates temporary accounts through the Supabase service role from
prediteq_api/.env, exercises the live backend, then cleans up the temp users.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import string
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


DEFAULT_BACKEND_URL = "http://127.0.0.1:8000"


def normalize_url(value: str) -> str:
    return value.rstrip("/")


def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def parse_json_response(url: str, status: int, body: str):
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"{url} returned {status} but not valid JSON: {exc}; body={body[:240]!r}"
        ) from exc


def request_json(
    base_url: str,
    method: str,
    path: str,
    *,
    payload: dict | None = None,
    token: str | None = None,
    expected_status: tuple[int, ...] = (200,),
):
    url = f"{base_url}{path}"
    headers = {
        "Accept": "application/json",
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        status = exc.code
        if status not in expected_status:
            raise RuntimeError(
                f"{method} {url} returned {status}: {body[:240]}"
            ) from exc
        return parse_json_response(url, status, body)
    except Exception as exc:
        raise RuntimeError(f"{method} {url} failed: {exc}") from exc

    if status not in expected_status:
        raise RuntimeError(f"{method} {url} returned {status}: {body[:240]}")

    return parse_json_response(url, status, body)


def generated_password() -> str:
    alphabet = string.ascii_letters + string.digits
    middle = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"Codex{middle}1aA"


def list_auth_users(supabase_client) -> list[object]:
    raw = supabase_client.auth.admin.list_users()
    if isinstance(raw, list):
        return raw

    users = getattr(raw, "users", None)
    if isinstance(users, list):
        return users

    return list(raw or [])


def create_temp_user(
    supabase_client,
    *,
    email: str,
    password: str,
    full_name: str,
    role: str,
    status: str,
    machine_id: str | None,
) -> str:
    approved_at = (
        datetime.now(timezone.utc).isoformat() if status == "approved" else None
    )
    metadata: dict[str, str | None] = {
        "full_name": full_name,
        "role": role,
        "machine_id": machine_id,
        "status": status,
    }
    if approved_at:
        metadata["approved_at"] = approved_at

    created = supabase_client.auth.admin.create_user(
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": metadata,
        }
    )
    user = getattr(created, "user", None)
    user_id = getattr(user, "id", None)
    assert_condition(bool(user_id), "Supabase did not return an auth user id")

    profile_payload: dict[str, str | None] = {
        "id": user_id,
        "full_name": full_name,
        "role": role,
        "status": status,
        "machine_id": machine_id,
    }
    if approved_at:
        profile_payload["approved_at"] = approved_at

    supabase_client.table("profiles").upsert(profile_payload).execute()
    return str(user_id)


def delete_temp_user(supabase_client, user_id: str | None) -> None:
    if not user_id:
        return

    try:
        supabase_client.table("profiles").delete().eq("id", user_id).execute()
    except Exception:
        pass

    try:
        supabase_client.auth.admin.delete_user(user_id)
    except Exception:
        pass


def find_auth_user_id_by_email(supabase_client, email: str) -> str | None:
    for user in list_auth_users(supabase_client):
        current_email = getattr(user, "email", None)
        if isinstance(current_email, str) and current_email.lower() == email.lower():
            return getattr(user, "id", None)
    return None


def load_local_env() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    load_dotenv(repo_root / ".env")


def main() -> int:
    load_local_env()

    parser = argparse.ArgumentParser(
        description="Run a disposable live auth smoke against the PrediTeq backend."
    )
    parser.add_argument(
        "--backend-url",
        default=(
            os.environ.get("BACKEND_URL")
            or os.environ.get("PREDITEQ_BACKEND_URL")
            or DEFAULT_BACKEND_URL
        ),
        help="Backend base URL, default: %(default)s",
    )
    parser.add_argument(
        "--keep-users",
        action="store_true",
        help="Keep the disposable smoke users for debugging instead of deleting them.",
    )
    args = parser.parse_args()

    backend_url = normalize_url(args.backend_url)
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    assert_condition(bool(supabase_url and supabase_key), "SUPABASE_URL and SUPABASE_SERVICE_KEY are required")

    print(f"Checking public backend endpoints on {backend_url}")
    health = request_json(backend_url, "GET", "/health")
    assert_condition(health.get("status") == "ok", f"Unexpected /health payload: {health}")

    metrics = request_json(backend_url, "GET", "/health/public-metrics")
    assert_condition(
        isinstance(metrics.get("verified_pipeline", {}).get("holdout_r2"), (int, float)),
        "Public metrics payload is missing verified_pipeline.holdout_r2",
    )

    public_machines = request_json(backend_url, "GET", "/auth/machines")
    assert_condition(bool(public_machines), "Public machine list is empty")
    chosen_machine = next(
        (row for row in public_machines if row.get("code", "").startswith("ASC-")),
        public_machines[0],
    )
    machine_id = chosen_machine.get("id")
    machine_code = chosen_machine.get("code")
    assert_condition(bool(machine_id and machine_code), f"Invalid machine payload: {chosen_machine}")

    supabase_client = create_client(supabase_url, supabase_key)

    suffix = f"{int(time.time())}-{secrets.token_hex(3)}"
    admin_email = f"codex.smoke.admin.{suffix}@example.com"
    user_email = f"codex.smoke.user.{suffix}@example.com"
    admin_password = generated_password()
    user_password = generated_password()
    admin_id: str | None = None
    user_id: str | None = None
    user_deleted = False

    try:
        print("Creating temporary approved admin via service role")
        admin_id = create_temp_user(
            supabase_client,
            email=admin_email,
            password=admin_password,
            full_name="Codex Smoke Admin",
            role="admin",
            status="approved",
            machine_id=None,
        )

        print("Logging in as temporary admin")
        admin_login = request_json(
            backend_url,
            "POST",
            "/auth/login",
            payload={"email": admin_email, "password": admin_password},
        )
        assert_condition(admin_login.get("status") == "approved", f"Unexpected admin login payload: {admin_login}")
        admin_token = admin_login.get("access_token")
        assert_condition(isinstance(admin_token, str) and admin_token, "Admin login did not return an access token")

        print("Verifying admin-protected routes")
        admin_status = request_json(backend_url, "GET", "/me/status", token=admin_token)
        assert_condition(admin_status.get("role") == "admin", f"Unexpected admin status payload: {admin_status}")

        admin_users = request_json(backend_url, "GET", "/admin/users", token=admin_token)
        assert_condition(
            any(row.get("id") == admin_id for row in admin_users),
            "Temporary admin was not visible in /admin/users",
        )

        planner_status = request_json(backend_url, "GET", "/planner/status", token=admin_token)
        assert_condition(isinstance(planner_status, list), "/planner/status did not return a list")

        simulator_status = request_json(backend_url, "GET", "/simulator/status", token=admin_token)
        assert_condition(isinstance(simulator_status, dict), "/simulator/status did not return an object")

        admin_machines = request_json(backend_url, "GET", "/machines", token=admin_token)
        assert_condition(
            isinstance(admin_machines, list) and len(admin_machines) >= 1,
            "Admin could not list machines",
        )

        print("Creating temporary pending operator through /auth/signup")
        signup_payload = {
            "full_name": "Codex Smoke Operator",
            "email": user_email,
            "password": user_password,
            "role": "user",
            "machine_id": machine_id,
        }
        signup = request_json(
            backend_url,
            "POST",
            "/auth/signup",
            payload=signup_payload,
        )
        assert_condition(signup.get("status") == "pending", f"Unexpected signup payload: {signup}")

        user_id = find_auth_user_id_by_email(supabase_client, user_email)
        assert_condition(bool(user_id), "Could not resolve the temporary operator in Supabase Auth")

        pending_login = request_json(
            backend_url,
            "POST",
            "/auth/login",
            payload={"email": user_email, "password": user_password},
            expected_status=(403,),
        )
        detail = str(pending_login.get("detail", ""))
        assert_condition(
            "attente" in detail.lower(),
            f"Pending user login returned an unexpected payload: {pending_login}",
        )

        pending_rows = request_json(backend_url, "GET", "/admin/users/pending", token=admin_token)
        assert_condition(
            any(row.get("id") == user_id for row in pending_rows),
            "Temporary operator was not visible in /admin/users/pending",
        )

        print("Approving temporary operator through admin API")
        approval = request_json(
            backend_url,
            "PATCH",
            f"/admin/users/{user_id}/approve",
            token=admin_token,
        )
        assert_condition(
            approval.get("status") in {"approved", "already_approved"},
            f"Unexpected approval payload: {approval}",
        )

        print("Logging in as approved operator")
        user_login = request_json(
            backend_url,
            "POST",
            "/auth/login",
            payload={"email": user_email, "password": user_password},
        )
        assert_condition(user_login.get("status") == "approved", f"Unexpected operator login payload: {user_login}")
        user_token = user_login.get("access_token")
        assert_condition(isinstance(user_token, str) and user_token, "Operator login did not return an access token")

        user_status = request_json(backend_url, "GET", "/me/status", token=user_token)
        assert_condition(user_status.get("role") == "user", f"Unexpected operator status payload: {user_status}")
        assert_condition(
            user_status.get("machine_id") == machine_id,
            f"Operator was assigned to the wrong machine: {user_status}",
        )

        print("Verifying operator-scoped protected routes")
        scoped_machines = request_json(backend_url, "GET", "/machines", token=user_token)
        assert_condition(
            isinstance(scoped_machines, list) and len(scoped_machines) == 1,
            f"Operator machine list was not scoped to one machine: {scoped_machines}",
        )
        assert_condition(
            scoped_machines[0].get("id") == machine_id,
            f"Operator saw the wrong machine payload: {scoped_machines[0]}",
        )

        scoped_machine_code = user_status.get("machine_code") or scoped_machines[0].get("code")
        assert_condition(bool(scoped_machine_code), "Could not resolve the operator machine code")

        diagnostics = request_json(
            backend_url,
            "GET",
            f"/diagnostics/{urllib.parse.quote(str(scoped_machine_code))}/all",
            token=user_token,
        )
        assert_condition(
            diagnostics.get("machine_code") == scoped_machine_code,
            f"Diagnostics payload did not match the scoped machine: {diagnostics}",
        )

        costs = request_json(
            backend_url,
            "GET",
            f"/runtime-data/costs?machine_id={urllib.parse.quote(str(machine_id))}",
            token=user_token,
        )
        assert_condition(isinstance(costs, list), "/runtime-data/costs did not return a list")

        tasks = request_json(
            backend_url,
            "GET",
            f"/runtime-data/tasks?machine_id={urllib.parse.quote(str(machine_id))}",
            token=user_token,
        )
        assert_condition(isinstance(tasks, list), "/runtime-data/tasks did not return a list")

        print("Deleting temporary operator through admin API")
        deleted = request_json(
            backend_url,
            "DELETE",
            f"/admin/users/{user_id}",
            token=admin_token,
        )
        assert_condition(deleted.get("status") == "deleted", f"Unexpected delete payload: {deleted}")
        user_deleted = True

        print("Live auth smoke passed.")
        return 0
    finally:
        if not args.keep_users:
            if not user_deleted:
                delete_temp_user(supabase_client, user_id)
            delete_temp_user(supabase_client, admin_id)
        else:
            print("Keeping temporary smoke users for debugging.")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Live auth smoke failed: {exc}", file=sys.stderr)
        raise
