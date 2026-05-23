-- One-off rollback so we can re-apply with the heading fix.
BEGIN;
DELETE FROM quiz_questions WHERE page_id = 3884;
UPDATE pages SET type = 'text-lesson' WHERE id = 3884;
SELECT id, slug, type FROM pages WHERE id = 3884;
SELECT count(*) AS remaining_quiz_rows FROM quiz_questions WHERE page_id = 3884;
COMMIT;
