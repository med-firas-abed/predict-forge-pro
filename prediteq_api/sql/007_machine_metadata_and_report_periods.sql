-- Add machine metadata fields required by the frontend CRUD form
-- and align report periods with the 7/15/30-day product spec.

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS modele TEXT,
  ADD COLUMN IF NOT EXISTS etages INTEGER,
  ADD COLUMN IF NOT EXISTS emplacement TEXT;

UPDATE machines
SET
  modele = COALESCE(modele, 'SITI FC100L1-4'),
  etages = COALESCE(etages, 19),
  emplacement = COALESCE(emplacement, CONCAT('Region ', COALESCE(region, '')))
WHERE modele IS NULL
   OR etages IS NULL
   OR emplacement IS NULL;

ALTER TABLE rapports
  DROP CONSTRAINT IF EXISTS rapports_period_check;

ALTER TABLE rapports
  ADD CONSTRAINT rapports_period_check
  CHECK (period IN ('7d', '15d', '30d'));

ALTER TABLE rapports
  ALTER COLUMN period SET DEFAULT '7d';
