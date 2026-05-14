-- Remove leftover test machines so the fleet matches the intended state:
-- 3 demo machines (ASC-A1, ASC-B2, ASC-C3) + 1 real machine (ARO-01).
--
-- Safe to rerun: the target codes are deleted only if they still exist.

DELETE FROM machines
WHERE code IN ('LAB-01', 'sasa');
