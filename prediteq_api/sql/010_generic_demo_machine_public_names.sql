-- Keep internal demo codes for routing/MQTT while making the public names
-- generic in the UI and database.

UPDATE machines
SET
  nom = CASE code
    WHEN 'ASC-A1' THEN 'Machine 1'
    WHEN 'ASC-B2' THEN 'Machine 2'
    WHEN 'ASC-C3' THEN 'Machine 3'
    ELSE nom
  END,
  derniere_maj = timezone('utc', now())
WHERE code IN ('ASC-A1', 'ASC-B2', 'ASC-C3');
