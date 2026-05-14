"""
Cross-platform CSV checker for PrediTeq bridge files.

What it does:
    - validates that a CSV file exists and has a readable header
    - maps real column names to the expected PrediTeq fields
    - previews the latest row for quick operator confirmation

Example:
    python check_prediteq_csv.py /absolute/path/to/labview_output.csv
"""

from __future__ import annotations

import argparse
import csv
import sys
import unicodedata
from pathlib import Path


ALIASES: dict[str, tuple[str, ...]] = {
    "machine_id": (
        "machine_id",
        "machine",
        "machineid",
        "machine_code",
        "machinecode",
        "code",
        "asset_id",
    ),
    "observed_at": (
        "observed_at",
        "timestamp",
        "time",
        "datetime",
        "date_time",
        "time_utc",
        "datetime_utc",
    ),
    "rms_mms": (
        "rms_mms",
        "rms",
        "vibration",
        "vibration_rms",
        "vibration_mm_s",
        "rms_mm_s",
    ),
    "power_kw": (
        "power_kw",
        "power",
        "kw",
        "active_power",
        "motor_power",
        "power_k_w",
    ),
    "temp_c": (
        "temp_c",
        "temp",
        "temperature",
        "temperature_c",
        "motor_temp",
        "temp_motor",
    ),
    "humidity_rh": (
        "humidity_rh",
        "humidity",
        "hum",
        "relative_humidity",
        "humidity_percent",
        "humidity_pct",
    ),
}

REQUIRED_FIELDS = (
    "machine_id",
    "observed_at",
    "rms_mms",
    "power_kw",
    "temp_c",
    "humidity_rh",
)

PREFERRED_HEADER = (
    "machine_id,observed_at,rms_mms,power_kw,temp_c,humidity_rh,current_a,load_kg,status"
)


def _canonicalize(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii")
    compact = "".join(ch if ch.isalnum() else "_" for ch in normalized.strip().lower())
    return "_".join(part for part in compact.split("_") if part)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a real or fake CSV file before sending it to PrediTeq."
    )
    parser.add_argument("csv_path", help="Absolute or relative path to the CSV file")
    return parser.parse_args()


def _load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        raise ValueError(f"CSV file not found: {path}")

    raw_text = path.read_text(encoding="utf-8-sig")
    if not raw_text.strip():
        raise ValueError(f"CSV file is empty: {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        rows = list(reader)

    if not headers:
        raise ValueError(f"CSV header is empty: {path}")

    clean_headers = [str(header).strip() for header in headers if str(header).strip()]
    if not clean_headers:
        raise ValueError(f"CSV header is empty: {path}")

    return clean_headers, rows


def _detect_mapping(headers: list[str]) -> tuple[dict[str, str], list[str]]:
    normalized_headers = {_canonicalize(header): header for header in headers}

    mapping: dict[str, str] = {}
    missing: list[str] = []

    for field in REQUIRED_FIELDS:
        found = None
        for alias in ALIASES[field]:
            candidate = normalized_headers.get(_canonicalize(alias))
            if candidate:
                found = candidate
                break
        if found:
            mapping[field] = found
        else:
            missing.append(field)

    return mapping, missing


def main() -> int:
    args = _parse_args()
    path = Path(args.csv_path).expanduser().resolve()

    try:
        headers, rows = _load_rows(path)
        mapping, missing = _detect_mapping(headers)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    if missing:
        print("CSV header check failed.", file=sys.stderr)
        print("Missing required PrediTeq fields:", file=sys.stderr)
        for field in missing:
            print(f" - {field}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Preferred header is:", file=sys.stderr)
        print(PREFERRED_HEADER, file=sys.stderr)
        return 1

    print("CSV header OK.")
    print("Detected mapping:")
    for field in REQUIRED_FIELDS:
        print(f" - {field} <- {mapping[field]}")

    if rows:
        last_row = rows[-1]
        print("")
        print("Last row preview:")
        for field in REQUIRED_FIELDS:
            source_column = mapping[field]
            print(f" - {field} = {last_row.get(source_column, '')}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
