import asyncio
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

# Keep tests self-contained when no local prediteq_api/.env file is present.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-role-key")

from core.auth import require_admin_or_local_demo
from core.config import settings
from core.labview_demo import _resolve_scenario_config, build_labview_demo_samples
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


class AroTeqSimulatorReplayTests(unittest.TestCase):
    def test_aroteq_real_machine_joins_demo_mode_simulator(self):
        self.assertIn("ARO-01", SIMULATOR_DEMO_MODE_CODES)

    def test_aroteq_real_machine_replay_has_warmup_and_live_rows(self):
        trajectories = _build_real_machine_simulator_trajectories()
        cfg = REAL_MACHINE_SIM_STAGE_CONFIG["ARO-01"]
        aro = trajectories["ARO-01"]

        self.assertEqual(len(aro["warmup"]), int(cfg["bootstrap_ticks"]))
        self.assertEqual(len(aro["public"]), int(cfg["public_ticks"]))
        self.assertEqual(aro["scenario"]["health_state"], "surveillance")
        self.assertIn("observed_at", aro["warmup"].columns)

        first_public_row = aro["public"].iloc[0].to_dict()
        raw = _shape_simulator_raw(None, first_public_row)
        self.assertIn("current_a", raw)
        self.assertIn("vibration_rms", raw)
        self.assertEqual(raw["source"], "simulator_demo")


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


if __name__ == "__main__":
    unittest.main()
