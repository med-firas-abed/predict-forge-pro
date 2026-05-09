from __future__ import annotations

from typing import Literal

TaskType = Literal["preventive", "inspection", "corrective"]

LABOR_RATE_PER_HOUR = 30

TASK_COST_ASSUMPTIONS: dict[TaskType, dict[str, int | str]] = {
    "preventive": {
        "labor_hours": 2,
        "parts_cost": 200,
        "label": "Visite preventive",
    },
    "inspection": {
        "labor_hours": 3,
        "parts_cost": 230,
        "label": "Inspection renforcee",
    },
    "corrective": {
        "labor_hours": 6,
        "parts_cost": 300,
        "label": "Intervention corrective",
    },
}


def get_task_cost_reference(task_type: TaskType) -> dict[str, int | str]:
    assumption = TASK_COST_ASSUMPTIONS[task_type]
    labor_hours = int(assumption["labor_hours"])
    parts_cost = int(assumption["parts_cost"])
    labor_cost = labor_hours * LABOR_RATE_PER_HOUR

    return {
        **assumption,
        "labor_rate": LABOR_RATE_PER_HOUR,
        "labor_cost": labor_cost,
        "total_cost": labor_cost + parts_cost,
    }


def get_task_baseline_cost(task_type: TaskType) -> int:
    return int(get_task_cost_reference(task_type)["total_cost"])


def get_budget_reference_cost(task_type: TaskType, historical_average: float = 0.0) -> float:
    return max(float(historical_average), float(get_task_baseline_cost(task_type)))
