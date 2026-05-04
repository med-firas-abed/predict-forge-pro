"""Helpers that isolate PFE demo metadata from generic runtime flows.

The simulator always needs access to the full demo scenarios. Generic routes
such as `/machines` or `/diagnostics/.../rul-v2` may still surface some of
that information today for the PFE, but the surfacing policy is centralized
here so production can later dial it down without untangling business logic.
"""

from __future__ import annotations

from demo_scenarios import DEMO_MACHINE_SCENARIOS, DemoScenario

from core.config import settings


def _app_mode() -> str:
    return "prod" if str(settings.APP_MODE).strip().lower() == "prod" else "demo"


def _resolve_demo_flag(explicit_value: bool | None) -> bool:
    if explicit_value is not None:
        return bool(explicit_value)
    return _app_mode() == "demo"


def get_demo_machine_codes() -> list[str]:
    return list(DEMO_MACHINE_SCENARIOS.keys())


def get_demo_scenario(machine_code: str | None) -> DemoScenario | None:
    if not machine_code:
        return None
    scenario = DEMO_MACHINE_SCENARIOS.get(machine_code)
    return dict(scenario) if scenario is not None else None


def get_demo_initial_hi() -> dict[str, float]:
    return {
        code: float(scenario["target_hi"])
        for code, scenario in DEMO_MACHINE_SCENARIOS.items()
    }


def iter_demo_calibration_seeds() -> list[tuple[str, float, float]]:
    return [
        (
            code,
            float(scenario["cycles_per_day"]),
            float(scenario["power_avg_30j_kw"]),
        )
        for code, scenario in DEMO_MACHINE_SCENARIOS.items()
    ]


def should_surface_demo_metadata() -> bool:
    return _resolve_demo_flag(settings.SURFACE_DEMO_METADATA)


def should_surface_demo_reference() -> bool:
    return _resolve_demo_flag(settings.SURFACE_DEMO_REFERENCE)


def get_surfaceable_demo_scenario(machine_code: str | None) -> DemoScenario | None:
    if not should_surface_demo_metadata():
        return None
    return get_demo_scenario(machine_code)


def get_surfaceable_demo_reference_prediction(
    machine_code: str | None,
) -> dict[str, int | str] | None:
    if not should_surface_demo_reference():
        return None

    scenario = get_demo_scenario(machine_code)
    if not scenario:
        return None

    reference_rul_days = scenario.get("reference_rul_days")
    if isinstance(reference_rul_days, (int, float)) and reference_rul_days > 0:
        return {
            "kind": "demo_reference",
            "rul_days": int(round(float(reference_rul_days))),
        }
    return None
