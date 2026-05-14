"""
MQTT ingestion - subscribe to prediteq/+/sensors, parse and feed engines.
Uses gmqtt async client with auto-reconnection.
"""

import json
import logging
import ssl

from gmqtt import Client as MQTTClient
from gmqtt.mqtt.constants import MQTTv311

from core.config import settings
from core.supabase_client import get_supabase

logger = logging.getLogger(__name__)

TOPIC = "prediteq/+/sensors"

_mqtt: MQTTClient | None = None
_connected = False


def _load_machine_from_db(machine_code: str) -> dict | None:
    normalized_code = str(machine_code or "").strip().upper()
    if not normalized_code:
        return None

    try:
        result = (
            get_supabase()
            .table("machines")
            .select("*")
            .eq("code", normalized_code)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning(
            "MQTT: could not refresh machine cache for %s: %s",
            normalized_code,
            exc,
        )
        return None

    return (result.data or [None])[0]


def _on_connect(client, flags, rc, properties):
    global _connected
    _connected = True
    client.subscribe(TOPIC, qos=1)
    logger.info("MQTT connected - subscribed to %s", TOPIC)


async def _on_message(client, topic, payload, qos, properties):
    try:
        data = json.loads(payload.decode())
        if isinstance(data, dict) and data.get("timestamp") and not data.get("observed_at"):
            # The exported MQTT schema still advertises `timestamp`; normalize
            # it here so the runtime keeps the source event time.
            data["observed_at"] = data["timestamp"]

        parts = topic.split("/")
        machine_code = data.get("machine_id") or (parts[1] if len(parts) >= 2 else None)
        if not machine_code:
            logger.warning("MQTT: no machine_id in payload or topic")
            return

        machine_code = str(machine_code).strip().upper()
        data["machine_id"] = machine_code

        from ml.engine_manager import get_manager

        manager = get_manager()

        if machine_code not in manager.machine_cache:
            machine_row = _load_machine_from_db(machine_code)
            if machine_row is None:
                logger.warning("MQTT: unknown machine_id %s - ignoring", machine_code)
                return
            manager.machine_cache[machine_code] = {
                **manager.machine_cache.get(machine_code, {}),
                **machine_row,
            }
            logger.info(
                "MQTT: loaded machine %s from Supabase after first live payload",
                machine_code,
            )

        manager.ingest(machine_code, data)
    except json.JSONDecodeError:
        logger.warning("MQTT: invalid JSON payload on %s", topic)
    except Exception as exc:
        logger.error("MQTT message processing error: %s", exc)


def _on_disconnect(client, packet, exc=None):
    global _connected
    _connected = False
    logger.warning("MQTT disconnected (will auto-reconnect)")


async def connect():
    """Connect to the MQTT broker. Non-fatal if it fails."""
    global _mqtt
    try:
        _mqtt = MQTTClient(
            "prediteq-api-server",
            reconnect_retries=10,
            reconnect_delay=30,
        )
        _mqtt.on_connect = _on_connect
        _mqtt.on_message = _on_message
        _mqtt.on_disconnect = _on_disconnect

        if settings.MQTT_USER:
            _mqtt.set_auth_credentials(settings.MQTT_USER, settings.MQTT_PASSWORD)
        else:
            logger.warning("MQTT_USER not set - connecting without authentication")

        kwargs = {}
        if settings.MQTT_USE_SSL:
            ssl_ctx = ssl.create_default_context()
            kwargs["ssl"] = ssl_ctx

        await _mqtt.connect(
            settings.MQTT_BROKER,
            settings.MQTT_PORT,
            version=MQTTv311,
            **kwargs,
        )
        logger.info(
            "MQTT connecting to %s:%d ...",
            settings.MQTT_BROKER,
            settings.MQTT_PORT,
        )
    except Exception as exc:
        logger.error("MQTT connection failed: %s - running without MQTT", exc)
        _mqtt = None


async def disconnect():
    global _mqtt, _connected
    if _mqtt and _connected:
        try:
            await _mqtt.disconnect()
        except Exception:
            pass
    _mqtt = None
    _connected = False
    logger.info("MQTT disconnected")


def is_connected() -> bool:
    return _connected
