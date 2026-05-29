import unittest
from datetime import datetime, timedelta, timezone

from core.planning_policy import resolve_planning_policy, select_task_template
from routers.planner import _evaluate_repeat_guard


class PlanningPolicyTests(unittest.TestCase):
    def test_resolve_planning_policy_marks_highrise_demo_machine_as_severe(self):
        machine = {
            "code": "ASC-C3",
            "modele": "SITI FC100L1-4",
            "etages": 19,
        }

        policy = resolve_planning_policy(
            machine,
            live={},
            raw={},
            data_source="simulator_demo",
            age_seconds=12,
            freshness_state="live",
            prediction_mode="prediction",
            confidence="high",
            hi=0.12,
            stress_value=0.82,
            alerts_24h=8,
            diagnosis_count=2,
        )

        self.assertEqual(policy["machine"]["category"], "elevator_highrise")
        self.assertEqual(policy["scenario"]["source"], "demo_scenario")
        self.assertEqual(policy["scenario"]["label"], "severe")
        self.assertGreaterEqual(policy["scenario"]["pressure"], 0.75)
        self.assertGreaterEqual(policy["telemetry"]["trust_score"], 70)

    def test_select_task_template_uses_inspection_when_telemetry_is_fragile(self):
        template = select_task_template(
            "ASC-X1",
            "critical",
            "Vibration excessive",
            machine_policy={"criticality": 0.62, "lead_time_bias_days": 0, "service_mode": "safety_first"},
            scenario_policy={"pressure": 0.58},
            telemetry_policy={"auto_schedule_guard": True, "heavy_action_guard": True},
            stop_recommended=False,
            critical_diagnosis_count=0,
        )

        self.assertEqual(template["type"], "inspection")
        self.assertEqual(template["lead_days"], 0)
        self.assertIn("Inspection urgente", template["title"])

    def test_select_task_template_keeps_corrective_for_escalated_critical_case(self):
        template = select_task_template(
            "ASC-X1",
            "critical",
            "Vibration excessive",
            machine_policy={"criticality": 0.78, "lead_time_bias_days": -1, "service_mode": "safety_first"},
            scenario_policy={"pressure": 0.84},
            telemetry_policy={"auto_schedule_guard": True, "heavy_action_guard": True},
            stop_recommended=True,
            critical_diagnosis_count=1,
        )

        self.assertEqual(template["type"], "corrective")
        self.assertEqual(template["lead_days"], 0)


class PlannerRepeatGuardTests(unittest.TestCase):
    def test_repeat_guard_blocks_recent_repeat_without_escalation(self):
        history_summary = {
            "latest_completed_at": datetime.now(timezone.utc) - timedelta(days=2),
        }
        decision = {
            "urgency_band": "priority",
            "urgency_score": 66,
            "alerts_24h": 1,
            "stop_recommended": False,
            "policy_context": {
                "scenario": {"pressure": 0.42},
                "telemetry": {"trust_score": 64},
            },
        }
        task_template = {"cooldown_days": 14}

        guard = _evaluate_repeat_guard(history_summary, decision, task_template)

        self.assertTrue(guard["blocked"])
        self.assertGreaterEqual(guard["remaining_days"], 1)

    def test_repeat_guard_allows_new_task_when_risk_escalates(self):
        history_summary = {
            "latest_completed_at": datetime.now(timezone.utc) - timedelta(days=2),
        }
        decision = {
            "urgency_band": "critical",
            "urgency_score": 91,
            "alerts_24h": 7,
            "stop_recommended": True,
            "policy_context": {
                "scenario": {"pressure": 0.86},
                "telemetry": {"trust_score": 82},
            },
        }
        task_template = {"cooldown_days": 14}

        guard = _evaluate_repeat_guard(history_summary, decision, task_template)

        self.assertFalse(guard["blocked"])


if __name__ == "__main__":
    unittest.main()
