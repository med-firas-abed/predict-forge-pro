import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

# Keep tests self-contained when no local prediteq_api/.env file is present.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-role-key")

from routers import health
from routers.diagnostics_rul import build_calibrated_rul_response


class CalibratedRulWarmupTests(unittest.TestCase):
    def test_persisted_rul_stays_last_valid_reference_during_warmup(self):
        manager = SimpleNamespace(last_results={})

        with patch(
            "routers.diagnostics_rul._get_machine_from_supabase",
            return_value={"hi_courant": 0.55, "rul_courant": 18},
        ):
            with patch(
                "routers.diagnostics_rul._build_bearing_reference_block",
                return_value={"years_adjusted": 10.0},
            ):
                with patch(
                    "routers.diagnostics_rul.get_surfaceable_demo_reference_prediction",
                    return_value=None,
                ):
                    with patch(
                        "routers.diagnostics_rul._build_feature_vector",
                        side_effect=HTTPException(status_code=425, detail="warming up"),
                    ):
                        payload = build_calibrated_rul_response(manager, "ASC-B2")

        self.assertEqual(payload["mode"], "initializing")
        self.assertIsNone(payload["prediction"])
        self.assertEqual(
            payload["reference_prediction"],
            {"kind": "last_valid", "rul_days": 18},
        )
        self.assertIn("Derniere estimation valide", payload["warmup_detail"])


class HealthResilienceCapabilityTests(unittest.TestCase):
    def test_planner_capability_stays_available_without_groq(self):
        manager = SimpleNamespace(
            engines={"ASC-A1": object()},
            active_machines={"ASC-A1"},
        )
        deps = {
            "supabase": {"status": "ok"},
            "groq": {"status": "not_configured"},
            "smtp": {"status": "not_configured"},
            "mqtt": {"status": "disconnected"},
            "live_ingest": {"status": "ok"},
        }

        with patch("routers.health.get_manager", return_value=manager):
            with patch("routers.health._collect_dependency_statuses", return_value=deps):
                payload = health.health_resilience()

        self.assertEqual(payload["capabilities"]["planner"], "ok")
        self.assertEqual(payload["capabilities"]["ai_reports"], "local_fallback")


if __name__ == "__main__":
    unittest.main()
