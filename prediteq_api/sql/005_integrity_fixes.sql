-- ═══════════════════════════════════════════════════════════════════════════
-- 005 — Integrity & security fixes
-- Run in Supabase SQL Editor AFTER 004_security_fixes.sql
-- Safe to run multiple times (IF NOT EXISTS / DO $$ guards).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. couts: UNIQUE constraint on (machine_id, mois, annee) ───────────────
-- Prevents duplicate cost entries for the same machine/month/year.
CREATE UNIQUE INDEX IF NOT EXISTS idx_couts_unique
  ON couts (machine_id, mois, annee);


-- ─── 2. rapports: FK on machine_code → machines(code) ──────────────────────
-- Ensures referential integrity; orphaned reports are cleaned on delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_rapports_machine_code'
      AND table_name = 'rapports'
  ) THEN
    ALTER TABLE rapports
      ADD CONSTRAINT fk_rapports_machine_code
      FOREIGN KEY (machine_code)
      REFERENCES machines(code)
      ON DELETE CASCADE;
  END IF;
END $$;


-- ─── 3. gmao_taches: tighten INSERT policy to admin-only ───────────────────
-- Currently any authenticated user can create tasks for any machine.
-- Replace with admin-or-machine-owner check.
DROP POLICY IF EXISTS "gmao_insert_auth" ON gmao_taches;

CREATE POLICY "gmao_insert_auth" ON gmao_taches FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND status = 'approved'
        AND (role = 'admin' OR machine_id = gmao_taches.machine_id)
    )
  );


-- ─── 4. Missing composite indexes for scheduler/dashboard queries ───────────
CREATE INDEX IF NOT EXISTS idx_alertes_type_created
  ON alertes (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gmao_date_statut
  ON gmao_taches (date_planifiee, statut);
