"""
Per-user rate limiter for expensive endpoints (LLM, PDF generation).
In-memory — works for single-instance deployments (Render Starter).
"""

import time
from collections import defaultdict

_user_hits: dict[str, list[float]] = defaultdict(list)
_last_cleanup: float = 0.0


def check_user_rate(user_id: str, limit: int = 10, window: int = 3600) -> bool:
    """
    Returns True if the user is within the rate limit.
    Default: 10 requests per hour per user.
    """
    global _last_cleanup
    now = time.time()

    # Cleanup stale entries every 5 minutes
    if now - _last_cleanup > 300:
        stale = [k for k, v in _user_hits.items() if not v or now - v[-1] > window]
        for k in stale:
            del _user_hits[k]
        _last_cleanup = now

    hits = _user_hits[user_id]
    _user_hits[user_id] = [t for t in hits if now - t < window]

    if len(_user_hits[user_id]) >= limit:
        return False

    _user_hits[user_id].append(now)
    return True
