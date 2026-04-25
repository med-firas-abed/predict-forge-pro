import logging
from supabase import create_client, Client
from core.config import settings

logger = logging.getLogger(__name__)

_client: Client | None = None


def init_supabase() -> Client:
    global _client
    _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    logger.info("Supabase client initialized")
    return _client


def get_supabase() -> Client:
    if _client is None:
        raise RuntimeError("Supabase client not initialized — call init_supabase() first")
    return _client
