#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/BRIDGE_CONFIG.txt"
ENV_FILE="$SCRIPT_DIR/.env.bridge"

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
elif [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"

MACHINE_ID="${1:-${MACHINE_ID:-ARO-01}}"
CSV_PATH="${2:-${SOURCE_CSV_PATH:-$SCRIPT_DIR/labview_mock_output.csv}}"
BROKER_HOST="${MQTT_HOST:-broker.emqx.io}"
BROKER_PORT="${MQTT_PORT:-8883}"
BROKER_USER="${MQTT_USER:-}"
BROKER_PASSWORD="${MQTT_PASSWORD:-}"
USE_SSL="${MQTT_USE_SSL:-true}"
SOURCE_LABEL="${SOURCE_LABEL:-site_bridge_pc_labview_demo}"
PUBLISH_INTERVAL="${PUBLISH_INTERVAL_S:-1.0}"

cleanup() {
  if [[ -n "${WRITER_PID:-}" ]]; then
    kill "$WRITER_PID" >/dev/null 2>&1 || true
    wait "$WRITER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Using Python: $PYTHON_BIN"
"$PYTHON_BIN" -m pip install -r "$SCRIPT_DIR/requirements_bridge.txt"

cat > "$SCRIPT_DIR/.env.bridge" <<EOF
MACHINE_ID=$MACHINE_ID
PUBLISH_TRANSPORT=mqtt
MQTT_HOST=$BROKER_HOST
MQTT_PORT=$BROKER_PORT
MQTT_USER=$BROKER_USER
MQTT_PASSWORD=$BROKER_PASSWORD
MQTT_USE_SSL=$USE_SSL
MQTT_TOPIC=prediteq/{machine_id}/sensors
PUBLISH_INTERVAL_S=$PUBLISH_INTERVAL
SOURCE_MODE=csv-last-row
SOURCE_CSV_PATH=$CSV_PATH
SOURCE_LABEL=$SOURCE_LABEL
EOF

echo "Starting LabVIEW demo CSV writer..."
"$PYTHON_BIN" "$SCRIPT_DIR/labview_demo_writer.py" --output "$CSV_PATH" --machine-id "$MACHINE_ID" --reset &
WRITER_PID=$!

sleep 1

echo "Starting MQTT sender..."
echo "Machine: $MACHINE_ID"
echo "CSV: $CSV_PATH"
echo "Broker: $BROKER_HOST:$BROKER_PORT"

"$PYTHON_BIN" "$SCRIPT_DIR/mqtt_bridge_sender.py"
