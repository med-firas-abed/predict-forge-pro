"""
One-shot utility to create or update a real machine row for live MQTT ingestion.

Usage:
    cd prediteq_api
    python scripts/register_machine.py ARO-01 --name "Machine AroTeq" --region "Ben Arous"

Why this exists:
    The MQTT listener ignores unknown machine codes. This script makes sure the
    real machine code exists in Supabase before live data starts arriving.
"""

import argparse
import os
import re
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client


MACHINE_CODE_RE = re.compile(r"^[A-Z]{2,5}-[A-Z0-9]{1,5}$")


def _load_env() -> tuple[str, str]:
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(os.path.dirname(here), ".env")
    load_dotenv(env_path)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required in prediteq_api/.env")
    return url, key


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or update one real machine row in Supabase."
    )
    parser.add_argument("code", help="Machine code, for example ARO-01")
    parser.add_argument("--name", default="", help="Display name shown in PrediTeq")
    parser.add_argument("--region", default="", help="Site or city")
    parser.add_argument("--model", default="", help="Machine model")
    parser.add_argument("--floors", type=int, default=0, help="Optional floors count")
    parser.add_argument("--location", default="", help="Optional location label")
    parser.add_argument("--lat", type=float, default=0.0, help="Latitude")
    parser.add_argument("--lon", type=float, default=0.0, help="Longitude")
    parser.add_argument(
        "--status",
        choices=["operational", "degraded", "critical", "maintenance"],
        default="operational",
        help="Initial machine status",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    code = args.code.strip().upper()
    if not MACHINE_CODE_RE.match(code):
        print(
            "ERROR: invalid machine code. Use a code like ARO-01, LINE-02, or SITE-7.",
            file=sys.stderr,
        )
        return 2

    try:
        url, key = _load_env()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 3

    sb = create_client(url, key)

    base_payload = {
        "nom": args.name.strip() or code,
        "region": args.region.strip(),
        "latitude": float(args.lat),
        "longitude": float(args.lon),
        "modele": args.model.strip(),
        "etages": int(args.floors),
        "emplacement": args.location.strip(),
        "statut": args.status,
        "derniere_maj": datetime.now(timezone.utc).isoformat(),
    }

    try:
        existing = (
            sb.table("machines")
            .select("*")
            .eq("code", code)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        print(f"ERROR: could not query machines table: {exc}", file=sys.stderr)
        return 4

    try:
        if existing.data:
            sb.table("machines").update(base_payload).eq("code", code).execute()
            refreshed = (
                sb.table("machines")
                .select("*")
                .eq("code", code)
                .limit(1)
                .execute()
            )
            row = (refreshed.data or [{}])[0]
            print(f"Updated machine {code}.")
        else:
            insert_payload = {
                "code": code,
                "hi_courant": 1.0,
                "rul_courant": None,
                **base_payload,
            }
            inserted = sb.table("machines").insert(insert_payload).execute()
            row = (inserted.data or [{}])[0]
            print(f"Created machine {code}.")
    except Exception as exc:
        print(f"ERROR: could not write machine row: {exc}", file=sys.stderr)
        return 5

    print(f"  id: {row.get('id')}")
    print(f"  code: {row.get('code')}")
    print(f"  name: {row.get('nom')}")
    print(f"  region: {row.get('region')}")
    print(f"  status: {row.get('statut')}")
    print("")
    print("Next step:")
    print("  Start the backend, then warm the live runtime for this same machine code.")
    print("  Example: python scripts/setup_real_machine_demo.py --machine-id ARO-01 --scenario surveillance")
    print("  After that, start the relay-PC sender or the LabVIEW demo CSV replay.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
