# prediteq_api/core

This folder contains the backend building blocks that are reused everywhere.

## File map

- `auth.py` - authenticated user extraction and role checks
- `config.py` - environment variables and shared settings
- `decision_snapshot.py` - human-readable decision summaries built from machine state
- `email_client.py` - SMTP email sending
- `email_history.py` - local email event history
- `supabase_client.py` - shared Supabase client bootstrap
- `audit.py` - audit helpers
- `rate_limit.py` - shared rate-limit utilities if used by routes

## Open this folder when the question is

- "where does the backend read its environment?" -> `config.py`
- "where is auth handled?" -> `auth.py`
- "where do emails leave the system?" -> `email_client.py`
- "where is DB connection initialized?" -> `supabase_client.py`
