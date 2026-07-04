-- Backfill: reconstruct questions_answered / completed_at for leads that finished
-- the free simulado BEFORE those columns existed. The v1 funnel wrote score +
-- result; the v2 patch (schema-patch-leads-verify-claim.sql, 2026-06-30) added
-- questions_answered / completed_at. So a v1 finisher has a full 15-answer `result`
-- but null questions_answered, and /admin/leads renders them as a misleading 0/15.
--
-- Reconstruct from the stored `result` JSON (the ground truth of what they answered):
--   • questions_answered = number of answers actually stored
--   • completed_at       = set ONLY when the result holds the full 15 (a genuine
--                          finish). We have no true finish time, so use created_at
--                          as the best-available proxy; a short/partial result stays
--                          incomplete (completed_at left null).
--
-- Scope guard: only rows WITH a result AND null questions_answered — i.e. exactly
-- the pre-column finishers. Post-fix partial leads already carry questions_answered,
-- so incremental-save rows are untouched. Idempotent: after this runs those rows
-- are no longer null, so a re-run matches nothing. As of 2026-07-03 this affects a
-- single row (nina.brandao — result_len 15, score 7 → 15/15, Hot).
--
-- Run with: node scripts/run-sql.js backfill-leads-progress-from-result.sql
-- Rollback (manual, if ever needed): the affected rows can be re-nulled by
--   UPDATE leads SET questions_answered = NULL, completed_at = NULL WHERE ...

UPDATE leads
SET questions_answered = jsonb_array_length(result),
    completed_at = CASE
      WHEN completed_at IS NOT NULL         THEN completed_at
      WHEN jsonb_array_length(result) >= 15 THEN created_at
      ELSE NULL
    END
WHERE result IS NOT NULL
  AND questions_answered IS NULL;
