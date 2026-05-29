"""
Prepare one real machine for a smooth PrediTeq live demo.

This helper does two things:
    1. ensure the machine row exists in Supabase
    2. call the live bootstrap endpoint so HI / RUL / calendar context are ready

Use it after the backend is running, before starting the relay-PC CSV replay.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

from dotenv import load_dotenv
from supabase import create_client


MACHINE_CODE_RE = re.compile(r"^[A-Z]{2,5}-[A-Z0-9]{1,5}$")


def _load_env() -> None:
    api_root = Path(__file__).resolve().parents[1]
    load_dotenv(api_root / ".env")
    load_dotenv(Path(__file__).resolve().with_name(".env.bridge"))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ensure one real machine exists and warm the live runtime for demo use."
    )
    parser.add_argument("--machine-id", default="ARO-01", help="Machine code, for example ARO-01")
    parser.add_argument("--name", default="Machine AroTeq", help="Public machine name")
    parser.add_argument("--region", default="Ben Arous", help="Machine region / city")
    parser.add_argument("--location", default="Usine Aroteq - Ben Arous", help="Machine location label")
    parser.add_argument("--model", default="", help="Optional machine model")
    parser.add_argument("--floors", type=int, default=0, help="Optional floor count")
    parser.add_argument("--lat", type=float, default=None, help="Optional latitude")
    parser.add_argument("--lon", type=float, default=None, help="Optional longitude")
    parser.add_argument(
        "--status",
        choices=["operational", "degraded", "critical", "maintenance"],
        default="operational",
        help="Machine status stored in Supabase before the live flow starts",
    )
    parser.add_argument(
        "--scenario",
        choices=["healthy", "surveillance", "critical"],
        default="surveillance",
        help="Real-machine warmup window to preload before live replay starts",
    )
    parser.add_argument("--profile", default=None, help="Optional degradation profile override")
    parser.add_argument(
        "--duration-s",
        type=int,
        default=3600,
        help="How much recent history to seed before the live stream starts",
    )
    parser.add_argument("--seed", type=int, default=42, help="Deterministic random seed")
    parser.add_argument(
        "--bootstrap-url",
        default="",
        help="Explicit bootstrap endpoint URL. Default derives from env or localhost backend.",
    )
    parser.add_argument(
        "--backend-base-url",
        default=os.environ.get("BACKEND_BASE_URL", "http://127.0.0.1:8000"),
        help="Backend base URL used when --bootstrap-url is not provided",
    )
    parser.add_argument(
        "--ingest-token",
        default=os.environ.get("HTTP_INGEST_TOKEN", "") or os.environ.get("LIVE_INGEST_TOKEN", ""),
        help="Shared ingest token. Defaults to HTTP_INGEST_TOKEN or LIVE_INGEST_TOKEN from env.",
    )
    parser.add_argument(
        "--source",
        default="labview_demo_bootstrap",
        help="Source label stored on the warmup samples",
    )
    parser.add_argument(
        "--cycles-per-day",
        type=float,
        default=None,
        help="Optional commissioning/demo override for displayed cycles/day",
    )
    parser.add_argument(
        "--power-avg-30j-kw",
        type=float,
        default=None,
        help="Optional commissioning/demo override for displayed 30-day ascent power",
    )
    return parser.parse_args()


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required in prediteq_api/.env")
    return value


def _resolve_bootstrap_url(args: argparse.Namespace) -> str:
    if args.bootstrap_url:
        return args.bootstrap_url

    http_ingest_url = os.environ.get("HTTP_INGEST_URL", "").strip()
    if http_ingest_url:
        return http_ingest_url.rstrip("/").replace("/ingest/live", "/ingest/bootstrap/labview-demo")

    return args.backend_base_url.rstrip("/") + "/ingest/bootstrap/labview-demo"


def _ensure_machine_row(args: argparse.Namespace) -> dict:
    url = _require_env("SUPABASE_URL")
    key = _require_env("SUPABASE_SERVICE_KEY")
    code = args.machine_id.strip().upper()

    if not MACHINE_CODE_RE.match(code):
        raise RuntimeError("Invalid machine code. Use a code like ARO-01.")

    sb = create_client(url, key)

    payload = {
        "nom": args.name.strip() or code,
        "region": args.region.strip(),
        "modele": args.model.strip(),
        "etages": int(args.floors),
        "emplacement": args.location.strip(),
        "statut": args.status,
        "derniere_maj": datetime.now(timezone.utc).isoformat(),
    }
    if args.lat is not None:
        payload["latitude"] = float(args.lat)
    if args.lon is not None:
        payload["longitude"] = float(args.lon)

    existing = sb.table("machines").select("*").eq("code", code).limit(1).execute()
    if existing.data:
        sb.table("machines").update(payload).eq("code", code).execute()
        refreshed = sb.table("machines").select("*").eq("code", code).limit(1).execute()
        row = (refreshed.data or [{}])[0]
        print(f"Updated machine {code}.")
        return row

    inserted = sb.table("machines").insert(
        {
            "code": code,
            "hi_courant": 1.0,
            "rul_courant": None,
            **payload,
        }
    ).execute()
    row = (inserted.data or [{}])[0]
    print(f"Created machine {code}.")
    return row


def _call_bootstrap(args: argparse.Namespace) -> dict:
    code = args.machine_id.strip().upper()
    token = str(args.ingest_token or "").strip()
    body = {
        "machine_id": code,
        "scenario": args.scenario,
        "profile": args.profile,
        "duration_s": int(args.duration_s),
        "seed": int(args.seed),
        "source": str(args.source),
        "persist_machine_metrics": True,
        "cycles_per_day_override": (
            float(args.cycles_per_day) if args.cycles_per_day is not None else None
        ),
        "power_avg_30j_override": (
            float(args.power_avg_30j_kw) if args.power_avg_30j_kw is not None else None
        ),
    }
    body = {key: value for key, value in body.items() if value is not None}

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib_request.Request(
        _resolve_bootstrap_url(args),
        data=json.dumps(body, separators=(",", ":"), ensure_ascii=True).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=20.0) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Bootstrap failed with status={exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"Bootstrap connection error: {exc.reason}") from exc


def main() -> int:
    _load_env()
    args = _parse_args()
    code = args.machine_id.strip().upper()

    try:
        machine = _ensure_machine_row(args)
        bootstrap = _call_bootstrap(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print("")
    print("Real machine setup complete.")
    print(f"  machine_id      : {code}")
    print(f"  machine_uuid    : {machine.get('id')}")
    print(f"  machine_name    : {machine.get('nom')}")
    print(f"  scenario        : {bootstrap.get('scenario')}")
    print(f"  rows_seeded     : {bootstrap.get('rows_seeded')}")
    print(f"  hi              : {bootstrap.get('hi')}")
    print(f"  zone            : {bootstrap.get('zone')}")
    print(f"  calibrated_mode : {bootstrap.get('calibrated_mode')}")
    print(f"  rul_days        : {bootstrap.get('rul_days')}")
    print(f"  cycles_per_day  : {bootstrap.get('cycles_per_day')}")
    print(f"  power_avg_30j   : {bootstrap.get('power_avg_30j')}")
    print("")
    print("Next steps:")
    print("  1. Start replay_labview_demo_csv.py to write the live CSV.")
    print("  2. Start mqtt_bridge_sender.py --mode csv-last-row with the same machine id.")
    print("  3. Open the app and inspect Dashboard, Diagnostics, Planner, Calendar, Rapport IA, and chatbot.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
