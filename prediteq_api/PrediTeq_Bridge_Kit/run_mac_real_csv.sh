#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash $(basename "$0") /absolute/path/to/labview_output.csv [MACHINE_ID]" >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

CSV_PATH="$1"
MACHINE_ID="${2:-ARO-01}"
BROKER_HOST="${MQTT_HOST:-broker.emqx.io}"
BROKER_PORT="${MQTT_PORT:-8883}"
BROKER_USER="${MQTT_USER:-}"
BROKER_PASSWORD="${MQTT_PASSWORD:-}"
USE_SSL="${MQTT_USE_SSL:-true}"
SOURCE_LABEL="${SOURCE_LABEL:-macbook_real_csv}"

echo "Using Python: $PYTHON_BIN"
"$PYTHON_BIN" -m pip install -r "$SCRIPT_DIR/requirements_bridge.txt"

echo "Checking CSV format..."
"$PYTHON_BIN" "$SCRIPT_DIR/check_prediteq_csv.py" "$CSV_PATH"

cat > "$SCRIPT_DIR/.env.bridge" <<EOF
MACHINE_ID=$MACHINE_ID
PUBLISH_TRANSPORT=mqtt
MQTT_HOST=$BROKER_HOST
MQTT_PORT=$BROKER_PORT
MQTT_USER=$BROKER_USER
MQTT_PASSWORD=$BROKER_PASSWORD
MQTT_USE_SSL=$USE_SSL
MQTT_TOPIC=prediteq/{machine_id}/sensors
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=csv-last-row
SOURCE_CSV_PATH=$CSV_PATH
SOURCE_LABEL=$SOURCE_LABEL
EOF

echo "Starting MQTT sender..."
echo "Machine: $MACHINE_ID"
echo "CSV: $CSV_PATH"
echo "Broker: $BROKER_HOST:$BROKER_PORT"

"$PYTHON_BIN" "$SCRIPT_DIR/mqtt_bridge_sender.py" --mode csv-last-row --machine-id "$MACHINE_ID" --csv-path "$CSV_PATH"
