-- 013 - repair or bootstrap public.audit_logs on live Supabase projects
-- Safe to run multiple times.
-- Run this when admin actions log:
--   "Could not find the table 'public.audit_logs' in the schema cache"

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    CREATE TABLE public.audit_logs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      actor_id UUID,
      actor_email TEXT,
      action TEXT NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
    );
  END IF;
END $$;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS actor_email TEXT,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc', now());

ALTER TABLE public.audit_logs
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN details SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());

CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs (action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_insert_service'
  ) THEN
    CREATE POLICY "audit_insert_service" ON public.audit_logs FOR INSERT
      TO service_role WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_select_admin'
  ) THEN
    CREATE POLICY "audit_select_admin" ON public.audit_logs FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role = 'admin'
            AND status = 'approved'
        )
      );
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO service_role;
