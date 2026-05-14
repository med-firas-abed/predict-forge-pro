-- 012 - explicit grants for Supabase Data API exposure
-- Safe to run multiple times.
-- Run this on the live project before October 30, 2026.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.machines') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.machines TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.machines TO service_role';
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.profiles TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role';
  END IF;

  IF to_regclass('public.alertes') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, UPDATE ON TABLE public.alertes TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.alertes TO service_role';
  END IF;

  IF to_regclass('public.historique_hi') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.historique_hi TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.historique_hi TO service_role';
  END IF;

  IF to_regclass('public.predictions_rul') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.predictions_rul TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.predictions_rul TO service_role';
  END IF;

  IF to_regclass('public.gmao_taches') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gmao_taches TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gmao_taches TO service_role';
  END IF;

  IF to_regclass('public.couts') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.couts TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.couts TO service_role';
  END IF;

  IF to_regclass('public.rapports') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.rapports TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rapports TO service_role';
  END IF;

  IF to_regclass('public.seuils') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.seuils TO anon';
    EXECUTE 'GRANT SELECT ON TABLE public.seuils TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.seuils TO service_role';
  END IF;

  IF to_regclass('public.email_logs') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_logs TO service_role';
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.audit_logs TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO service_role';
  END IF;

  IF to_regprocedure('public.can_send_email(uuid,text)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.can_send_email(UUID, TEXT) TO service_role';
  END IF;
END $$;
