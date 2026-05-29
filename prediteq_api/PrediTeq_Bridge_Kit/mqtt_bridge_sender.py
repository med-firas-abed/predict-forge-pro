"""
Relay-PC side sender for PrediTeq live ingestion.

What it does:
    - reads sensor data from a simple local source
    - normalizes it to the PrediTeq payload contract
    - publishes one message every second through MQTT or HTTP

Source modes included:
    - mock: generate test values
    - json-file: read one JSON object from a local file
    - csv-last-row: read the latest row from a CSV file
    - custom: edit read_from_custom_source() for OPC, Modbus, SQL, etc.

Example:
    cd prediteq_api
    python scripts/setup_real_machine_demo.py --machine-id ARO-01 --name "Machine AroTeq" --location "Usine Aroteq - Ben Arous" --scenario surveillance
    python scripts/mqtt_bridge_sender.py --mode mock --machine-id ARO-01
"""

import argparse
import csv
import json
import math
import os
import random
import re
import sys
import time
import ssl
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

from dotenv import load_dotenv

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover - runtime dependency guidance only
    mqtt = None


REQUIRED_FLOAT_FIELDS = ("rms_mms", "power_kw", "temp_c", "humidity_rh")
OPTIONAL_FLOAT_FIELDS = ("current_a", "load_kg", "vibration_raw", "vibration_rms")
FIELD_ALIASES = {
    "machine_id": (
        "machine",
        "machineid",
        "machine_code",
        "machinecode",
        "code",
        "asset_id",
    ),
    "observed_at": (
        "timestamp",
        "time",
        "datetime",
        "date_time",
        "time_utc",
        "datetime_utc",
    ),
    "rms_mms": (
        "rms",
        "vibration",
        "vibration_rms",
        "vibration_mm_s",
        "rms_mm_s",
    ),
    "power_kw": (
        "power",
        "kw",
        "active_power",
        "motor_power",
        "power_k_w",
    ),
    "temp_c": (
        "temp",
        "temperature",
        "temperature_c",
        "motor_temp",
        "temp_motor",
    ),
    "humidity_rh": (
        "humidity",
        "hum",
        "relative_humidity",
        "humidity_percent",
        "humidity_pct",
    ),
    "current_a": (
        "current",
        "amps",
        "ampere",
        "current_amp",
    ),
    "load_kg": (
        "load",
        "charge",
        "weight_kg",
        "charge_kg",
    ),
    "status": (
        "state",
        "machine_status",
        "mode",
    ),
}


def _bool_value(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _canonicalize_key(raw: str) -> str:
    text = unicodedata.normalize("NFKD", str(raw)).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", "_", text.strip().lower())
    return text.strip("_")


_CANONICAL_ALIAS_MAP = {
    _canonicalize_key(alias): field
    for field, aliases in FIELD_ALIASES.items()
    for alias in (field, *aliases)
}


def _default_env_path() -> Path:
    return Path(__file__).with_name(".env.bridge")


def _load_env(env_path: Path) -> None:
    if env_path.exists():
        load_dotenv(env_path)


def _parse_args() -> argparse.Namespace:
    _load_env(_default_env_path())

    parser = argparse.ArgumentParser(
        description="Send live sensor data from a client-side relay PC to PrediTeq through MQTT or HTTP."
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
        "--transport",
        choices=["mqtt", "http"],
        default=os.environ.get("PUBLISH_TRANSPORT", "mqtt"),
        help="How this script sends the normalized payload to PrediTeq",
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
        "--http-url",
        default=os.environ.get("HTTP_INGEST_URL", ""),
        help="PrediTeq HTTP ingest endpoint, for example https://host/ingest/live",
    )
    parser.add_argument(
        "--http-token",
        default=os.environ.get("HTTP_INGEST_TOKEN", ""),
        help="Shared token expected by LIVE_INGEST_TOKEN on the backend",
    )
    parser.add_argument(
        "--http-timeout",
        type=float,
        default=float(os.environ.get("HTTP_INGEST_TIMEOUT_S", "10.0")),
        help="Timeout in seconds for one HTTP POST request",
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
        default=os.environ.get("SOURCE_LABEL", "site_bridge_pc"),
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
    return {
        str(key).strip(): value.strip() if isinstance(value, str) else value
        for key, value in rows[-1].items()
        if key not in (None, "")
    }


def read_from_custom_source() -> dict:
    """
    Replace this function with the site relay-PC real data reader.

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
    phase_fast = state["tick"] / 2.8
    phase_slow = state["tick"] / 7.0

    rms_target = 1.15 + 0.30 * math.sin(phase_fast) + 0.08 * math.sin(phase_slow + 0.4)
    power_target = 0.72 + 0.34 * math.sin(phase_fast + 0.8) + 0.10 * math.sin(phase_slow + 1.3)
    temp_target = 25.4 + 1.55 * math.sin(phase_fast / 1.25 + 1.4) + 0.35 * math.sin(phase_slow - 0.2)
    humidity_target = 57.5 + 2.8 * math.sin(phase_fast / 1.8 - 0.4) + 0.9 * math.sin(phase_slow)

    rms = max(0.8, min(2.3, rms_target + random.uniform(-0.05, 0.05)))
    power = max(0.28, min(1.45, power_target + random.uniform(-0.07, 0.07)))
    temp = max(21.5, min(33.0, temp_target + random.uniform(-0.20, 0.20)))
    humidity = max(46.0, min(68.0, humidity_target + random.uniform(-0.45, 0.45)))

    state.update(
        {
            "rms_mms": rms,
            "power_kw": power,
            "temp_c": temp,
            "humidity_rh": humidity,
        }
    )

    current_a = max(0.5, power * 1.9 + 0.12 * math.sin(phase_fast + 0.6))
    load_kg = 220.0 if power > 0.95 else 180.0 if power > 0.7 else 120.0 if power > 0.45 else 0.0

    return {
        "rms_mms": round(rms, 3),
        "power_kw": round(power, 3),
        "temp_c": round(temp, 1),
        "humidity_rh": round(humidity, 1),
        "current_a": round(current_a, 3),
        "load_kg": load_kg,
        "status": "running" if power > 0.45 else "idle",
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

    payload = {
        str(key).strip(): value.strip() if isinstance(value, str) else value
        for key, value in raw_payload.items()
        if key not in (None, "")
    }

    for key, value in list(payload.items()):
        alias_target = _CANONICAL_ALIAS_MAP.get(_canonicalize_key(key))
        if alias_target and alias_target not in payload:
            payload[alias_target] = value

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


def _build_transport_target(args: argparse.Namespace) -> str:
    if args.transport == "http":
        return args.http_url
    return _topic_for(args.machine_id, args.topic_template)


class MqttPublisher:
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


class HttpPublisher:
    def __init__(self, args: argparse.Namespace):
        self.args = args

    def connect(self) -> None:
        return None

    def publish(self, topic: str, payload: dict) -> None:
        del topic

        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.args.http_token:
            headers["Authorization"] = f"Bearer {self.args.http_token}"

        req = urllib_request.Request(
            self.args.http_url,
            data=body,
            headers=headers,
            method="POST",
        )
        ssl_context = ssl.create_default_context() if self.args.http_url.lower().startswith("https://") else None

        try:
            with urllib_request.urlopen(
                req,
                timeout=self.args.http_timeout,
                context=ssl_context,
            ) as response:
                status_code = getattr(response, "status", response.getcode())
                if status_code < 200 or status_code >= 300:
                    raise RuntimeError(f"HTTP ingest failed with status={status_code}")
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"HTTP ingest failed with status={exc.code}: {detail}"
            ) from exc
        except urllib_error.URLError as exc:
            raise RuntimeError(f"HTTP ingest connection error: {exc.reason}") from exc

    def close(self) -> None:
        return None


def main() -> int:
    args = _parse_args()

    if args.transport == "mqtt" and not args.mqtt_host:
        print("ERROR: set --mqtt-host or MQTT_HOST in .env.bridge", file=sys.stderr)
        return 2
    if args.transport == "http" and not args.http_url:
        print("ERROR: set --http-url or HTTP_INGEST_URL in .env.bridge", file=sys.stderr)
        return 2

    publisher = MqttPublisher(args) if args.transport == "mqtt" else HttpPublisher(args)
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
        print(f"Transport: {args.transport}")
        print(f"Machine id: {args.machine_id}")
        print(f"Target: {_build_transport_target(args)}")

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
