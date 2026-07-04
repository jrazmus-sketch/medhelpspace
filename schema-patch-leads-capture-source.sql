-- schema-patch-leads-capture-source.sql
--
-- Capture-origin tag on `leads` (2026-07-04). Records WHICH funnel surface first
-- captured a lead's email, so /admin/leads + funnel analytics can tell a normal
-- quiz-gate capture apart from an exit-intent "salvar para depois" capture.
--
-- Values written by the app:
--   • 'exit_intent' — actions/magnet.ts saveLeadForLater (the exit-intent modal on
--                     /questoes-revalida; email left BEFORE completing the quiz).
--   • NULL          — legacy / normal path (captureLeadAndUnlock at Q5). We do NOT
--                     backfill the quiz path: NULL is read as "came through the quiz".
--
-- Set-once semantics: saveLeadForLater only writes capture_source when it is still
-- NULL, so a later real quiz capture on the same address never has its origin flipped.
--
-- `leads` already has deny-all RLS + revoked anon/auth grants (schema-patch-leads.sql);
-- a new column needs no further RLS work. Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Apply with: node scripts/run-sql.js schema-patch-leads-capture-source.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS capture_source TEXT; -- 'exit_intent' | NULL (quiz)

-- Analytics lookup: "how many leads did the exit-intent modal capture?"
CREATE INDEX IF NOT EXISTS leads_capture_source_idx
  ON leads (capture_source) WHERE capture_source IS NOT NULL;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS leads_capture_source_idx;
-- ALTER TABLE leads DROP COLUMN IF EXISTS capture_source;
