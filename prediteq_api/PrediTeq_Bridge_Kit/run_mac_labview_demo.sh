#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Script de compatibilite historique. Preferer run_relay_labview_demo.sh.
exec bash "$SCRIPT_DIR/run_relay_labview_demo.sh" "$@"
