"""
PrediTeq API — FastAPI backend for predictive maintenance.
Entry point: uvicorn main:app --reload
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("prediteq")


# ─── Lifespan (startup / shutdown) ───────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ───────────────────────────────────────────────────────────
    logger.info("Starting PrediTeq API ...")

    from core.config import settings

    # 0. Validate required env vars early
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")

    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set — AI chat, reports, and planner will be unavailable")
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — email alerts will be skipped")
    if not settings.ADMIN_EMAIL:
        logger.warning("ADMIN_EMAIL not set — fallback alert recipient is empty; configure recipients in /seuils")

    # 1. Supabase client
    from core.supabase_client import init_supabase
    sb = init_supabase()

    # 2. Load ML models (crash early if missing — cannot operate without them)
    from ml.loader import load_all
    if_model, rf_model, scaler_params, hi_params, hybrid_params, engine_cls = load_all()

    # 3. Initialize engine manager
    from ml.engine_manager import init_manager
    manager = init_manager(if_model, rf_model, scaler_params, hi_params,
                           hybrid_params, engine_cls)

    # 4. Cache machine UUIDs from Supabase (non-fatal: retry at runtime)
    # RUL v2 (F3): also select power_avg_30j, cycles_avg_7j, metrics_updated
    # so the calibration layer can pick them up at startup. These columns are
    # added by migration 006_rul_v2_calibration.sql; if missing, the select
    # itself will fail and we fall back to the legacy column set.
    try:
        try:
            machines_res = sb.table('machines').select(
                'id, code, nom, region, '
                'power_avg_30j, cycles_avg_7j, metrics_updated'
            ).execute()
        except Exception as legacy_e:
            # Migration 006 not applied yet — fall back to legacy columns
            logger.warning(
                "RUL v2 columns not present (migration 006 not applied?): %s "
                "— falling back to legacy machine schema", legacy_e
            )
            machines_res = sb.table('machines').select(
                'id, code, nom, region'
            ).execute()
        manager.register_machines(machines_res.data)
    except Exception as e:
        logger.error("Failed to register machines at startup: %s — will retry on first request", e)

    # 5. Connect MQTT (optional — skipped if no broker configured)
    import asyncio as _aio
    from routers import mqtt
    if settings.MQTT_BROKER and settings.MQTT_BROKER != "broker.emqx.io":
        try:
            await _aio.wait_for(mqtt.connect(), timeout=15.0)
        except _aio.TimeoutError:
            logger.warning("MQTT connection timeout — running in simulator-only mode")
        except Exception as e:
            logger.warning("MQTT connection failed: %s — running in simulator-only mode", e)
    else:
        logger.info("MQTT skipped — no broker configured (simulated mode)")

    # 6. Load configurable thresholds from Supabase (non-fatal: uses defaults)
    try:
        from routers.seuils import load_thresholds_from_db
        load_thresholds_from_db()
    except Exception as e:
        logger.warning("Could not load thresholds from DB: %s — using defaults", e)

    # 7. Start scheduler
    from scheduler import start as start_scheduler
    start_scheduler()

    logger.info("PrediTeq API ready")
    yield

    # ── SHUTDOWN ──────────────────────────────────────────────────────────
    logger.info("Shutting down PrediTeq API ...")
    from scheduler import stop as stop_scheduler
    stop_scheduler()
    try:
        await mqtt.disconnect()
    except Exception:
        pass
    logger.info("Shutdown complete")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="PrediTeq API",
    description="Backend for PrediTeq predictive maintenance platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS (driven by CORS_ORIGINS env var) ────────────────────────────────────

from core.config import settings as _settings


def _expand_loopback_origins(origins: list[str]) -> list[str]:
    """Accept both localhost and 127.0.0.1 for local dev CORS.

    Frontend dev servers are often opened on either hostname. Treat them as
    equivalent so local browser requests do not fail before reaching FastAPI.
    """
    expanded: list[str] = []
    for origin in origins:
        if not origin:
            continue
        expanded.append(origin)
        if origin.startswith("http://localhost:"):
            expanded.append(origin.replace("http://localhost:", "http://127.0.0.1:", 1))
        elif origin.startswith("http://127.0.0.1:"):
            expanded.append(origin.replace("http://127.0.0.1:", "http://localhost:", 1))

    # preserve order while removing duplicates
    return list(dict.fromkeys(expanded))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_expand_loopback_origins(
        [o.strip() for o in _settings.CORS_ORIGINS.split(",") if o.strip()]
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ─── Security headers ─────────────────────────────────────────────────────────

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Only set HSTS in production (avoids locking localhost to HTTPS)
        host = request.headers.get("host", "")
        if "localhost" not in host and "127.0.0.1" not in host:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ─── Rate limiting (in-memory, per IP) ────────────────────────────────────────

import time
import asyncio as _rl_asyncio
from collections import defaultdict

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple per-IP rate limiting: 120 req/min for API, 10 req/min for auth."""

    def __init__(self, app):
        super().__init__(app)
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup = time.time()
        self._lock = _rl_asyncio.Lock()

    async def dispatch(self, request: Request, call_next):
        # Read X-Forwarded-For for correct IP behind Render's reverse proxy
        forwarded = request.headers.get("x-forwarded-for", "")
        ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
        path = request.url.path
        now = time.time()

        async with self._lock:
            # Periodic cleanup of stale keys (every 5 min)
            if now - self._last_cleanup > 300:
                stale = [k for k, v in self._hits.items() if not v or now - v[-1] > 120]
                for k in stale:
                    del self._hits[k]
                # Hard cap to prevent memory growth under DDoS — evict oldest entries
                if len(self._hits) > 5_000:
                    cutoff = now - 120
                    to_remove = [k for k, v in self._hits.items() if not v or v[-1] < cutoff]
                    for k in to_remove:
                        del self._hits[k]
                self._last_cleanup = now

            # Auth endpoints: stricter limit (10/min)
            if path.startswith("/auth"):
                limit, window = 10, 60
            else:
                limit, window = 120, 60

            segments = path.strip("/").split("/")
            key = f"{ip}:{segments[0] if segments else 'root'}"
            hits = self._hits[key]
            # Prune old entries
            self._hits[key] = [t for t in hits if now - t < window]
            if len(self._hits[key]) >= limit:
                return Response(
                    content='{"detail":"Too many requests"}',
                    status_code=429,
                    media_type="application/json",
                )
            self._hits[key].append(now)

        return await call_next(request)

app.add_middleware(RateLimitMiddleware)

# ─── Routers ──────────────────────────────────────────────────────────────────

from routers.health import router as health_router
from routers.auth import router as auth_router
from routers.machines import router as machines_router
from routers.alerts import router as alerts_router
from routers.report import router as report_router
from routers.seuils import router as seuils_router
from routers.explain import router as explain_router
from routers.simulator import router as simulator_router
from routers.chat import router as chat_router
from routers.planner import router as planner_router
from routers.diagnostics_rul import router as diagnostics_rul_router
from routers.runtime_data import router as runtime_data_router

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(machines_router)
app.include_router(alerts_router)
app.include_router(report_router)
app.include_router(seuils_router)
app.include_router(explain_router)
app.include_router(simulator_router)
app.include_router(chat_router)
app.include_router(planner_router)
app.include_router(diagnostics_rul_router)
app.include_router(runtime_data_router)
