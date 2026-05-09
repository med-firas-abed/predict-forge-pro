from __future__ import annotations

import re
from typing import Any


def _normalize_label_value(value: Any) -> str:
    if not isinstance(value, str):
        return ""

    normalized = value.strip()
    if not normalized:
        return ""

    lowered = normalized.lower()
    if lowered in {"null", "undefined", "nan"}:
        return ""

    return normalized


def extract_machine_ordinal(*values: Any) -> int | None:
    for value in values:
        normalized = _normalize_label_value(value)
        if not normalized:
            continue

        match = re.search(r"(\d+)(?!.*\d)", normalized)
        if not match:
            continue

        ordinal = int(match.group(1))
        if ordinal > 0:
            return ordinal

    return None


def get_machine_public_label(
    code: Any = None,
    name: Any = None,
    *,
    fallback: str = "Machine",
) -> str:
    normalized_code = _normalize_label_value(code)
    normalized_name = _normalize_label_value(name)
    ordinal = extract_machine_ordinal(normalized_code, normalized_name)

    if ordinal is not None:
        return f"{fallback} {ordinal}"
    if normalized_code:
        return f"{fallback} {normalized_code}"
    if normalized_name:
        return f"{fallback} {normalized_name}"
    return fallback
