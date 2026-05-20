"""
MQTT ingestion - subscribe to prediteq/+/sensors, parse and feed engines.
Uses gmqtt async client with auto-reconnection.
"""

import json
import logging
import os
import re
import socket
import ssl

from gmqtt import Client as MQTTClient
from gmqtt.mqtt.constants import MQTTv311

from core.config import settings
from core.supabase_client import get_supabase

logger = logging.getLogger(__name__)

TOPIC = "prediteq/+/sensors"

_mqtt: MQTTClient | None = None
_connected = False
_disconnecting = False


def _allow_extreme_source(source: str | None) -> bool:
    normalized = str(source or "").strip().lower()
    if not normalized:
        return False
    return any(
        hint in normalized
        for hint in (
            "labview",
            "bridge_pc",
            "site_bridge_pc",
            "relay_pc",
            "relay",
            "plc_bridge",
        )
    )


def _sanitize_client_id_fragment(value: str) -> str:
    collapsed = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-_")
    return (collapsed or "host").lower()[:24]


def _resolve_client_id() -> str:
    configured = settings.MQTT_CLIENT_ID.strip()
    if configured:
        return configured

    host = _sanitize_client_id_fragment(socket.gethostname())
    return f"prediteq-api-{host}-{os.getpid()}"[:64]


def _disconnect_details(packet, exc) -> str:
    details: list[str] = []
    reason_code = getattr(packet, "reason_code", None)
    if reason_code is not None:
        details.append(f"reason={reason_code}")
    if exc is not None:
        details.append(f"error={exc}")
    return ", ".join(details) if details else "no details"


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

        manager.ingest(
            machine_code,
            data,
            allow_extreme=_allow_extreme_source(data.get("source")),
        )
    except json.JSONDecodeError:
        logger.warning("MQTT: invalid JSON payload on %s", topic)
    except Exception as exc:
        logger.error("MQTT message processing error: %s", exc)


def _on_disconnect(client, packet, exc=None):
    global _connected
    _connected = False
    details = _disconnect_details(packet, exc)
    if _disconnecting:
        logger.info("MQTT disconnected cleanly (%s)", details)
        return
    logger.warning("MQTT disconnected (will auto-reconnect): %s", details)


async def connect():
    """Connect to the MQTT broker. Non-fatal if it fails."""
    global _mqtt, _disconnecting
    try:
        client_id = _resolve_client_id()
        _disconnecting = False
        _mqtt = MQTTClient(
            client_id,
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
            "MQTT connecting to %s:%d with client id %s ...",
            settings.MQTT_BROKER,
            settings.MQTT_PORT,
            client_id,
        )
    except Exception as exc:
        logger.error("MQTT connection failed: %s - running without MQTT", exc)
        _mqtt = None


async def disconnect():
    global _mqtt, _connected, _disconnecting
    client = _mqtt
    _disconnecting = True
    if client:
        try:
            await client.disconnect()
        except Exception:
            pass
    _mqtt = None
    _connected = False
    logger.info("MQTT disconnected")


def is_connected() -> bool:
    return _connected
