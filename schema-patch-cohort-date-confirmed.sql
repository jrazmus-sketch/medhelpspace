-- Cohort exam-date confidence: Revalida exam dates are notoriously unreliable
-- (INEP/the exam board often doesn't announce them until close to the window,
-- and estimates can shift by up to ~60 days). We still need ONE concrete date
-- to drive internal scheduling — cohorts.test_date keeps doing that job
-- unchanged (60D unlock via cohort_module_access, study-plan pacing/phase
-- selection). date_confirmed is purely a DISPLAY gate on top of it.
--
-- Model (locked 2026-07-02):
--   - date_confirmed = false (default) → test_date is our best internal guess.
--     Every student-facing surface (dashboard countdown, 60D unlock line,
--     sales page, study-plan wizard, lifecycle emails) must treat the date as
--     unknown: no day-countdown, no calendar date, generic copy only
--     ("MedHelp 60D — libera 60 dias antes da prova", no exam-date chip, etc).
--   - date_confirmed = true → the exam board has actually announced the date.
--     Every surface switches to showing the real countdown/date as today.
--   - test_date itself is NEVER blanked out — admins always see and edit the
--     real (possibly guessed) value; only student-facing display code branches
--     on date_confirmed. Flipping the flag later needs no other data change.
--
-- No RLS changes: cohorts already has whatever read/write policies exist for
-- the table; this is a plain column addition read by the same paths.
--
-- Run with: node scripts/run-sql.js schema-patch-cohort-date-confirmed.sql

-- ── Column ────────────────────────────────────────────────────────────────────

ALTER TABLE cohorts
  ADD COLUMN IF NOT EXISTS date_confirmed boolean NOT NULL DEFAULT false;  -- true once the exam board has announced test_date for real

-- ── Rollback (manual) ─────────────────────────────────────────────────────────
-- ALTER TABLE cohorts DROP COLUMN IF EXISTS date_confirmed;
