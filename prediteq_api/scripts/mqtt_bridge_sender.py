"""
Boss-PC side sender for PrediTeq live MQTT ingestion.

What it does:
    - reads sensor data from a simple local source
    - normalizes it to the PrediTeq payload contract
    - publishes one MQTT message every second

Source modes included:
    - mock: generate test values
    - json-file: read one JSON object from a local file
    - csv-last-row: read the latest row from a CSV file
    - custom: edit read_from_custom_source() for OPC, Modbus, SQL, etc.

Example:
    cd prediteq_api
    python scripts/mqtt_bridge_sender.py --mode mock --machine-id ARO-01
"""

import argparse
import csv
import json
import os
import random
import ssl
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover - runtime dependency guidance only
    mqtt = None


REQUIRED_FLOAT_FIELDS = ("rms_mms", "power_kw", "temp_c", "humidity_rh")
OPTIONAL_FLOAT_FIELDS = ("current_a", "load_kg", "vibration_raw", "vibration_rms")


def _bool_value(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _default_env_path() -> Path:
    return Path(__file__).with_name(".env.bridge")


def _load_env(env_path: Path) -> None:
    if env_path.exists():
        load_dotenv(env_path)


def _parse_args() -> argparse.Namespace:
    _load_env(_default_env_path())

    parser = argparse.ArgumentParser(
        description="Send live sensor data from a boss PC to PrediTeq through MQTT."
    )
    parser.add_argument(
        "--mode",
        choices=["mock", "json-file", "csv-last-row", "custom"],
        default=os.environ.get("SOURCE_MODE", "mock"),
        help="Where this script reads sensor values from",
    )
    parser.add_argument(
        "--machine-id",
        default=os.environ.get("MACHINE_ID", "ARO-01"),
        help="Real machine code already registered in PrediTeq",
    )
    parser.add_argument(
        "--mqtt-host",
        default=os.environ.get("MQTT_HOST", ""),
        help="Private broker hostname or IP",
    )
    parser.add_argument(
        "--mqtt-port",
        type=int,
        default=int(os.environ.get("MQTT_PORT", "8883")),
        help="Private broker port",
    )
    parser.add_argument(
        "--mqtt-user",
        default=os.environ.get("MQTT_USER", ""),
        help="MQTT username",
    )
    parser.add_argument(
        "--mqtt-password",
        default=os.environ.get("MQTT_PASSWORD", ""),
        help="MQTT password",
    )
    parser.add_argument(
        "--mqtt-use-ssl",
        default=_bool_value(os.environ.get("MQTT_USE_SSL"), True),
        action=argparse.BooleanOptionalAction,
        help="Use TLS/SSL for MQTT",
    )
    parser.add_argument(
        "--topic-template",
        default=os.environ.get("MQTT_TOPIC", "prediteq/{machine_id}/sensors"),
        help="MQTT topic template",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=float(os.environ.get("PUBLISH_INTERVAL_S", "1.0")),
        help="Publish interval in seconds",
    )
    parser.add_argument(
        "--json-path",
        default=os.environ.get("SOURCE_JSON_PATH", ""),
        help="Path to a JSON file used by --mode json-file",
    )
    parser.add_argument(
        "--csv-path",
        default=os.environ.get("SOURCE_CSV_PATH", ""),
        help="Path to a CSV file used by --mode csv-last-row",
    )
    parser.add_argument(
        "--source-label",
        default=os.environ.get("SOURCE_LABEL", "boss_pc_bridge"),
        help="Value stored in payload.source",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Send one message and exit",
    )
    return parser.parse_args()


def _read_json_file(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("JSON source must contain one object")
    return data


def _read_csv_last_row(path: Path) -> dict:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError("CSV source is empty")
    return rows[-1]


def read_from_custom_source() -> dict:
    """
    Replace this function with the boss-PC real data reader.

    Examples:
        - OPC UA read here
        - Modbus poll here
        - SQL query here
        - local API call here

    The returned dict must include the 4 required fields:
        rms_mms, power_kw, temp_c, humidity_rh
    """
    raise NotImplementedError(
        "Edit read_from_custom_source() in scripts/mqtt_bridge_sender.py for the real source."
    )


def _next_mock_payload(state: dict) -> dict:
    state["tick"] += 1
    rms = max(0.7, min(2.4, state["rms_mms"] + random.uniform(-0.03, 0.03)))
    power = max(0.20, min(1.90, state["power_kw"] + random.uniform(-0.06, 0.06)))
    temp = max(20.0, min(36.0, state["temp_c"] + random.uniform(-0.10, 0.10)))
    humidity = max(40.0, min(75.0, state["humidity_rh"] + random.uniform(-0.30, 0.30)))

    state.update(
        {
            "rms_mms": rms,
            "power_kw": power,
            "temp_c": temp,
            "humidity_rh": humidity,
        }
    )

    return {
        "rms_mms": round(rms, 3),
        "power_kw": round(power, 3),
        "temp_c": round(temp, 1),
        "humidity_rh": round(humidity, 1),
        "current_a": round(power * 1.8, 3),
        "load_kg": 180.0 if power > 0.9 else 0.0,
        "status": "running" if power > 0.6 else "idle",
    }


def _read_source(args: argparse.Namespace, mock_state: dict) -> dict:
    if args.mode == "mock":
        return _next_mock_payload(mock_state)
    if args.mode == "json-file":
        if not args.json_path:
            raise ValueError("--json-path is required with --mode json-file")
        return _read_json_file(Path(args.json_path))
    if args.mode == "csv-last-row":
        if not args.csv_path:
            raise ValueError("--csv-path is required with --mode csv-last-row")
        return _read_csv_last_row(Path(args.csv_path))
    if args.mode == "custom":
        return read_from_custom_source()
    raise ValueError(f"Unsupported mode: {args.mode}")


def _normalize_payload(raw_payload: dict, args: argparse.Namespace) -> dict:
    if not isinstance(raw_payload, dict):
        raise ValueError("Source payload must be a dict")

    payload = dict(raw_payload)
    payload["machine_id"] = str(payload.get("machine_id") or args.machine_id).strip().upper()
    payload["source"] = str(payload.get("source") or args.source_label)

    if payload.get("timestamp") and not payload.get("observed_at"):
        payload["observed_at"] = payload["timestamp"]
    if not payload.get("observed_at"):
        payload["observed_at"] = datetime.now(timezone.utc).isoformat()

    for field in REQUIRED_FLOAT_FIELDS:
        if payload.get(field) in (None, ""):
            raise ValueError(f"Missing required field: {field}")
        payload[field] = float(payload[field])

    for field in OPTIONAL_FLOAT_FIELDS:
        if payload.get(field) not in (None, ""):
            payload[field] = float(payload[field])

    if payload.get("status") not in (None, ""):
        payload["status"] = str(payload["status"])

    return payload


def _topic_for(machine_id: str, template: str) -> str:
    return template.replace("{machine_id}", machine_id)


class Publisher:
    def __init__(self, args: argparse.Namespace):
        if mqtt is None:
            raise RuntimeError(
                "paho-mqtt is not installed. Run: pip install -r scripts/requirements_bridge.txt"
            )

        self.args = args
        self.connected = False

        try:
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"prediteq-bridge-{args.machine_id.lower()}",
                protocol=mqtt.MQTTv311,
            )
        except AttributeError:
            self.client = mqtt.Client(
                client_id=f"prediteq-bridge-{args.machine_id.lower()}",
                protocol=mqtt.MQTTv311,
            )

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

        if args.mqtt_user:
            self.client.username_pw_set(args.mqtt_user, args.mqtt_password)
        if args.mqtt_use_ssl:
            self.client.tls_set(cert_reqs=ssl.CERT_REQUIRED)

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        self.connected = True
        print(f"MQTT connected to {self.args.mqtt_host}:{self.args.mqtt_port}")

    def _on_disconnect(self, client, userdata, disconnect_flags=0, reason_code=0, properties=None):
        was_connected = self.connected
        self.connected = False
        if was_connected:
            print("MQTT disconnected")

    def connect(self) -> None:
        self.client.connect(self.args.mqtt_host, self.args.mqtt_port, keepalive=30)
        self.client.loop_start()

        deadline = time.time() + 10.0
        while not self.connected and time.time() < deadline:
            time.sleep(0.1)
        if not self.connected:
            raise RuntimeError("MQTT connection timeout")

    def publish(self, topic: str, payload: dict) -> None:
        message = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
        info = self.client.publish(topic, message, qos=1)
        info.wait_for_publish()
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(f"MQTT publish failed with rc={info.rc}")

    def close(self) -> None:
        try:
            self.client.loop_stop()
        finally:
            try:
                self.client.disconnect()
            except Exception:
                pass


def main() -> int:
    args = _parse_args()

    if not args.mqtt_host:
        print("ERROR: set --mqtt-host or MQTT_HOST in .env.bridge", file=sys.stderr)
        return 2

    publisher = Publisher(args)
    mock_state = {
        "tick": 0,
        "rms_mms": 1.10,
        "power_kw": 0.55,
        "temp_c": 24.5,
        "humidity_rh": 58.0,
    }

    try:
        publisher.connect()
        print(f"Source mode: {args.mode}")
        print(f"Machine id: {args.machine_id}")
        print(f"Topic: {_topic_for(args.machine_id, args.topic_template)}")

        while True:
            raw_payload = _read_source(args, mock_state)
            payload = _normalize_payload(raw_payload, args)
            topic = _topic_for(payload["machine_id"], args.topic_template)
            publisher.publish(topic, payload)

            print(
                f"[{payload['observed_at']}] sent {topic} "
                f"rms={payload['rms_mms']:.3f} power={payload['power_kw']:.3f} "
                f"temp={payload['temp_c']:.1f} hum={payload['humidity_rh']:.1f}"
            )

            if args.once:
                break
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print("Stopped by user")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 3
    finally:
        publisher.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
