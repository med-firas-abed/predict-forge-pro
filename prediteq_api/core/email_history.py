import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger(__name__)

EMAIL_HISTORY_PATH = Path(__file__).resolve().parents[1] / ".runtime" / "email_alert_history.jsonl"


def append_email_event(
    *,
    machine_id: str | None,
    recipient_email: str,
    success: bool,
    alert_type: str = "hi",
    source: str = "scheduler",
    machine_code: str | None = None,
    machine_name: str | None = None,
    severity: str | None = None,
    subject: str | None = None,
    note: str | None = None,
) -> None:
    payload = {
        "id": str(uuid4()),
        "machine_id": machine_id,
        "machine_code": machine_code,
        "machine_name": machine_name,
        "recipient_email": recipient_email,
        "success": bool(success),
        "type": alert_type,
        "source": source,
        "severity": severity,
        "subject": subject,
        "note": note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        EMAIL_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        with EMAIL_HISTORY_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=True) + "\n")
    except Exception as exc:
        logger.warning("Could not append local email history: %s", exc)


def read_email_events(limit: int = 200) -> list[dict]:
    if limit <= 0 or not EMAIL_HISTORY_PATH.exists():
        return []

    try:
        rows: list[dict] = []
        with EMAIL_HISTORY_PATH.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except Exception:
                    continue

        rows.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
        return rows[:limit]
    except Exception as exc:
        logger.warning("Could not read local email history: %s", exc)
        return []
