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


def _is_demo_style_machine_code(value: str) -> bool:
    return bool(re.fullmatch(r"ASC-[A-Z]\d+", value.upper()))


def _get_explicit_public_label(value: str, fallback: str) -> str | None:
    if not value:
        return None

    escaped_fallback = re.escape(fallback)
    match = re.fullmatch(rf"{escaped_fallback}\s+(.+)", value, flags=re.IGNORECASE)
    if not match:
        return None

    suffix = match.group(1).strip()
    if not suffix:
        return fallback
    return f"{fallback} {suffix}"


def get_machine_public_label(
    code: Any = None,
    name: Any = None,
    *,
    fallback: str = "Machine",
) -> str:
    normalized_code = _normalize_label_value(code)
    normalized_name = _normalize_label_value(name)

    explicit_name_label = _get_explicit_public_label(normalized_name, fallback)
    if explicit_name_label:
        return explicit_name_label

    ordinal = (
        extract_machine_ordinal(normalized_code, normalized_name)
        if _is_demo_style_machine_code(normalized_code) or (not normalized_code and normalized_name)
        else None
    )
    if ordinal is not None:
        return f"{fallback} {ordinal}"
    if normalized_code:
        return f"{fallback} {normalized_code}"
    if normalized_name:
        return f"{fallback} {normalized_name}"
    return fallback
