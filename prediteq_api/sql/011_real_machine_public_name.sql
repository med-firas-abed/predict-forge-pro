-- Keep the real Ben Arous machine generic in the public UI while preserving
-- its internal code for MQTT and backend routing.

UPDATE machines
SET
  nom = 'Machine reelle',
  derniere_maj = timezone('utc', now())
WHERE code = 'ARO-01';
