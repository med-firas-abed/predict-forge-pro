-- Reserve the Ben Arous position for the real Aroteq machine and move the
-- ASC-A1 demo machine to another northern site without changing its health
-- profile.

UPDATE machines
SET
  region = 'Bizerte',
  latitude = 37.2744,
  longitude = 9.8739,
  emplacement = 'Site Nord - Bizerte',
  derniere_maj = timezone('utc', now())
WHERE code = 'ASC-A1';

INSERT INTO machines (
  code,
  nom,
  region,
  latitude,
  longitude,
  emplacement,
  statut,
  hi_courant,
  rul_courant,
  derniere_maj
)
VALUES (
  'ARO-01',
  'Machine reelle',
  'Ben Arous',
  36.7538,
  10.2271,
  'Usine Aroteq - Ben Arous',
  'operational',
  1.0,
  NULL,
  timezone('utc', now())
)
ON CONFLICT (code) DO UPDATE
SET
  nom = EXCLUDED.nom,
  region = EXCLUDED.region,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  emplacement = EXCLUDED.emplacement,
  derniere_maj = EXCLUDED.derniere_maj;
