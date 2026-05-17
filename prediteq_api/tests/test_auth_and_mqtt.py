import unittest
from unittest.mock import patch

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from core import audit
from core.auth import _get_user_from_token
from routers import mqtt


class AuthHeaderHandlingTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()

        @app.get("/protected")
        async def protected(_user=Depends(_get_user_from_token)):
            return {"status": "ok"}

        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    def test_missing_authorization_header_returns_401(self):
        response = self.client.get("/protected")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Missing Bearer token"})

    def test_non_bearer_authorization_header_returns_401(self):
        response = self.client.get(
            "/protected",
            headers={"Authorization": "Token not-a-bearer"},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Missing Bearer token"})


class MqttHelpersTests(unittest.TestCase):
    def tearDown(self):
        mqtt._mqtt = None
        mqtt._connected = False
        mqtt._disconnecting = False

    def test_resolve_client_id_prefers_explicit_setting(self):
        with patch.object(mqtt.settings, "MQTT_CLIENT_ID", "prediteq-fixed-client", create=True):
            self.assertEqual(mqtt._resolve_client_id(), "prediteq-fixed-client")

    def test_resolve_client_id_builds_sanitized_default(self):
        with patch.object(mqtt.settings, "MQTT_CLIENT_ID", "", create=True):
            with patch("routers.mqtt.socket.gethostname", return_value="Dev Machine #42"):
                with patch("routers.mqtt.os.getpid", return_value=4321):
                    client_id = mqtt._resolve_client_id()

        self.assertEqual(client_id, "prediteq-api-dev-machine-42-4321")

    def test_on_disconnect_logs_clean_shutdown_separately(self):
        mqtt._disconnecting = True

        with self.assertLogs(mqtt.logger.name, level="INFO") as captured:
            mqtt._on_disconnect(None, None)

        self.assertIn("MQTT disconnected cleanly", " ".join(captured.output))

    def test_on_disconnect_warns_when_unexpected(self):
        mqtt._disconnecting = False

        with self.assertLogs(mqtt.logger.name, level="WARNING") as captured:
            mqtt._on_disconnect(None, None, RuntimeError("socket closed"))

        output = " ".join(captured.output)
        self.assertIn("MQTT disconnected (will auto-reconnect)", output)
        self.assertIn("socket closed", output)


class FakeMqttClient:
    def __init__(self, client_id, reconnect_retries, reconnect_delay):
        self.client_id = client_id
        self.reconnect_retries = reconnect_retries
        self.reconnect_delay = reconnect_delay
        self.auth_credentials = None
        self.connect_args = None
        self.on_connect = None
        self.on_message = None
        self.on_disconnect = None

    def set_auth_credentials(self, user, password):
        self.auth_credentials = (user, password)

    async def connect(self, host, port, version=None, **kwargs):
        self.connect_args = {
            "host": host,
            "port": port,
            "version": version,
            "kwargs": kwargs,
        }

    async def disconnect(self):
        return None


class MqttConnectTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        mqtt._mqtt = None
        mqtt._connected = False
        mqtt._disconnecting = False

    async def test_connect_uses_generated_client_id_and_credentials(self):
        created_clients: list[FakeMqttClient] = []

        def fake_factory(client_id, reconnect_retries, reconnect_delay):
            client = FakeMqttClient(client_id, reconnect_retries, reconnect_delay)
            created_clients.append(client)
            return client

        with patch("routers.mqtt.MQTTClient", side_effect=fake_factory):
            with patch.object(mqtt.settings, "MQTT_CLIENT_ID", "", create=True):
                with patch.object(mqtt.settings, "MQTT_BROKER", "broker.example.com", create=True):
                    with patch.object(mqtt.settings, "MQTT_PORT", 8883, create=True):
                        with patch.object(mqtt.settings, "MQTT_USER", "demo-user", create=True):
                            with patch.object(mqtt.settings, "MQTT_PASSWORD", "demo-password", create=True):
                                with patch.object(mqtt.settings, "MQTT_USE_SSL", False, create=True):
                                    with patch("routers.mqtt.socket.gethostname", return_value="codex-box"):
                                        with patch("routers.mqtt.os.getpid", return_value=2468):
                                            await mqtt.connect()

        self.assertEqual(len(created_clients), 1)
        client = created_clients[0]
        self.assertEqual(client.client_id, "prediteq-api-codex-box-2468")
        self.assertEqual(client.auth_credentials, ("demo-user", "demo-password"))
        self.assertEqual(
            client.connect_args,
            {
                "host": "broker.example.com",
                "port": 8883,
                "version": mqtt.MQTTv311,
                "kwargs": {},
            },
        )


class AuditLoggingTests(unittest.TestCase):
    def tearDown(self):
        audit._audit_table_available = None

    def test_missing_audit_table_is_cached_after_first_failure(self):
        missing_table_error = RuntimeError(
            "Could not find the table 'public.audit_logs' in the schema cache"
        )

        class FakeInsert:
            def execute(self):
                raise missing_table_error

        class FakeTable:
            def insert(self, payload):
                return FakeInsert()

        class FakeSupabase:
            def __init__(self):
                self.table_calls = 0

            def table(self, name):
                self.table_calls += 1
                return FakeTable()

        fake_supabase = FakeSupabase()

        with patch("core.supabase_client.get_supabase", return_value=fake_supabase):
            with self.assertLogs(audit.logger.name, level="WARNING") as captured:
                audit.log_audit("actor-1", "admin@example.com", "user.delete", {"target": "u-1"})

            self.assertFalse(audit._audit_table_available)
            self.assertEqual(fake_supabase.table_calls, 1)
            self.assertIn("Audit log table unavailable", " ".join(captured.output))

            audit.log_audit("actor-1", "admin@example.com", "user.delete", {"target": "u-1"})
            self.assertEqual(
                fake_supabase.table_calls,
                1,
                "Audit DB insert should not be retried after the table is known missing",
            )


if __name__ == "__main__":
    unittest.main()
