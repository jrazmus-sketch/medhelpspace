-- schema-patch-memorecard-reread-60d.sql
--
-- MemoreCards re-read cadence (Karina, 2026-09-23): 7 → 21 → 60 → 120 days was too
-- spread out for MedHelp 60D, which opens 60 days before the exam. The app now uses
-- 3 → 7 → 14 → 30 (lib/review/memorecard-reread.ts) and never schedules a re-read on
-- or after the student's exam (it moves to the day before).
--
-- This re-times the re-reads ALREADY scheduled under the old cadence, with the same
-- rule: step = new interval for the repetition count, counted from the day of the
-- last reading (Brasília), capped at the day before the earliest upcoming exam of
-- the student's turma. Also re-seeds the onboarding tip line. Data only, no DDL. Idempotent (re-running recomputes the
-- same values).
--
-- Rollback: not needed for correctness — the old values were a stricter subset of
-- "later". If ever required: UPDATE ... SET interval_days = (ARRAY[7,21,60,120])[...]
-- with the same shape.

BEGIN;

WITH exam AS (
  SELECT m.user_id, MIN(c.test_date) AS test_date
  FROM user_cohort_memberships m
  JOIN cohorts c ON c.id = m.cohort_id
  WHERE c.test_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date
  GROUP BY m.user_id
),
calc AS (
  SELECT rs.user_id, rs.item_id,
         (ARRAY[3, 7, 14, 30])[LEAST(GREATEST(rs.repetitions, 1), 4)] AS step,
         (rs.last_reviewed_at AT TIME ZONE 'America/Sao_Paulo')::date AS read_on,
         e.test_date
  FROM review_schedule rs
  LEFT JOIN exam e ON e.user_id = rs.user_id
  WHERE rs.item_type = 'memorecard'
    AND rs.last_reviewed_at IS NOT NULL
),
fin AS (
  SELECT user_id, item_id,
         CASE
           WHEN test_date IS NOT NULL
            AND read_on + step > test_date - 1
            AND test_date - 1 > read_on
           THEN test_date - 1
           ELSE read_on + step
         END AS due,
         read_on
  FROM calc
)
UPDATE review_schedule rs
   SET due_date      = fin.due,
       interval_days = fin.due - fin.read_on
  FROM fin
 WHERE rs.user_id = fin.user_id
   AND rs.item_type = 'memorecard'
   AND rs.item_id = fin.item_id;

-- The onboarding tip quoted the old cadence. It still held the text seeded by
-- schema-patch-onboarding-memorecards-v2.sql (checked), so DO UPDATE is safe.
INSERT INTO site_content (key, value) VALUES
  ('onboarding.memorecards.review', 'Ao terminar um tema, ele entra num ciclo de **releitura espaçada** na Revisão (em 3, 7, 14 e 30 dias), sempre antes da data da sua prova.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;
