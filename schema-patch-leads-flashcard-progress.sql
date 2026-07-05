-- Flashcards funnel v2 — durable study progress on the 50-card deck.
--
-- The /flashcards-revalida/acesso session was client-only (reset on reload). These
-- columns persist per-lead progress so the SAME magic link resumes where they left
-- off, and so the flashcards-drip cron can nudge non-finishers to come back.
--
--   fc_progress          JSONB   { "<flashcard_items.id>": "correct"|"incorrect" }
--   fc_started_at        first card answered
--   fc_completed_at      answered the whole deck (finisher signal for the drip)
--   fc_last_activity_at  last save (freshness / staleness)
--   fc_reminder_step     finish-reminder counter (0 → 2), owned by flashcards-drip
--
-- All written via the saveFlashcardsProgress server action (service-role; leads is
-- deny-all RLS). Keep in sync with app/src/actions/magnet.ts + flashcards-drip.
--
-- Run with: node scripts/run-sql.js schema-patch-leads-flashcard-progress.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS fc_progress          JSONB,
  ADD COLUMN IF NOT EXISTS fc_started_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fc_completed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fc_last_activity_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fc_reminder_step     SMALLINT NOT NULL DEFAULT 0;

-- Supports the flashcards-drip scan (active flashcards leads who got the deck link).
CREATE INDEX IF NOT EXISTS leads_fc_drip_idx
  ON leads (completed_at)
  WHERE source = 'flashcards-50' AND drip_status = 'active';

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS leads_fc_drip_idx;
-- ALTER TABLE leads
--   DROP COLUMN IF EXISTS fc_progress,
--   DROP COLUMN IF EXISTS fc_started_at,
--   DROP COLUMN IF EXISTS fc_completed_at,
--   DROP COLUMN IF EXISTS fc_last_activity_at,
--   DROP COLUMN IF EXISTS fc_reminder_step;
