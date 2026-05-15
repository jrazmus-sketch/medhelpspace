-- schema-patch-003-specialty-groups.sql
--
-- Adds group_label to specialties so track hub pages can section-group them
-- by Revalida exam area (Clínica Médica vs. standalone areas).
--
-- Clínica Médica (display_order 1–12) share a group label.
-- The 5 standalone areas (13–17) have no group_label; they use their own name.

BEGIN;

ALTER TABLE specialties ADD COLUMN IF NOT EXISTS group_label TEXT;

UPDATE specialties
SET group_label = 'Clínica Médica'
WHERE display_order BETWEEN 1 AND 12;

-- Verify
SELECT slug, name, display_order, group_label FROM specialties ORDER BY display_order;

COMMIT;
