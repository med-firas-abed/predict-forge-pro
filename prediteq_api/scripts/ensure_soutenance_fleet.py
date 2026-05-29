"""
Ensure the canonical soutenance fleet exists in Supabase.

The fleet is intentionally small and stable for the jury demo:
  - 3 simulator-backed story machines
  - 1 live AroTeq machine fed by the LabVIEW/bridge replay
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from demo_scenarios import DEMO_MACHINE_SCENARIOS


DEMO_MACHINE_METADATA = {
    "ASC-A1": {
        "name": "Machine 1",
        "region": "Bizerte",
        "latitude": 37.2744,
        "longitude": 9.8739,
        "location": "Site Nord - Bizerte",
    },
    "ASC-B2": {
        "name": "Machine 2",
        "region": "Sfax",
        "latitude": 34.7398,
        "longitude": 10.7600,
        "location": "Site Est - Sfax",
    },
    "ASC-C3": {
        "name": "Machine 3",
        "region": "Sousse",
        "latitude": 35.8256,
        "longitude": 10.6369,
        "location": "Site Sud - Sousse",
    },
}

REAL_MACHINE_METADATA = {
    "code": "ARO-01",
    "name": "Machine AroTeq",
    "region": "Ben Arous",
    "latitude": 36.7537,
    "longitude": 10.2189,
    "location": "Usine Aroteq - Ben Arous",
    "status": "operational",
    "hi": 1.0,
    "rul": None,
}

MACHINE_MODEL = "SITI FC100L1-4"
MACHINE_FLOORS = 19
KNOWN_LEGACY_CODES = ("LAB-01", "sasa")


def _load_env() -> None:
    load_dotenv(API_ROOT / ".env")
    load_dotenv(Path(__file__).resolve().with_name(".env.bridge"))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upsert the canonical 4-machine soutenance fleet in Supabase."
    )
    parser.add_argument(
        "--skip-legacy-cleanup",
        action="store_true",
        help="Keep known leftover test rows instead of deleting them.",
    )
    return parser.parse_args()


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required in prediteq_api/.env")
    return value


def _status_from_health_state(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "critical":
        return "critical"
    if normalized in {"surveillance", "degraded", "good"}:
        return "degraded"
    return "operational"


def _build_demo_payloads(now_iso: str) -> dict[str, dict]:
    payloads: dict[str, dict] = {}
    for code, scenario in DEMO_MACHINE_SCENARIOS.items():
        metadata = DEMO_MACHINE_METADATA.get(code)
        if metadata is None:
            continue

        reference_rul = scenario.get("reference_rul_days")
        payloads[code] = {
            "nom": metadata["name"],
            "region": metadata["region"],
            "latitude": metadata["latitude"],
            "longitude": metadata["longitude"],
            "emplacement": metadata["location"],
            "statut": _status_from_health_state(scenario.get("health_state", "")),
            "hi_courant": round(float(scenario["target_hi"]), 4),
            "rul_courant": int(reference_rul) if reference_rul else None,
            "modele": MACHINE_MODEL,
            "etages": MACHINE_FLOORS,
            "derniere_maj": now_iso,
        }
    return payloads


def _build_real_payload(now_iso: str) -> tuple[str, dict]:
    return (
        str(REAL_MACHINE_METADATA["code"]),
        {
            "nom": REAL_MACHINE_METADATA["name"],
            "region": REAL_MACHINE_METADATA["region"],
            "latitude": REAL_MACHINE_METADATA["latitude"],
            "longitude": REAL_MACHINE_METADATA["longitude"],
            "emplacement": REAL_MACHINE_METADATA["location"],
            "statut": REAL_MACHINE_METADATA["status"],
            "hi_courant": REAL_MACHINE_METADATA["hi"],
            "rul_courant": REAL_MACHINE_METADATA["rul"],
            "modele": MACHINE_MODEL,
            "etages": MACHINE_FLOORS,
            "derniere_maj": now_iso,
        },
    )


def _upsert_machine(sb, code: str, payload: dict) -> tuple[str, dict]:
    existing = sb.table("machines").select("*").eq("code", code).limit(1).execute()
    if existing.data:
        sb.table("machines").update(payload).eq("code", code).execute()
        refreshed = sb.table("machines").select("*").eq("code", code).limit(1).execute()
        return "updated", (refreshed.data or [{}])[0]

    inserted = sb.table("machines").insert({"code": code, **payload}).execute()
    return "created", (inserted.data or [{}])[0]


def _cleanup_known_legacy(sb) -> list[str]:
    removed: list[str] = []
    for code in KNOWN_LEGACY_CODES:
        try:
            sb.table("machines").delete().eq("code", code).execute()
        except Exception:
            continue
        removed.append(code)
    return removed


def main() -> int:
    _load_env()
    args = _parse_args()

    try:
        sb = create_client(_require_env("SUPABASE_URL"), _require_env("SUPABASE_SERVICE_KEY"))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    now_iso = datetime.now(timezone.utc).isoformat()
    payloads = _build_demo_payloads(now_iso)
    real_code, real_payload = _build_real_payload(now_iso)
    payloads[real_code] = real_payload

    try:
        cleaned_codes = [] if args.skip_legacy_cleanup else _cleanup_known_legacy(sb)
        results = [_upsert_machine(sb, code, payloads[code]) for code in sorted(payloads)]
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 3

    print("Soutenance fleet ready.")
    for action, row in results:
        location = row.get("emplacement") or row.get("region") or ""
        print(f"  {action:7s} {row.get('code')}: {row.get('nom')} @ {location}")
    if cleaned_codes:
        print(f"  cleaned {', '.join(cleaned_codes)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
