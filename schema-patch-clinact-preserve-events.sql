-- ClinAct — stop re-publishing a case from erasing student history.
--
-- Found by Karina, 2026-09-02 (test of PV-01 / CC-01): after an editorial
-- revision of CC-01 the "erro com alta confiança" marker vanished from Minha
-- Evolução and the global counter changed. Her rule — "uma revisão do conteúdo
-- do caso não deveria reescrever o histórico de desempenho do aluno" — was
-- being violated by the schema itself.
--
-- Root cause: `clinact_step_events.step_id` was `REFERENCES clinact_steps(id)
-- ON DELETE CASCADE`, and `clinact_save_case()` deletes every step of a case on
-- every save (steps are fully replaced). So each save cascade-deleted the
-- per-decision history — confidence, correctness, timing — of EVERY past
-- attempt on that case. Scores survived (they live on clinact_attempts), which
-- is exactly why it looked like only the confidence data was "missing".
--
-- Fix, two parts:
--   1. step_id becomes NULLABLE with ON DELETE SET NULL. The event keeps
--      everything Minha Evolução reads (is_correct, weight, confidence,
--      time_ms, skill); it just stops knowing which step row it belonged to,
--      and the published snapshot in clinact_case_versions already preserves
--      what the student actually read.
--   2. Backfill the events already destroyed. clinact_attempts.state.answered
--      holds exactly the same per-decision facts (option_id, is_correct,
--      weight, confidence, time_ms), so finished attempts that lost ALL their
--      events can be rebuilt from their own state.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-preserve-events.sql             # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-preserve-events.sql           # local
--
-- Rollback (only safe while no NULL step_id rows exist):
--   ALTER TABLE clinact_step_events DROP CONSTRAINT clinact_step_events_step_id_fkey;
--   ALTER TABLE clinact_step_events ALTER COLUMN step_id SET NOT NULL;
--   ALTER TABLE clinact_step_events ADD CONSTRAINT clinact_step_events_step_id_fkey
--     FOREIGN KEY (step_id) REFERENCES clinact_steps(id) ON DELETE CASCADE;

BEGIN;

-- ── 1. The FK must not destroy history ───────────────────────────────────────

ALTER TABLE clinact_step_events DROP CONSTRAINT IF EXISTS clinact_step_events_step_id_fkey;
ALTER TABLE clinact_step_events ALTER COLUMN step_id DROP NOT NULL;
ALTER TABLE clinact_step_events
  ADD CONSTRAINT clinact_step_events_step_id_fkey
  FOREIGN KEY (step_id) REFERENCES clinact_steps(id) ON DELETE SET NULL;

-- ── 2. Rebuild the events already lost ───────────────────────────────────────
-- Only for FINISHED attempts that have NO events left but do have answers in
-- their state — i.e. exactly the ones a save wiped. Attempts that still hold
-- some events are left alone so this can never duplicate a row.

INSERT INTO clinact_step_events
  (attempt_id, step_id, option_id, skill, is_correct, weight, confidence, time_ms, payload, answered_at)
SELECT
  a.id,
  NULL,                                              -- the step row is gone
  NULL,                                              -- option row likewise
  NULL,
  COALESCE((ans.value->>'is_correct')::boolean, false),
  COALESCE((ans.value->>'weight')::numeric, 0),
  NULLIF(ans.value->>'confidence', ''),
  NULLIF(ans.value->>'time_ms', '')::integer,
  CASE WHEN ans.value ? 'order' THEN jsonb_build_object('order', ans.value->'order') ELSE NULL END,
  a.finished_at
FROM clinact_attempts a
CROSS JOIN LATERAL jsonb_each(COALESCE(a.state->'answered', '{}'::jsonb)) AS ans(key, value)
WHERE a.finished_at IS NOT NULL
  AND jsonb_typeof(a.state->'answered') = 'object'
  AND NOT EXISTS (SELECT 1 FROM clinact_step_events e WHERE e.attempt_id = a.id);

COMMIT;
