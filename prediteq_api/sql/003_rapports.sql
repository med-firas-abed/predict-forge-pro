-- ═══════════════════════════════════════════════════════════════════
-- Table: rapports — stores auto-generated weekly/monthly reports
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rapports (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_code TEXT,                         -- NULL = all machines
  period       TEXT NOT NULL DEFAULT 'weekly', -- 'weekly' | 'monthly'
  lang         TEXT NOT NULL DEFAULT 'fr',     -- 'fr' | 'en' | 'ar'
  titre        TEXT NOT NULL,
  contenu      TEXT NOT NULL,                  -- Markdown content
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Index for fast history queries
CREATE INDEX IF NOT EXISTS idx_rapports_created
  ON rapports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rapports_machine_code
  ON rapports (machine_code);

-- RLS: authenticated users can read, service role can insert
ALTER TABLE rapports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rapports_select_authenticated"
  ON rapports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "rapports_insert_service"
  ON rapports FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "rapports_insert_authenticated"
  ON rapports FOR INSERT
  TO authenticated
  WITH CHECK (true);
