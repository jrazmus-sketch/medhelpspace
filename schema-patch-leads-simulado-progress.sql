-- Simulado-100 funnel — durable progress on the free 100-question INEP simulado.
--
-- Third lead funnel (/simulado-revalida): email-first magic link → 100 real
-- past-Revalida questions in 5 blocos of 20 by grande área → per-área diagnostic
-- report. A multi-hour test is never finished in one sitting, so every answer is
-- persisted per-lead and the SAME magic link resumes at the next unanswered
-- question; the simulado-drip cron nudges non-finishers.
--
--   sim_progress          JSONB   { "<quiz_questions.id>": { "a": <answer index>, "c": <correct?> } }
--   sim_started_at        first question answered
--   sim_completed_at      answered all 100 (finisher signal for the drip)
--   sim_last_activity_at  last save (freshness / staleness)
--   sim_reminder_step     finish-reminder counter (0 → 2), owned by simulado-drip
--   sim_score             final score 0..100 (set at finalize, drives report + emails)
--   sim_area_scores       JSONB [ { "key", "label", "correct", "total" } ] per grande área
--
-- All written via the simulado server actions (service-role; leads is deny-all
-- RLS). Keep in sync with app/src/actions/magnet.ts + simulado-drip.
--
-- Run with: node scripts/run-sql.js schema-patch-leads-simulado-progress.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sim_progress          JSONB,
  ADD COLUMN IF NOT EXISTS sim_started_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sim_completed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sim_last_activity_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sim_reminder_step     SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sim_score             SMALLINT,
  ADD COLUMN IF NOT EXISTS sim_area_scores       JSONB;

-- 0..100 guard on the final score (NULL until finalize).
DO $$ BEGIN
  ALTER TABLE leads
    ADD CONSTRAINT leads_sim_score_check CHECK (sim_score IS NULL OR (sim_score >= 0 AND sim_score <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supports the simulado-drip scan (active simulado leads who got the magic link).
CREATE INDEX IF NOT EXISTS leads_sim_drip_idx
  ON leads (completed_at)
  WHERE source = 'simulado-100' AND drip_status = 'active';

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS leads_sim_drip_idx;
-- ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_sim_score_check;
-- ALTER TABLE leads
--   DROP COLUMN IF EXISTS sim_progress,
--   DROP COLUMN IF EXISTS sim_started_at,
--   DROP COLUMN IF EXISTS sim_completed_at,
--   DROP COLUMN IF EXISTS sim_last_activity_at,
--   DROP COLUMN IF EXISTS sim_reminder_step,
--   DROP COLUMN IF EXISTS sim_score,
--   DROP COLUMN IF EXISTS sim_area_scores;
