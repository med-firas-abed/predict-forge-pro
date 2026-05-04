-- ═══════════════════════════════════════════════════════════════════════════
-- 006 — RUL v2 calibration metrics
-- Run in Supabase SQL Editor AFTER 005_integrity_fixes.sql
-- Safe to run multiple times (IF NOT EXISTS guards).
--
-- Adds 3 columns to `machines` to support the FPT-conditional RUL display
-- introduced in v2 of the diagnostics layer:
--   • power_avg_30j   — moyenne glissante 30 j de la puissance pendant les
--                        phases ascensionnelles (kW). Sert au calcul du L10
--                        ajusté ISO 281:2007 §7 (cube law on dynamic load).
--   • cycles_avg_7j   — moyenne glissante 7 j du nombre d'ascensions par jour
--                        (cycles/jour). Sert à la conversion sim-min → jours
--                        calendaires honnête, conditionnée sur l'usage réel
--                        observé. Ancrée sur la calibration originale du
--                        pipeline : 654 cycles/jour de référence (8 h/jour ×
--                        80 cycles/h, voir prediteq_ml/config.py ligne 132).
--   • metrics_updated — horodatage de la dernière mise à jour des deux
--                        précédentes (UTC). NULL = jamais calculé (machine
--                        fraîche, on tombera en mode fallback côté Python).
--
-- Toutes les colonnes sont NULLables : un nouveau code machine apparaît avec
-- power_avg_30j = NULL, ce qui est interprété par rul_calibration.py comme
-- « warm-up — utiliser P_nominal=1.51 kW et facteur ÷9 par défaut ».
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS power_avg_30j   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cycles_avg_7j   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS metrics_updated TIMESTAMPTZ;

-- Index léger sur metrics_updated pour permettre au scheduler de lister
-- rapidement les machines dont les métriques sont périmées (> 2 h sans maj).
CREATE INDEX IF NOT EXISTS idx_machines_metrics_updated
  ON machines (metrics_updated DESC NULLS LAST);

-- Note RLS : les colonnes ajoutées héritent automatiquement des policies
-- existantes sur `machines` (lecture authenticated, écriture service_role).
-- Pas de policy supplémentaire à créer.

-- Note de cohérence applicative :
-- Le scheduler FastAPI (prediteq_api/scheduler.py) écrit ces colonnes toutes
-- les heures via service_role. Le client frontend les lit de manière
-- transparente via les endpoints /machines existants — aucun changement
-- requis côté useMachines.ts pour exposer les nouvelles colonnes au DOM,
-- elles transitent désormais dans le payload /diagnostics/{code}/rul-v2.
