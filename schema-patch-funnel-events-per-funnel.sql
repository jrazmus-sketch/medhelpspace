-- schema-patch-funnel-events-per-funnel.sql
-- Per-funnel attribution for the top-of-funnel beacons. funnel_events had no
-- funnel column, so every landing/quiz_start was implicitly "the quiz funnel"
-- (/questoes-revalida). The flashcards (/flashcards-revalida) and Simulado-100Q
-- (/simulado-revalida) landing pages ALSO fire the landing beacon, so their
-- visits have been silently counted against the quiz funnel's Landed number,
-- and the flashcards/simulado tabs on /admin/leads show "—" for Landed/Started.
--
-- Fix: tag each event with the funnel it belongs to, matching leads.source
-- ('simulado-honesto' | 'flashcards-50' | 'simulado-100') so the dashboard can
-- join events↔leads per funnel. Existing rows default to 'simulado-honesto' —
-- historical events can't be re-attributed (no funnel was recorded), the same
-- honest caveat as internal-traffic and go-live cutoffs.
--
-- The unique dedup index widens to include funnel: one browser session that
-- visits two funnels reuses the same session_id, so without funnel in the key
-- the second funnel's landing would collide and be dropped.
--
-- Run with: node scripts/run-sql.js schema-patch-funnel-events-per-funnel.sql

ALTER TABLE funnel_events
  ADD COLUMN IF NOT EXISTS funnel TEXT NOT NULL DEFAULT 'simulado-honesto';

-- Domain guard (typed, idempotent) — mirrors leads.source values.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funnel_events_funnel_check') THEN
    ALTER TABLE funnel_events ADD CONSTRAINT funnel_events_funnel_check
      CHECK (funnel IN ('simulado-honesto', 'flashcards-50', 'simulado-100'));
  END IF;
END $$;

-- Widen dedup to (session_id, event_type, funnel): a session that visits more
-- than one funnel must record one landing per funnel, not just the first.
DROP INDEX IF EXISTS funnel_events_session_type_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS funnel_events_session_type_funnel_uniq
  ON funnel_events (session_id, event_type, funnel);

-- Drives the admin funnel aggregation when scoped to one funnel tab.
CREATE INDEX IF NOT EXISTS funnel_events_funnel_type_created_idx
  ON funnel_events (funnel, event_type, created_at);

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS funnel_events_funnel_type_created_idx;
-- DROP INDEX IF EXISTS funnel_events_session_type_funnel_uniq;
-- CREATE UNIQUE INDEX funnel_events_session_type_uniq ON funnel_events (session_id, event_type);
-- ALTER TABLE funnel_events DROP CONSTRAINT IF EXISTS funnel_events_funnel_check;
-- ALTER TABLE funnel_events DROP COLUMN IF EXISTS funnel;
