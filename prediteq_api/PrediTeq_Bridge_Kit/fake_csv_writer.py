"""
Cross-platform fake CSV writer for PrediTeq bridge tests.

What it does:
    - creates a CSV file with the expected PrediTeq header
    - appends one realistic fake row every second by default
    - helps test the exact csv-last-row bridge flow on macOS, Linux, or Windows

Example:
    cd prediteq_api/scripts
    python fake_csv_writer.py --output ./labview_mock_output.csv --machine-id ARO-01
"""

from __future__ import annotations

import argparse
import math
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


HEADER = (
    "machine_id,observed_at,rms_mms,power_kw,temp_c,humidity_rh,current_a,load_kg,status"
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Write a fake PrediTeq CSV file continuously."
    )
    parser.add_argument(
        "--output",
        default="./labview_mock_output.csv",
        help="Output CSV path",
    )
    parser.add_argument(
        "--machine-id",
        default="ARO-01",
        help="Machine code to write in the CSV",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Seconds between two rows",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Overwrite the file and rewrite the header before starting",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Write one row and exit",
    )
    return parser.parse_args()


def _ensure_header(path: Path, reset: bool) -> None:
    if reset or not path.exists() or path.stat().st_size == 0:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{HEADER}\n", encoding="ascii")


def _next_row(machine_id: str, tick: int) -> str:
    phase_fast = tick / 3.1
    phase_slow = tick / 8.5

    rms = 1.10 + 0.25 * math.sin(phase_fast) + random.uniform(-0.05, 0.05)
    power = 0.72 + 0.30 * math.sin(phase_fast + 0.7) + random.uniform(-0.06, 0.06)
    temp = 24.4 + 1.30 * math.sin(phase_fast / 1.3 + 1.1) + random.uniform(-0.2, 0.2)
    humidity = 55.0 + 2.4 * math.sin(phase_fast / 1.9 - 0.3) + random.uniform(-0.4, 0.4)

    rms = max(0.80, min(2.20, rms))
    power = max(0.25, min(1.40, power))
    temp = max(21.0, min(34.0, temp))
    humidity = max(45.0, min(68.0, humidity))

    current = max(0.50, power * 1.8 + 0.08 * math.sin(phase_slow))
    load = 180.0 if power > 0.85 else 120.0 if power > 0.55 else 0.0
    status = "running" if power > 0.50 else "idle"

    observed_at = datetime.now(timezone.utc).isoformat()

    return (
        f"{machine_id},{observed_at},{rms:.3f},{power:.3f},{temp:.1f},"
        f"{humidity:.1f},{current:.3f},{load:.1f},{status}"
    )


def main() -> int:
    args = _parse_args()
    output = Path(args.output).expanduser().resolve()
    machine_id = str(args.machine_id).strip().upper()

    _ensure_header(output, reset=args.reset)
    print(f"Writing fake CSV rows to: {output}")
    print(f"Machine id: {machine_id}")

    tick = 0
    try:
        while True:
            tick += 1
            row = _next_row(machine_id, tick)
            with output.open("a", encoding="ascii", newline="") as handle:
                handle.write(f"{row}\n")

            print(f"[{tick}] wrote {row}")

            if args.once:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("Stopped by user")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
