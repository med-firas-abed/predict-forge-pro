"""
MQTT ingestion — subscribe to prediteq/+/sensors, parse & feed engines.
Uses gmqtt async client with auto-reconnection.
"""

import json
import ssl
import logging

from gmqtt import Client as MQTTClient
from gmqtt.mqtt.constants import MQTTv311

from core.config import settings

logger = logging.getLogger(__name__)

TOPIC = "prediteq/+/sensors"

_mqtt: MQTTClient | None = None
_connected = False


def _on_connect(client, flags, rc, properties):
    global _connected
    _connected = True
    client.subscribe(TOPIC, qos=1)
    logger.info("MQTT connected — subscribed to %s", TOPIC)


async def _on_message(client, topic, payload, qos, properties):
    try:
        data = json.loads(payload.decode())
        # Extract machine code from payload or topic
        parts = topic.split('/')
        machine_code = data.get('machine_id') or (parts[1] if len(parts) >= 2 else None)
        if not machine_code:
            logger.warning("MQTT: no machine_id in payload or topic")
            return

        from ml.engine_manager import get_manager
        manager = get_manager()

        if machine_code not in manager.machine_cache:
            logger.warning("MQTT: unknown machine_id %s — ignoring", machine_code)
            return

        manager.ingest(machine_code, data)
    except json.JSONDecodeError:
        logger.warning("MQTT: invalid JSON payload on %s", topic)
    except Exception as e:
        logger.error("MQTT message processing error: %s", e)


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
            reconnect_retries=10,    # limit reconnection attempts
            reconnect_delay=30,      # retry every 30s
        )
        _mqtt.on_connect = _on_connect
        _mqtt.on_message = _on_message
        _mqtt.on_disconnect = _on_disconnect

        if settings.MQTT_USER:
            _mqtt.set_auth_credentials(settings.MQTT_USER, settings.MQTT_PASSWORD)
        else:
            logger.warning("MQTT_USER not set — connecting without authentication")

        kwargs = {}
        if settings.MQTT_USE_SSL:
            ssl_ctx = ssl.create_default_context()
            kwargs['ssl'] = ssl_ctx

        await _mqtt.connect(
            settings.MQTT_BROKER,
            settings.MQTT_PORT,
            version=MQTTv311,
            **kwargs,
        )
        logger.info("MQTT connecting to %s:%d ...", settings.MQTT_BROKER, settings.MQTT_PORT)
    except Exception as e:
        logger.error("MQTT connection failed: %s — running without MQTT", e)
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
