-- 008 - add email recipients to seuils
-- Safe to run multiple times.

ALTER TABLE IF EXISTS seuils
  ADD COLUMN IF NOT EXISTS manager_email TEXT;

ALTER TABLE IF EXISTS seuils
  ADD COLUMN IF NOT EXISTS technician_email TEXT;
