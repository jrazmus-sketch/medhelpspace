-- Simulado 100Q v2 — funnel-owned question bank + exam-mode attempt state.
--
-- The rebuilt /simulado-revalida funnel replaces the old set (100 real past-INEP
-- items borrowed from the member bank) with 100 QUESTÕES INÉDITAS written by Karina
-- in the style of the 1ª etapa, delivered with a fully commented gabarito.
--
-- Why a dedicated table instead of quiz_questions rows:
--   * these are funnel-only content and must never surface in member question banks,
--     study plans, or the review schedule
--   * they carry fields the member bank has no column for (distractor analysis,
--     conceito-chave, grande área, tema)
--   * the set gets swapped periodically; set_version keeps old attempts readable
--
-- Access: deny-all RLS. The funnel is pre-auth and reads via the service-role client
-- only (same trust model as simulado_review_flags). anon/authenticated are revoked
-- explicitly because Supabase default-grants them on new tables.
--
-- Run with: node scripts/run-sql.js schema-patch-simulado-questions-v2.sql

-- ── Question bank ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS simulado_questions (
  id             BIGSERIAL PRIMARY KEY,
  set_version    SMALLINT    NOT NULL,
  position       SMALLINT    NOT NULL,   -- 1..100, order in the caderno (INEP-interleaved)
  enunciado      TEXT        NOT NULL,
  alternatives   JSONB       NOT NULL,   -- ["texto A", "texto B", "texto C", "texto D"]
  correct_index  SMALLINT    NOT NULL,   -- 0..3
  comentario     TEXT        NOT NULL,   -- why the correct answer is correct
  distratores    TEXT        NOT NULL,   -- why each incorrect alternative is wrong
  conceito_chave TEXT        NOT NULL,   -- one-line takeaway
  area           TEXT        NOT NULL,   -- grande área slug (5 values, see CHECK below)
  tema           TEXT        NOT NULL,   -- specific topic label, PT-BR
  media_url      TEXT,                   -- Bunny CDN figure, when the question has one
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (set_version, position)
);

DO $$ BEGIN
  ALTER TABLE simulado_questions
    ADD CONSTRAINT simulado_questions_correct_index_check
    CHECK (correct_index >= 0 AND correct_index <= 3);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE simulado_questions
    ADD CONSTRAINT simulado_questions_alternatives_check
    CHECK (jsonb_typeof(alternatives) = 'array' AND jsonb_array_length(alternatives) = 4);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The five grandes áreas of the Revalida 1ª etapa. Reporting is done at this level
-- only: tema is deliberately NOT aggregated into percentages, because most temas
-- appear once or twice in 100 questions and a single miss says nothing reliable.
DO $$ BEGIN
  ALTER TABLE simulado_questions
    ADD CONSTRAINT simulado_questions_area_check
    CHECK (area IN ('clinica-medica', 'cirurgia', 'go', 'pediatria', 'saude-coletiva'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS simulado_questions_set_position_idx
  ON simulado_questions (set_version, position);

ALTER TABLE simulado_questions ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all. Service-role bypasses RLS; nothing else may read.
REVOKE ALL ON simulado_questions FROM anon, authenticated;
REVOKE ALL ON SEQUENCE simulado_questions_id_seq FROM anon, authenticated;

-- ── Attempt state on leads ───────────────────────────────────────────────────
--
-- Exam-mode semantics (differs from the v1 funnel):
--   sim_progress      { "<simulado_questions.id>": { "a": <0..3> } }
--                     NOTE: no "c" key. Correctness is never sent to or accepted
--                     from the client — the gabarito is not in the exam payload and
--                     grading happens server-side at submit.
--   sim_flagged       [ <simulado_questions.id>, ... ] "marcar para revisar"
--   sim_answered      count of answered questions (denominator for any partial view)
--   sim_set_version   which question set this attempt belongs to
--   sim_completed_at  the candidate SUBMITTED the exam ("entregar a prova").
--                     Answering all 100 is NOT submission. The diagnosis and the
--                     commented gabarito are released only once this is set.
--   sim_score         0..100, computed server-side at submit
--   sim_area_scores   [ { key, label, correct, answered, total } ] per grande área

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sim_set_version SMALLINT,
  ADD COLUMN IF NOT EXISTS sim_answered    SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sim_flagged     JSONB;

DO $$ BEGIN
  ALTER TABLE leads
    ADD CONSTRAINT leads_sim_answered_check
    CHECK (sim_answered >= 0 AND sim_answered <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_sim_answered_check;
-- ALTER TABLE leads
--   DROP COLUMN IF EXISTS sim_set_version,
--   DROP COLUMN IF EXISTS sim_answered,
--   DROP COLUMN IF EXISTS sim_flagged;
-- DROP TABLE IF EXISTS simulado_questions;
