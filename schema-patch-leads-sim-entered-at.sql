-- schema-patch-leads-sim-entered-at.sql
--
-- Fixes the cross-funnel bug Karina's testing exposed on 2026-07-26.
--
-- WHAT WENT WRONG:
-- `leads.source` is FIRST-TOUCH and is deliberately never overwritten. So when an
-- address that had already been captured by another funnel came back and did the
-- 100-question simulado, startSimulado updated the existing row and left
-- source = 'simulado-honesto'. Two real completions (one of them 99 answered and
-- SUBMITTED) ended up filed under the old quiz funnel.
--
-- Because simulado-drip selected on `source = 'simulado-100'`, it could never see
-- them: they did the whole exam and were guaranteed zero simulado follow-up. They
-- also stayed eligible for the WRONG sequence — lead-drip excludes
-- source='simulado-100', and these rows were not that.
--
-- THE FIX IS NOT TO OVERWRITE `source`. That would destroy acquisition
-- attribution, which is the entire point of first-touch. Instead the funnel gets
-- its own clock and its own membership test:
--
--   sim_entered_at  — when this lead entered the SIMULADO funnel (the moment they
--                     submitted the start form). Set once, never overwritten.
--                     Replaces `source` as the drip's membership test and replaces
--                     `completed_at` as its clock.
--
-- Two things this also repairs:
--
--   * startSimulado used to stamp `completed_at = now` on every start, including
--     on a lead that belonged to another funnel — silently resetting THAT funnel's
--     drip clock. It now only fills `completed_at` when it is still null.
--   * A cross-funnel lead arrives with a `drip_step` from the other sequence. The
--     simulado ladder would have resumed at that rung and skipped straight into
--     the sales spine, past every finish nudge. startSimulado now resets the three
--     step counters when a lead enters the simulado for the first time — the
--     simulado takes ownership of drip_step from the top.
--
-- BACKFILL: LEAST() ignores NULLs in Postgres, so LEAST(completed_at,
-- sim_started_at) yields the earlier of the two when both exist and the non-null
-- one otherwise — the closest thing to "when the simulado began" that the existing
-- data holds.
--
-- STILL OPEN (not fixed here): the flashcards funnel has the identical shape —
-- flashcards-drip selects on source = 'flashcards-50', so a lead who first arrived
-- via another magnet and then claimed the deck is invisible to it in exactly the
-- same way. Same remedy (a fc_entered_at clock); deliberately not bundled.
--
-- Idempotent — safe to re-run. Apply to BOTH databases:
--   prod:  node scripts/run-sql.js schema-patch-leads-sim-entered-at.sql
--   local: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
--            node scripts/run-sql.js schema-patch-leads-sim-entered-at.sql
-- After the local run: NOTIFY pgrst, 'reload schema'.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS leads_sim_entered_idx;
--   ALTER TABLE leads DROP COLUMN IF EXISTS sim_entered_at;
--   (and revert the code changes in the same commit)
--
-- NOTE: run-sql.js wraps the whole file in one transaction (atomic all-or-nothing),
-- so no explicit BEGIN/COMMIT here.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sim_entered_at TIMESTAMPTZ;

COMMENT ON COLUMN leads.sim_entered_at IS
  'When this lead entered the 100-question simulado funnel (start form submitted). The simulado-drip cron''s membership test AND its clock — deliberately NOT leads.source, which is first-touch and stays pointing at whichever funnel captured the address first.';

-- Backfill every lead with any simulado footprint, whatever their `source` says.
--
-- The step counters are reset for CROSS-FUNNEL rows only. Those carry a drip_step
-- from the sequence that captured them (one of the affected leads is sitting at
-- step 5 of the quiz drip), and the simulado ladder has 8 rungs — so without this
-- they would resume at rung 6, skip every finish nudge, and land straight in the
-- middle of the sales spine. Natively-simulado rows already have correct counters
-- and are left alone. Guarded by `sim_entered_at IS NULL`, so a re-run is a no-op
-- and can never wipe the progress of a lead already in the sequence.
UPDATE leads
SET sim_entered_at = LEAST(completed_at, sim_started_at),
    drip_step         = CASE WHEN source <> 'simulado-100' THEN 0 ELSE drip_step END,
    sim_reminder_step = CASE WHEN source <> 'simulado-100' THEN 0 ELSE sim_reminder_step END,
    sim_sales_step    = CASE WHEN source <> 'simulado-100' THEN 0 ELSE sim_sales_step END
WHERE sim_entered_at IS NULL
  AND (
    source = 'simulado-100'
    OR sim_started_at IS NOT NULL
    OR sim_set_version IS NOT NULL
    OR sim_completed_at IS NOT NULL
  )
  AND COALESCE(completed_at, sim_started_at) IS NOT NULL;

-- Supports the simulado-drip scan (was: an index on completed_at filtered by source).
CREATE INDEX IF NOT EXISTS leads_sim_entered_idx
  ON leads (sim_entered_at)
  WHERE sim_entered_at IS NOT NULL AND drip_status = 'active';

-- Post-apply sanity check (read-only):
--   SELECT email, source, sim_entered_at, completed_at, sim_started_at, sim_answered
--     FROM leads WHERE sim_entered_at IS NOT NULL ORDER BY sim_entered_at;
--   -- expect the two cross-funnel rows (source='simulado-honesto') to appear here.
--   SELECT count(*) FROM leads WHERE sim_entered_at IS NULL AND source = 'simulado-100';
--   -- expect 0.
