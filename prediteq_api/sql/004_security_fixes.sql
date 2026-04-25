-- ═══════════════════════════════════════════════════════════════════════════
-- PrediTeq — Security & Performance Migration (April 16, 2026)
-- Run this in Supabase SQL Editor on EXISTING databases.
-- Safe to re-run (uses IF EXISTS / IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Remove overly permissive seuils policy ──────────────────────────────
-- Was: FOR ALL to authenticated → any user could DELETE/UPDATE thresholds
DROP POLICY IF EXISTS "seuils_upsert_auth" ON seuils;

-- ─── 2. Restrict alertes_update to admins only ──────────────────────────────
DROP POLICY IF EXISTS "alertes_update_auth" ON alertes;
CREATE POLICY "alertes_update_auth" ON alertes FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'approved')
  );

-- ─── 3. Remove alertes_insert_auth — only service_role inserts alerts ────────
DROP POLICY IF EXISTS "alertes_insert_auth" ON alertes;

-- ─── 4. Restrict gmao_delete to admins only ─────────────────────────────────
DROP POLICY IF EXISTS "gmao_delete_auth" ON gmao_taches;
CREATE POLICY "gmao_delete_auth" ON gmao_taches FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'approved')
  );

-- ─── 5. Add missing performance indexes ─────────────────────────────────────
-- Wrapped in DO blocks so each index is independent — one failure won't block the rest.

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_hi_machine_created ON historique_hi (machine_id, created_at DESC);
EXCEPTION WHEN undefined_column THEN RAISE NOTICE 'historique_hi.created_at not found — skipping index'; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_rul_machine_created ON predictions_rul (machine_id, created_at DESC);
EXCEPTION WHEN undefined_column THEN RAISE NOTICE 'predictions_rul.created_at not found — skipping index'; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alertes_acquitte ON alertes (acquitte);
EXCEPTION WHEN undefined_column THEN RAISE NOTICE 'alertes.acquitte not found — skipping index'; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_email_machine_type ON email_logs (machine_id, type, created_at DESC);
EXCEPTION WHEN undefined_column THEN RAISE NOTICE 'email_logs column not found — skipping index'; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_id);
EXCEPTION WHEN undefined_column OR undefined_table THEN RAISE NOTICE 'audit_logs not ready — skipping index'; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
EXCEPTION WHEN undefined_column OR undefined_table THEN RAISE NOTICE 'audit_logs not ready — skipping index'; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gmao_date ON gmao_taches (date_planifiee);
EXCEPTION WHEN undefined_column THEN RAISE NOTICE 'gmao_taches.date_planifiee not found — skipping index'; END $$;
