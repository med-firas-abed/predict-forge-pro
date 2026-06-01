import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from starlette.requests import Request

# Keep tests self-contained when no local prediteq_api/.env file is present.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-role-key")

from core.auth import CurrentUser, require_admin_or_local_demo
from core.config import settings
from core.labview_demo import _resolve_scenario_config, build_labview_demo_samples
from ml.loader import _apply_runtime_rf_limit
from routers import live_ingest, simulator
from routers.live_ingest import _apply_bootstrap_metric_overrides
from routers.simulator import (
    REAL_MACHINE_SIM_STAGE_CONFIG,
    SIMULATOR_DEMO_MODE_CODES,
    _build_real_machine_simulator_trajectories,
    _shape_simulator_raw,
)


class BenArousHealthyDemoTests(unittest.TestCase):
    def test_aroteq_machine_uses_commissioning_friendly_healthy_config(self):
        ben_arous_cfg = _resolve_scenario_config("ARO-01", "healthy")
        generic_cfg = _resolve_scenario_config("ASC-Z9", "healthy")

        self.assertGreater(ben_arous_cfg["start_hi"], generic_cfg["start_hi"])
        self.assertGreater(ben_arous_cfg["end_hi"], generic_cfg["end_hi"])
        self.assertLess(ben_arous_cfg["load_target"], generic_cfg["load_target"])
        self.assertLess(ben_arous_cfg["noise_mult"], generic_cfg["noise_mult"])
        self.assertEqual(ben_arous_cfg["default_profile"], "A_linear")

    def test_aroteq_machine_samples_stay_light_and_healthy(self):
        rows = build_labview_demo_samples(
            machine_id="ARO-01",
            scenario="healthy",
            duration_s=2 * 44,
            seed=7,
        )

        self.assertTrue(rows)
        self.assertEqual(rows[0]["profile"], "A_linear")

        average_load = sum(float(row["charge"]) for row in rows) / len(rows)
        average_vibration = sum(float(row["vibration_mm_s"]) for row in rows) / len(rows)

        self.assertLess(average_load, 100.0)
        self.assertLess(average_vibration, 1.2)


class BootstrapMetricOverrideTests(unittest.TestCase):
    def test_metric_overrides_update_runtime_cache(self):
        class FakeManager:
            def __init__(self):
                self.machine_cache = {"ARO-01": {}}
                self.override_calls = []

            def set_cycles_per_day_override(self, code, value):
                self.override_calls.append((code, value))

        manager = FakeManager()

        _apply_bootstrap_metric_overrides(
            "ARO-01",
            manager,
            cycles_per_day_override=160.0,
            power_avg_30j_override=1.24,
        )

        self.assertEqual(manager.override_calls, [("ARO-01", 160.0)])
        self.assertEqual(manager.machine_cache["ARO-01"]["cycles_avg_7j"], 160.0)
        self.assertEqual(manager.machine_cache["ARO-01"]["power_avg_30j"], 1.24)
        self.assertIn("metrics_updated", manager.machine_cache["ARO-01"])


class StandardUserMachineAutoseedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._lock_snapshot = dict(live_ingest._STANDARD_USER_MACHINE_AUTOSEED_LOCKS)
        live_ingest._STANDARD_USER_MACHINE_AUTOSEED_LOCKS = {}

    async def asyncTearDown(self):
        live_ingest._STANDARD_USER_MACHINE_AUTOSEED_LOCKS = dict(self._lock_snapshot)

    async def test_standard_user_autoseeds_only_assigned_machine(self):
        class FakeManager:
            def __init__(self):
                self.machine_cache = {}
                self.last_raw = {}
                self.last_results = {}
                self.sensor_history = {}

        manager = FakeManager()
        user = CurrentUser(
            id="user-1",
            email="user@example.com",
            role="user",
            status="approved",
            machine_id="machine-uuid-1",
        )
        machine_row = {
            "id": "machine-uuid-1",
            "code": "ARO-01",
            "statut": "operational",
            "hi_courant": 0.95,
        }

        with patch.object(settings, "APP_MODE", "demo"):
            with patch.object(settings, "AUTOSEED_STANDARD_USER_MACHINE", None, create=True):
                with patch(
                    "routers.live_ingest.asyncio.to_thread",
                    new=AsyncMock(side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)),
                ):
                    with patch(
                        "routers.live_ingest.bootstrap_live_machine",
                        return_value={"status": "ok", "machine_code": "ARO-01"},
                    ) as bootstrap_mock:
                        payload = await live_ingest.ensure_standard_user_machine_runtime_ready(
                            "ARO-01",
                            user,
                            manager=manager,
                            machine_row=machine_row,
                        )

        self.assertEqual(payload, {"status": "ok", "machine_code": "ARO-01"})
        bootstrap_mock.assert_called_once()
        self.assertIn("ARO-01", manager.machine_cache)
        self.assertEqual(
            bootstrap_mock.call_args.kwargs,
            {
                "scenario": "healthy",
                "profile": "A_linear",
                "duration_s": 3600,
                "seed": live_ingest._stable_machine_seed("ARO-01"),
                "source": "simulator_user_machine",
                "persist_machine_metrics": True,
                "cycles_per_day_override": 280.0,
                "power_avg_30j_override": 1.18,
            },
        )

    async def test_standard_user_autoseed_skips_when_runtime_already_exists(self):
        class FakeManager:
            def __init__(self):
                self.machine_cache = {}
                self.last_raw = {"ASC-A1": {"source": "live_runtime"}}
                self.last_results = {}
                self.sensor_history = {}

        manager = FakeManager()
        user = CurrentUser(
            id="user-2",
            email="user@example.com",
            role="user",
            status="approved",
            machine_id="machine-uuid-2",
        )
        machine_row = {
            "id": "machine-uuid-2",
            "code": "ASC-A1",
            "statut": "operational",
            "hi_courant": 0.96,
        }

        with patch.object(settings, "APP_MODE", "demo"):
            with patch.object(settings, "AUTOSEED_STANDARD_USER_MACHINE", None, create=True):
                with patch("routers.live_ingest.bootstrap_live_machine") as bootstrap_mock:
                    payload = await live_ingest.ensure_standard_user_machine_runtime_ready(
                        "ASC-A1",
                        user,
                        manager=manager,
                        machine_row=machine_row,
                    )

        self.assertIsNone(payload)
        bootstrap_mock.assert_not_called()

    async def test_standard_user_autoseed_stays_disabled_in_prod_mode(self):
        class FakeManager:
            def __init__(self):
                self.machine_cache = {}
                self.last_raw = {}
                self.last_results = {}
                self.sensor_history = {}

        manager = FakeManager()
        user = CurrentUser(
            id="user-3",
            email="user@example.com",
            role="user",
            status="approved",
            machine_id="machine-uuid-3",
        )
        machine_row = {
            "id": "machine-uuid-3",
            "code": "ASC-B2",
            "statut": "degraded",
            "hi_courant": 0.62,
        }

        with patch.object(settings, "APP_MODE", "prod"):
            with patch.object(settings, "AUTOSEED_STANDARD_USER_MACHINE", None, create=True):
                with patch("routers.live_ingest.bootstrap_live_machine") as bootstrap_mock:
                    payload = await live_ingest.ensure_standard_user_machine_runtime_ready(
                        "ASC-B2",
                        user,
                        manager=manager,
                        machine_row=machine_row,
                    )

        self.assertIsNone(payload)
        bootstrap_mock.assert_not_called()

    async def test_render_runtime_keeps_standard_user_autoseed_disabled_by_default(self):
        class FakeManager:
            def __init__(self):
                self.machine_cache = {}
                self.last_raw = {}
                self.last_results = {}
                self.sensor_history = {}

        manager = FakeManager()
        user = CurrentUser(
            id="user-4",
            email="user@example.com",
            role="user",
            status="approved",
            machine_id="machine-uuid-4",
        )
        machine_row = {
            "id": "machine-uuid-4",
            "code": "ASC-C3",
            "statut": "critical",
            "hi_courant": 0.12,
        }

        with patch.dict(os.environ, {"RENDER": "true"}, clear=False):
            with patch.object(settings, "APP_MODE", "demo"):
                with patch.object(settings, "AUTOSEED_STANDARD_USER_MACHINE", None, create=True):
                    with patch("routers.live_ingest.bootstrap_live_machine") as bootstrap_mock:
                        payload = await live_ingest.ensure_standard_user_machine_runtime_ready(
                            "ASC-C3",
                            user,
                            manager=manager,
                            machine_row=machine_row,
                        )

        self.assertIsNone(payload)
        bootstrap_mock.assert_not_called()


class RuntimeHostedMemoryGuardTests(unittest.TestCase):
    def test_render_runtime_uses_a_safe_rf_limit_by_default(self):
        with patch.dict(os.environ, {"RENDER": "true"}, clear=False):
            with patch.object(settings, "RUNTIME_RF_ESTIMATOR_LIMIT", None, create=True):
                self.assertEqual(settings.EFFECTIVE_RUNTIME_RF_ESTIMATOR_LIMIT, 96)

    def test_runtime_rf_limit_trims_extra_estimators_without_breaking_shape(self):
        class DummyRf:
            def __init__(self, count):
                self.estimators_ = list(range(count))
                self.n_estimators = count

        dummy = DummyRf(300)
        trimmed = _apply_runtime_rf_limit(dummy, 96)

        self.assertIs(trimmed, dummy)
        self.assertEqual(len(trimmed.estimators_), 96)
        self.assertEqual(trimmed.n_estimators, 96)

    def test_runtime_rf_limit_keeps_full_model_when_cap_is_absent(self):
        class DummyRf:
            def __init__(self, count):
                self.estimators_ = list(range(count))
                self.n_estimators = count

        dummy = DummyRf(300)
        kept = _apply_runtime_rf_limit(dummy, None)

        self.assertEqual(len(kept.estimators_), 300)
        self.assertEqual(kept.n_estimators, 300)


class AroTeqSimulatorReplayTests(unittest.TestCase):
    def test_aroteq_real_machine_joins_demo_mode_simulator(self):
        self.assertIn("ARO-01", SIMULATOR_DEMO_MODE_CODES)

    def test_aroteq_real_machine_replay_stays_close_to_machine_1_story(self):
        trajectories = _build_real_machine_simulator_trajectories()
        cfg = REAL_MACHINE_SIM_STAGE_CONFIG["ARO-01"]
        aro = trajectories["ARO-01"]

        self.assertEqual(len(aro["warmup"]), int(cfg["bootstrap_ticks"]))
        self.assertEqual(len(aro["public"]), int(cfg["public_ticks"]))
        self.assertEqual(aro["scenario"]["health_state"], "good")
        self.assertEqual(aro["scenario"]["profile"], "A_linear")
        self.assertGreaterEqual(float(cfg["target_runtime_hi"]), 0.95)
        self.assertIn("observed_at", aro["warmup"].columns)
        self.assertIn("simulated_hi", aro["warmup"].columns)
        self.assertGreater(float(aro["public"]["simulated_hi"].min()), 0.94)

        first_public_row = aro["public"].iloc[0].to_dict()
        raw = _shape_simulator_raw(None, first_public_row)
        self.assertIn("current_a", raw)
        self.assertIn("vibration_rms", raw)
        self.assertEqual(raw["source"], "simulator_demo")
        self.assertLessEqual(float(first_public_row["charge"]), 90.0)
        self.assertLess(float(first_public_row["vibration_mm_s"]), 1.4)

        ascent_currents = aro["public"].loc[
            aro["public"]["phase"] == "ascent",
            "current_a",
        ].astype(float)
        self.assertTrue(len(ascent_currents) > 10)
        self.assertLess(float(ascent_currents.std()), 0.05)


def _make_request(client_host: str) -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/simulator/start",
            "headers": [],
            "client": (client_host, 12345),
            "server": ("127.0.0.1", 8000),
        }
    )


class LocalDemoSimulatorAuthTests(unittest.TestCase):
    def test_loopback_demo_request_gets_local_admin_user(self):
        with patch.object(settings, "APP_MODE", "demo"):
            user = asyncio.run(require_admin_or_local_demo(_make_request("127.0.0.1"), None))

        self.assertTrue(user.is_admin)
        self.assertTrue(user.is_approved)
        self.assertEqual(user.id, "local-demo-controller")

    def test_non_loopback_request_still_requires_real_admin_auth(self):
        with patch.object(settings, "APP_MODE", "demo"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(require_admin_or_local_demo(_make_request("10.20.30.40"), None))

        self.assertEqual(ctx.exception.status_code, 401)

    def test_loopback_bypass_is_disabled_in_prod_mode(self):
        with patch.object(settings, "APP_MODE", "prod"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(require_admin_or_local_demo(_make_request("127.0.0.1"), None))

        self.assertEqual(ctx.exception.status_code, 401)


class DemoSimulatorAutoStartTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._state_snapshot = dict(simulator._state)

    async def asyncTearDown(self):
        simulator._state = dict(self._state_snapshot)

    async def test_demo_mode_autostart_starts_background_replay(self):
        simulator._state = {
            "running": False,
            "speed": 60,
            "tick": 0,
            "demo_mode": True,
            "machines": {},
        }

        with patch.object(settings, "APP_MODE", "demo"):
            with patch.object(settings, "AUTO_START_DEMO_SIMULATOR", None, create=True):
                with patch("routers.simulator._start_simulator_session", new=AsyncMock(return_value=SIMULATOR_DEMO_MODE_CODES)) as start_mock:
                    with patch("routers.simulator._wait_for_runtime_seed", new=AsyncMock(return_value=True)) as wait_mock:
                        started = await simulator.ensure_demo_simulator_running()

        self.assertTrue(started)
        start_mock.assert_awaited_once_with(
            speed=60,
            reset=True,
            demo_mode=True,
            email_notifications=False,
        )
        wait_mock.assert_awaited_once()

    async def test_prod_mode_keeps_autostart_disabled_by_default(self):
        simulator._state = {
            "running": False,
            "speed": 60,
            "tick": 0,
            "demo_mode": True,
            "machines": {},
        }

        with patch.object(settings, "APP_MODE", "prod"):
            with patch.object(settings, "AUTO_START_DEMO_SIMULATOR", None, create=True):
                with patch("routers.simulator._start_simulator_session", new=AsyncMock()) as start_mock:
                    started = await simulator.ensure_demo_simulator_running()

        self.assertFalse(started)
        start_mock.assert_not_awaited()

    async def test_render_runtime_keeps_demo_autostart_disabled_by_default(self):
        simulator._state = {
            "running": False,
            "speed": 60,
            "tick": 0,
            "demo_mode": True,
            "machines": {},
        }

        with patch.dict(os.environ, {"RENDER": "true"}, clear=False):
            with patch.object(settings, "APP_MODE", "demo"):
                with patch.object(settings, "AUTO_START_DEMO_SIMULATOR", None, create=True):
                    with patch("routers.simulator._start_simulator_session", new=AsyncMock()) as start_mock:
                        started = await simulator.ensure_demo_simulator_running()

        self.assertFalse(started)
        start_mock.assert_not_awaited()

if __name__ == "__main__":
    unittest.main()
