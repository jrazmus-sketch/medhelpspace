-- schema-patch-leads-previous-cohort.sql
--
-- Follow-up to schema-patch-retire-cohort-2026-2.sql (2026-07-11): that patch
-- reassigned the 15 still-nurturing 2026-2 leads to revalida-2027-1 so their
-- remaining drip emails sell a turma that's actually purchasable. Correct for the
-- drip — but it silently rewrote history: /admin/leads then showed "2027.1" for
-- leads who explicitly CHOSE 2026.2 in the funnel picker, with no trace of the
-- original choice. Justin flagged it: the panel must never misreport what the
-- lead actually picked.
--
-- Fix: a `previous_target_cohort` column that records the lead's ORIGINAL turma
-- the first time a reassignment overwrites it (null = never reassigned). The
-- admin panel renders "2026.2 → 2027.1" when it's set; bulkAssignCohort (the
-- admin bulk action) now populates it on first change too.
--
-- Backfill boundary (verified against prod before writing this patch):
--   * Before the retire patch there were ZERO leads on revalida-2027-1 — every
--     lead row was on 2026-2 (15 active + 1 converted).
--   * After it, all 15 leads on 2027-1 have created_at < 2026-07-11 14:00 UTC
--     and none were created after.
--   So "on 2027-1 AND created before the patch" identifies the reassigned set
--   exactly. 7 of the 15 completed the funnel picker (truly chose 2026.2); the
--   other 8 carried the old column default — the panel only displays a turma for
--   completed leads, so recording all 15 is safe and only the 7 render the arrow.
--
-- Idempotent — safe to re-run. Apply with:
--   node scripts/run-sql.js schema-patch-leads-previous-cohort.sql
--
-- Rollback:
--   ALTER TABLE leads DROP COLUMN IF EXISTS previous_target_cohort;
--   (and revert the code changes in the same commit)
--
-- NOTE: run-sql.js wraps the whole file in one transaction (atomic all-or-nothing),
-- so no explicit BEGIN/COMMIT here.

-- 1) The history column. Nullable: null = the lead's target_cohort is still
--    whatever they chose (or defaulted to) in the funnel.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS previous_target_cohort TEXT;

-- 2) Same domain as leads_target_cohort_check, plus NULL (typed, idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_previous_target_cohort_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_previous_target_cohort_check
      CHECK (previous_target_cohort IS NULL OR previous_target_cohort IN
             ('revalida-2026-2', 'revalida-2027-1', 'revalida-20272', 'undecided'));
  END IF;
END $$;

-- 3) Backfill the 15 leads the retire patch moved off 2026-2 (see boundary
--    reasoning above). Guarded so a re-run — or a run after new organic 2027-1
--    leads exist — can never mislabel anyone.
UPDATE leads
SET previous_target_cohort = 'revalida-2026-2'
WHERE target_cohort = 'revalida-2027-1'
  AND previous_target_cohort IS NULL
  AND created_at < '2026-07-11T14:00:00Z';

-- Post-apply sanity check (read-only):
--   SELECT target_cohort, previous_target_cohort, count(*),
--          count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed
--   FROM leads GROUP BY 1,2;
--   -- expect: 15 rows 2027-1/2026-2 (7 completed), 1 row 2026-2/NULL.
