-- ClinAct — spaced review (rule FROZEN by Karina 2026-08-31).
--
-- Reuses the Revalida `review_schedule` table (built generic on purpose) by
-- allowing a fourth item_type: 'clinact_case', where item_id = clinact_cases.id.
--
-- The ClinAct scheduling is NOT SM-2. Fixed pairs, chosen by the FIRST
-- completed attempt's outcome, second interval counted FROM review 1:
--   · erro com alta confiança → +3d, then +14d after review 1
--   · score < 60%             → +7d, then +21d
--   · otherwise               → +14d, then +30d
-- Max 2 automatic reviews, then the row is suspended forever. A voluntary
-- "Refazer" before the due date never advances or restarts the sequence.
-- Column mapping: interval_days = the CURRENT interval (3/7/14 first, then
-- 14/21/30), repetitions = reviews completed (0..2), suspended = done.
--
-- The Revalida side (/app/revisao, study plan, lifecycle cron) is scoped to
-- its own three item types in app code in the same commit — the two products
-- share the table, never the queue.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-review.sql                  # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-review.sql                # local
--
-- Rollback:
--   DELETE FROM review_schedule WHERE item_type = 'clinact_case';
--   ALTER TABLE review_schedule DROP CONSTRAINT review_schedule_item_type_check;
--   ALTER TABLE review_schedule ADD CONSTRAINT review_schedule_item_type_check
--     CHECK (item_type IN ('flashcard', 'quiz_question', 'memorecard'));

BEGIN;

ALTER TABLE review_schedule DROP CONSTRAINT IF EXISTS review_schedule_item_type_check;
ALTER TABLE review_schedule ADD CONSTRAINT review_schedule_item_type_check
  CHECK (item_type IN ('flashcard', 'quiz_question', 'memorecard', 'clinact_case'));

COMMIT;
