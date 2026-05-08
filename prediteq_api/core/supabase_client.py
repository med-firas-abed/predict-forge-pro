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


def new_supabase_client() -> Client:
    """Create an isolated service-role client.

    Some auth flows, notably password sign-in, mutate the auth session held by
    the client object. The shared singleton must stay service-role scoped for
    admin operations and unrestricted DB reads, so session-oriented flows
    should use a fresh client instance instead.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_supabase() -> Client:
    if _client is None:
        raise RuntimeError("Supabase client not initialized — call init_supabase() first")
    return _client
