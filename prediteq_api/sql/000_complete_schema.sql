-- ═══════════════════════════════════════════════════════════════════════════
-- PrediTeq — Complete Supabase Schema Migration
-- Run this ONCE in Supabase SQL Editor before deploying.
-- Creates all 11 tables, indexes, RLS policies, RPC functions, and seed data.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. machines ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS machines (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  nom          TEXT NOT NULL,
  region       TEXT NOT NULL DEFAULT '',
  latitude     DOUBLE PRECISION DEFAULT 0,
  longitude    DOUBLE PRECISION DEFAULT 0,
  modele       TEXT,
  etages       INTEGER,
  emplacement  TEXT,
  statut       TEXT NOT NULL DEFAULT 'operational'
                 CHECK (statut IN ('operational', 'degraded', 'critical', 'maintenance')),
  hi_courant   DOUBLE PRECISION DEFAULT 0.5 CHECK (hi_courant >= 0 AND hi_courant <= 1),
  rul_courant  INTEGER,
  derniere_maj TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machines_code ON machines (code);

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "machines_select_auth" ON machines FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "machines_update_service" ON machines FOR UPDATE
  TO service_role USING (true);
CREATE POLICY "machines_insert_service" ON machines FOR INSERT
  TO service_role WITH CHECK (true);


-- ─── 2. profiles (linked to auth.users) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  machine_id   UUID REFERENCES machines(id) ON DELETE SET NULL,
  approved_at  TIMESTAMPTZ,
  approved_by  UUID,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles (status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile; admins can read all
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'approved'
  ));
CREATE POLICY "profiles_update_service" ON profiles FOR UPDATE
  TO service_role USING (true);
CREATE POLICY "profiles_insert_service" ON profiles FOR INSERT
  TO service_role WITH CHECK (true);
-- Allow auth-triggered insert (for profile auto-creation)
-- SECURITY: restrict role to 'user' to prevent self-admin creation
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid() AND role = 'user');


-- ─── 3. alertes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alertes (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id   UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'hi' CHECK (type IN ('hi', 'cost', 'task')),
  titre        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  severite     TEXT NOT NULL DEFAULT 'info' CHECK (severite IN ('urgence', 'surveillance', 'info')),
  acquitte     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertes_machine ON alertes (machine_id);
CREATE INDEX IF NOT EXISTS idx_alertes_created ON alertes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertes_severite ON alertes (severite);
CREATE INDEX IF NOT EXISTS idx_alertes_acquitte ON alertes (acquitte);

ALTER TABLE alertes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertes_select_auth" ON alertes FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "alertes_update_auth" ON alertes FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'approved')
  );
CREATE POLICY "alertes_insert_service" ON alertes FOR INSERT
  TO service_role WITH CHECK (true);
-- Removed alertes_insert_auth — only service_role should insert alerts

-- Enable realtime for frontend subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE alertes;


-- ─── 4. historique_hi ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS historique_hi (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id   UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  valeur_hi    DOUBLE PRECISION NOT NULL CHECK (valeur_hi >= 0 AND valeur_hi <= 1),
  score_if     DOUBLE PRECISION,
  statut       TEXT CHECK (statut IN ('operational', 'degraded', 'critical')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hi_machine ON historique_hi (machine_id);
CREATE INDEX IF NOT EXISTS idx_hi_created ON historique_hi (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hi_machine_created ON historique_hi (machine_id, created_at DESC);

ALTER TABLE historique_hi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hi_select_auth" ON historique_hi FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "hi_insert_service" ON historique_hi FOR INSERT
  TO service_role WITH CHECK (true);


-- ─── 5. predictions_rul ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS predictions_rul (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id   UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  rul_jours    DOUBLE PRECISION NOT NULL,
  ic_bas       DOUBLE PRECISION,
  ic_haut      DOUBLE PRECISION,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rul_machine ON predictions_rul (machine_id);
CREATE INDEX IF NOT EXISTS idx_rul_created ON predictions_rul (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rul_machine_created ON predictions_rul (machine_id, created_at DESC);

ALTER TABLE predictions_rul ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rul_select_auth" ON predictions_rul FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "rul_insert_service" ON predictions_rul FOR INSERT
  TO service_role WITH CHECK (true);


-- ─── 6. gmao_taches ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gmao_taches (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id     UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  titre          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  statut         TEXT NOT NULL DEFAULT 'planifiee'
                   CHECK (statut IN ('planifiee', 'en_cours', 'terminee')),
  type           TEXT NOT NULL DEFAULT 'corrective'
                   CHECK (type IN ('preventive', 'corrective', 'inspection')),
  priorite       TEXT NOT NULL DEFAULT 'moyenne'
                   CHECK (priorite IN ('haute', 'moyenne', 'basse')),
  technicien     TEXT,
  date_planifiee DATE,
  cout_estime    DOUBLE PRECISION,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmao_machine ON gmao_taches (machine_id);
CREATE INDEX IF NOT EXISTS idx_gmao_statut ON gmao_taches (statut);
CREATE INDEX IF NOT EXISTS idx_gmao_date ON gmao_taches (date_planifiee);

ALTER TABLE gmao_taches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmao_select_auth" ON gmao_taches FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "gmao_insert_auth" ON gmao_taches FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "gmao_update_auth" ON gmao_taches FOR UPDATE
  TO authenticated USING (true);
CREATE POLICY "gmao_insert_service" ON gmao_taches FOR INSERT
  TO service_role WITH CHECK (true);
CREATE POLICY "gmao_delete_auth" ON gmao_taches FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'approved')
  );


-- ─── 7. couts ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS couts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id   UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  mois         INTEGER NOT NULL CHECK (mois >= 1 AND mois <= 12),
  annee        INTEGER NOT NULL CHECK (annee >= 2024),
  main_oeuvre  DOUBLE PRECISION NOT NULL DEFAULT 0,
  pieces       DOUBLE PRECISION NOT NULL DEFAULT 0,
  total        DOUBLE PRECISION GENERATED ALWAYS AS (main_oeuvre + pieces) STORED,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_couts_machine ON couts (machine_id);
CREATE INDEX IF NOT EXISTS idx_couts_date ON couts (annee DESC, mois DESC);

ALTER TABLE couts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "couts_select_auth" ON couts FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "couts_insert_service" ON couts FOR INSERT
  TO service_role WITH CHECK (true);
CREATE POLICY "couts_insert_auth" ON couts FOR INSERT
  TO authenticated WITH CHECK (true);


-- ─── 8. rapports ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rapports (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_code TEXT,
  period       TEXT NOT NULL DEFAULT '7d' CHECK (period IN ('7d', '15d', '30d')),
  lang         TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en', 'ar')),
  titre        TEXT NOT NULL,
  contenu      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rapports_created ON rapports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rapports_machine_code ON rapports (machine_code);

ALTER TABLE rapports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rapports_select_auth" ON rapports FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "rapports_insert_service" ON rapports FOR INSERT
  TO service_role WITH CHECK (true);
CREATE POLICY "rapports_insert_auth" ON rapports FOR INSERT
  TO authenticated WITH CHECK (true);


-- ─── 9. seuils ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seuils (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hi_critical           DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  hi_surveillance       DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  rul_critical_days     DOUBLE PRECISION NOT NULL DEFAULT 7,
  rul_surveillance_days DOUBLE PRECISION NOT NULL DEFAULT 30,
  manager_email         TEXT,
  technician_email      TEXT
);

ALTER TABLE seuils ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seuils_select_auth" ON seuils FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "seuils_select_anon" ON seuils FOR SELECT
  TO anon USING (true);
CREATE POLICY "seuils_update_service" ON seuils FOR UPDATE
  TO service_role USING (true);
CREATE POLICY "seuils_insert_service" ON seuils FOR INSERT
  TO service_role WITH CHECK (true);
-- NOTE: no FOR ALL auth policy — only service_role can update/insert seuils


-- ─── 10. email_logs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id      UUID REFERENCES machines(id) ON DELETE SET NULL,
  type            TEXT NOT NULL DEFAULT 'hi',
  recipient_email TEXT NOT NULL,
  success         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_machine ON email_logs (machine_id);
CREATE INDEX IF NOT EXISTS idx_email_created ON email_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_machine_type ON email_logs (machine_id, type, created_at DESC);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_select_service" ON email_logs FOR SELECT
  TO service_role USING (true);
CREATE POLICY "email_insert_service" ON email_logs FOR INSERT
  TO service_role WITH CHECK (true);


-- ─── 11. audit_logs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id    UUID,
  actor_email TEXT,
  action      TEXT NOT NULL,
  details     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_insert_service" ON audit_logs FOR INSERT
  TO service_role WITH CHECK (true);
CREATE POLICY "audit_select_admin" ON audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
  ));


-- ═══════════════════════════════════════════════════════════════════════════
-- RPC Functions
-- ═══════════════════════════════════════════════════════════════════════════

-- Email rate control: max 1 email per machine per 24h
CREATE OR REPLACE FUNCTION can_send_email(p_machine_id UUID, p_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_sent TIMESTAMPTZ;
BEGIN
  SELECT created_at INTO last_sent
  FROM email_logs
  WHERE machine_id = p_machine_id
    AND type = p_type
    AND success = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF last_sent IS NULL THEN
    RETURN true;
  END IF;

  RETURN (now() - last_sent) > INTERVAL '24 hours';
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Realtime — enable for tables that need frontend subscriptions
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE machines;
-- alertes already added above


-- ═══════════════════════════════════════════════════════════════════════════
-- Seed data — 3 machines per PFE specification
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO machines (code, nom, region, latitude, longitude, statut, hi_courant)
VALUES
  ('ASC-A1', 'Ascenseur A1 — Ben Arous', 'Ben Arous', 36.7333, 10.2167, 'operational', 0.98),
  ('ASC-B2', 'Ascenseur B2 — Sfax',      'Sfax',      34.7400, 10.7600, 'degraded',    0.48),
  ('ASC-C3', 'Ascenseur C3 — Sousse',     'Sousse',    35.8333, 10.6000, 'critical',    0.18)
ON CONFLICT (code) DO NOTHING;

-- Default thresholds (single row)
INSERT INTO seuils (hi_critical, hi_surveillance, rul_critical_days, rul_surveillance_days)
VALUES (0.3, 0.6, 7, 30)
ON CONFLICT DO NOTHING;
