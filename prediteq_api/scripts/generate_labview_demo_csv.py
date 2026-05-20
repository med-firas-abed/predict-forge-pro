"""
Generate a realistic LabVIEW-demo CSV template for the relay-PC integration path.

Why this exists:
    - today we want a believable LabVIEW / PLC style CSV before the real source exists
    - tomorrow the real LabVIEW / PLC can replace only the CSV-writing step
    - the MQTT / HTTP sender path stays the same

This script does not publish anything. It creates a template CSV that follows
the same high-level physics assumptions as the PrediTeq simulation.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
import sys

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from core.labview_demo import (
    FIELDNAMES,
    PROFILE_NAMES,
    SCENARIOS,
    build_labview_demo_samples,
    format_float,
    T_CYCLE_S,
)


def parse_args() -> argparse.Namespace:
    default_out = (
        Path(__file__).resolve().parent
        / "sample_data"
        / "ARO-01_labview_demo_template.csv"
    )

    parser = argparse.ArgumentParser(
        description="Generate a LabVIEW-style demo CSV template consistent with the simulation."
    )
    parser.add_argument("--machine-id", default="ARO-01", help="Machine code to embed in the template")
    parser.add_argument(
        "--scenario",
        choices=sorted(SCENARIOS.keys()),
        default="surveillance",
        help="Which operating window the LabVIEW demo CSV should represent",
    )
    parser.add_argument(
        "--profile",
        choices=PROFILE_NAMES,
        default=None,
        help="Optional degradation profile override",
    )
    parser.add_argument(
        "--duration-s",
        type=int,
        default=4400,
        help="Number of 1 Hz samples to generate",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Deterministic random seed",
    )
    parser.add_argument(
        "--output",
        default=str(default_out),
        help="Where to write the CSV template",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    rows = build_labview_demo_samples(
        machine_id=args.machine_id,
        scenario=args.scenario,
        profile=args.profile,
        duration_s=args.duration_s,
        seed=args.seed,
        source="labview_demo_csv",
    )

    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "machine_code": row["machine_code"],
                    "sim_elapsed_s": row["sim_elapsed_s"],
                    "profile": row["profile"],
                    "scenario": row["scenario"],
                    "phase": row["phase"],
                    "vibration_mm_s": format_float(float(row["vibration_mm_s"]), 3),
                    "motor_power": format_float(float(row["motor_power"]), 3),
                    "temperature": format_float(float(row["temperature"]), 1),
                    "humidity": format_float(float(row["humidity"]), 1),
                    "current": format_float(float(row["current"]), 3),
                    "charge": format_float(float(row["charge"]), 1),
                    "state": row["state"],
                    "source": row["source"],
                }
            )

    num_cycles = (len(rows) + T_CYCLE_S - 1) // T_CYCLE_S
    profile = rows[0]["profile"] if rows else (args.profile or SCENARIOS[args.scenario]["default_profile"])
    machine_id = str(args.machine_id).strip().upper()

    print(f"LabVIEW demo CSV template generated: {output_path}")
    print(f"  machine_id : {machine_id}")
    print(f"  scenario   : {args.scenario}")
    print(f"  profile    : {profile}")
    print(f"  rows       : {len(rows)}")
    print(f"  cycles     : {num_cycles}")
    print("  next step  : replay_labview_demo_csv.py -> mqtt_bridge_sender.py --mode csv-last-row")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
