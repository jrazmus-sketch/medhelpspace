-- schema-patch-leads-fc-entered-at.sql
--
-- Finishes the job started by schema-patch-leads-sim-entered-at.sql (2026-07-26).
--
-- PART 1 — the same cross-funnel bug, in the flashcards funnel.
--
-- flashcards-drip selects on `source = 'flashcards-50'`. `leads.source` is
-- FIRST-TOUCH and deliberately never overwritten, so a lead captured by another
-- magnet who later claims the 50-card deck keeps their original source and is
-- invisible to the flashcards sequence forever. Verified in prod: 2 rows
-- (brandao.karinaa@gmail.com, nynabrandao@gmail.com) both completed the deck under
-- source='simulado-honesto' and never received a single flashcards email.
--
-- chooseFlashcardsCohortAndSend also stamped `completed_at = now` unconditionally,
-- exactly as startSimulado used to. Prod shows the damage: nynabrandao's
-- completed_at was 2026-07-08 (her real flashcards clock) until she started the
-- simulado on 2026-07-26, which overwrote it. LEAST() below recovers the true value
-- from fc_started_at.
--
-- Remedy mirrors the simulado fix exactly:
--   fc_entered_at — when this lead entered the FLASHCARDS funnel. Set once, never
--                   overwritten. Replaces `source` as the membership test and
--                   `completed_at` as the clock.
--
-- PART 2 — the collision that a naive Part 1 would have created.
--
-- With sim_entered_at AND fc_entered_at both able to be set on one row, and BOTH
-- crons owning the single `drip_step` column, a lead in two funnels gets claimed
-- twice: two sequences interleaved in one inbox, each corrupting the other's step
-- counter. This is not hypothetical — nynabrandao@gmail.com has both footprints
-- and would have been claimed by both crons the moment Part 1 landed.
--
-- The `.neq(source, ...)` chains the crons use today are the same shape of guard
-- and fail the same way. So ownership becomes explicit and single-valued:
--
--   drip_funnel — which sequence owns drip_step RIGHT NOW. Exactly one value per
--                 lead. Each cron filters on it; overlap is impossible by
--                 construction rather than by keeping four negative filters in sync.
--
-- Ownership rule: THE MOST RECENTLY ENTERED FUNNEL WINS — that is where the
-- candidate's attention is. Handover is clean because the entry points reset the
-- step counters whenever drip_funnel changes, so the new sequence always starts at
-- rung 0 instead of resuming at a rung that meant something in the old ladder.
--
-- Idempotent — safe to re-run. Apply to BOTH databases:
--   prod:  node scripts/run-sql.js schema-patch-leads-fc-entered-at.sql
--   local: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
--            node scripts/run-sql.js schema-patch-leads-fc-entered-at.sql
-- After the local run: NOTIFY pgrst, 'reload schema'.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS leads_fc_entered_idx;
--   DROP INDEX IF EXISTS leads_drip_funnel_idx;
--   ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_drip_funnel_check;
--   ALTER TABLE leads DROP COLUMN IF EXISTS drip_funnel;
--   ALTER TABLE leads DROP COLUMN IF EXISTS fc_entered_at;
--   (and revert the code changes in the same commit)
--
-- NOTE: run-sql.js wraps the whole file in one transaction, so no BEGIN/COMMIT.

-- ── Part 1: the flashcards clock ──────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS fc_entered_at TIMESTAMPTZ;

COMMENT ON COLUMN leads.fc_entered_at IS
  'When this lead entered the 50-card flashcards funnel (turma chosen, access link sent). The flashcards-drip cron''s clock — deliberately NOT leads.source, which is first-touch and stays pointing at whichever funnel captured the address first. Mirrors leads.sim_entered_at.';

-- LEAST() ignores NULLs, so this yields the earlier of the two when both exist and
-- the non-null one otherwise. Critically, it also REPAIRS rows whose completed_at
-- was clobbered by a later funnel: fc_started_at still holds the true entry moment.
UPDATE leads
SET fc_entered_at = LEAST(completed_at, fc_started_at)
WHERE fc_entered_at IS NULL
  AND (
    source = 'flashcards-50'
    OR fc_started_at IS NOT NULL
    OR fc_completed_at IS NOT NULL
    OR fc_progress IS NOT NULL
  )
  AND COALESCE(completed_at, fc_started_at) IS NOT NULL;

-- ── Part 2: single-valued drip ownership ──────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS drip_funnel TEXT NOT NULL DEFAULT 'quiz';

COMMENT ON COLUMN leads.drip_funnel IS
  'Which email sequence currently owns leads.drip_step: quiz | simulado | flashcards. Exactly one. Set at funnel entry (the most recently entered funnel wins), and the entry point resets drip_step + the per-funnel step counters whenever this changes, so the new ladder starts at rung 0. Each drip cron filters on this instead of maintaining negative source filters that silently fail for cross-funnel leads.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_drip_funnel_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_drip_funnel_check
      CHECK (drip_funnel IN ('quiz', 'simulado', 'flashcards'));
  END IF;
END $$;

-- Backfill ownership from the entry timestamps: most recent entry wins, quiz is the
-- floor (it is the original funnel and has no entry stamp of its own). Guarded so a
-- re-run cannot yank a lead out of the sequence it is mid-way through.
UPDATE leads
SET drip_funnel = CASE
      WHEN sim_entered_at IS NOT NULL
       AND (fc_entered_at IS NULL OR sim_entered_at >= fc_entered_at) THEN 'simulado'
      WHEN fc_entered_at IS NOT NULL                                  THEN 'flashcards'
      ELSE 'quiz'
    END
WHERE drip_funnel = 'quiz'   -- i.e. still at the column default; never re-assign
  AND (sim_entered_at IS NOT NULL OR fc_entered_at IS NOT NULL);

-- A lead newly ADOPTED by the flashcards sequence carries a drip_step from whichever
-- ladder set it (one prod row sits at step 5 of the quiz drip). The flashcards ladder
-- has only 2 rungs, so `drip_step < 2` would silently exclude them forever. Reset so
-- they enter at the top. Natively-flashcards rows already have correct counters and
-- are left alone.
UPDATE leads
SET drip_step = 0
WHERE drip_funnel = 'flashcards'
  AND source <> 'flashcards-50'
  AND drip_step <> 0;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS leads_fc_entered_idx
  ON leads (fc_entered_at)
  WHERE fc_entered_at IS NOT NULL AND drip_status = 'active';

-- Every drip cron now leads with (drip_funnel, drip_status).
CREATE INDEX IF NOT EXISTS leads_drip_funnel_idx
  ON leads (drip_funnel, drip_status);

-- Post-apply sanity checks (read-only):
--   SELECT drip_funnel, count(*) FROM leads GROUP BY 1;
--   -- expect quiz to still hold the bulk, simulado 3, flashcards 16.
--   SELECT count(*) FROM leads
--     WHERE sim_entered_at IS NOT NULL AND fc_entered_at IS NOT NULL;
--   -- these are the dual-funnel rows; each must have exactly ONE drip_funnel value.
--   SELECT email, source, drip_funnel, drip_step, sim_entered_at, fc_entered_at
--     FROM leads WHERE fc_entered_at IS NOT NULL ORDER BY fc_entered_at;
