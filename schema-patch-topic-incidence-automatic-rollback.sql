-- schema-patch-topic-incidence-automatic-rollback.sql
-- Restores the incidence numbers from before the switch and removes the automation.
-- The change log (topic_incidence_changes) and the backup are kept; drop them by hand once no longer needed.

BEGIN;

DROP TRIGGER IF EXISTS exam_questions_refresh_incidence ON exam_questions;
DROP TRIGGER IF EXISTS quiz_questions_refresh_incidence ON quiz_questions;
DROP TRIGGER IF EXISTS pages_refresh_incidence ON pages;
DROP TRIGGER IF EXISTS topics_incidence_enforce ON topics;

UPDATE topics t SET incidence_count = b.incidence_count, updated_at = now()
FROM topics_bk_incidence b
WHERE b.id = t.id AND t.incidence_count <> b.incidence_count;

DROP FUNCTION IF EXISTS refresh_topic_incidence_trg();
DROP FUNCTION IF EXISTS refresh_topic_incidence();
DROP FUNCTION IF EXISTS topics_incidence_enforce();
DROP FUNCTION IF EXISTS topic_incidence_count(bigint);
DROP FUNCTION IF EXISTS incidence_tier(int);

COMMENT ON COLUMN topics.incidence_count IS NULL;

COMMIT;
