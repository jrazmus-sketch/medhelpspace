-- schema-patch-exam-questions.sql
--
-- R1 (Karina 2026-11-12): each ORIGINAL Revalida question is tied to ONE primary
-- Meu Plano topic, independently of the section (page) its records live in.
--
-- Why: a section is a visual grouping (Outros › Ortopedia holds artrite séptica AND
-- osteomielite; Urologia holds eight topics), but the plan, the incidence and the
-- Revisão link need the question's own subject. Until now a topic pointed at a whole
-- section (topic_content.page_id), so a topic inside a broad section opened every
-- question of that section, and incidence was counted per section RECORD — the same
-- original question filed in two sections counted twice.
--
-- Model
--   exam_questions        one row per original question: (edition, number) is the
--                         identity INEP gives it; booklet (caderno) when known; the
--                         annulled flag; the survey's theme/focus (Karina's 11
--                         levantamentos, kept as the reference for future imports).
--                         topic_id = the PRIMARY topic — counted once, there only.
--                         topic_status: 'proposto' until Karina approves it.
--   exam_question_secondary_topics
--                         optional interface topics, for navigation ONLY (a question
--                         set in pregnancy about hypothyroidism can also be offered
--                         under Assistência Pré-Natal). Never counted in incidence.
--   quiz_questions.exam_question_id
--                         which original a platform record IS. Several records may
--                         point at one original (the same question filed in two
--                         sections); a record with NULL is not identified yet.
--   topic_content.resource_type 'resumo'
--                         the topic's Resumo Narrativo, explicitly (the Outros topics'
--                         Resumos do not follow the section-slug convention).
--
-- Views (server-only, security_invoker, service_role grant — see
-- schema-patch-quiz-page-question-counts.sql for why):
--   exam_question_registry  per original: published/total records → "cadastrada".
--   topic_incidence_live    per topic: DISTINCT registered originals on their primary
--                           topic, editions, per-edition counts, and the tier the
--                           CURRENT rule (A≥9 · B 6–8 · C 3–5 · D 1–2) would give.
--                           topics.incidence_count is NOT touched here: switching the
--                           plan to the live number waits for Karina's approval.
--
-- Idempotent. Apply to BOTH databases. The data (1,100 originals, the record links,
-- the proposed topics) is a separate generated file, NOT in this public repo:
-- parsed/exam-questions-data.sql (gitignored).
--
-- Rollback (nothing else references these objects):
--   DROP VIEW IF EXISTS topic_question_links, topic_incidence_live, exam_question_registry;
--   ALTER TABLE quiz_questions DROP COLUMN IF EXISTS exam_question_id;
--   DROP TABLE IF EXISTS exam_question_secondary_topics, exam_questions;
--   DELETE FROM topic_content WHERE resource_type = 'resumo';
--   ALTER TABLE topic_content DROP CONSTRAINT topic_content_resource_type_check,
--     ADD CONSTRAINT topic_content_resource_type_check CHECK (resource_type IN
--     ('quiz','simulado','flashcards','medvoice','revalida_up'));
--   DROP FUNCTION IF EXISTS exam_edition_rank(text);

BEGIN;

-- Chronological rank of an edition label: '2020' → 20200, '2022.2' → 20222.
CREATE OR REPLACE FUNCTION exam_edition_rank(edition text) RETURNS integer
  LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT split_part(edition, '.', 1)::int * 10 + COALESCE(NULLIF(split_part(edition, '.', 2), '')::int, 0)
$$;

CREATE TABLE IF NOT EXISTS exam_questions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edition       text     NOT NULL CHECK (edition ~ '^20[0-9]{2}(\.[12])?$'),
  number        smallint NOT NULL CHECK (number BETWEEN 1 AND 150),
  booklet       text,
  annulled      boolean  NOT NULL DEFAULT false,
  survey_theme  text,
  survey_focus  text,
  topic_id      bigint REFERENCES topics(id) ON DELETE RESTRICT,
  topic_status  text NOT NULL DEFAULT 'proposto' CHECK (topic_status IN ('proposto', 'aprovado')),
  topic_note    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition, number)
);
CREATE INDEX IF NOT EXISTS exam_questions_topic_idx ON exam_questions(topic_id) WHERE topic_id IS NOT NULL;

COMMENT ON TABLE exam_questions IS
  'One row per ORIGINAL Revalida question (edition + number). topic_id = its primary '
  'Meu Plano topic, counted once. Records on the platform point here via '
  'quiz_questions.exam_question_id; unregistered originals stay listed for follow-up.';

CREATE TABLE IF NOT EXISTS exam_question_secondary_topics (
  exam_question_id bigint NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  topic_id         bigint NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_question_id, topic_id)
);
COMMENT ON TABLE exam_question_secondary_topics IS
  'Interface topics of an original question — navigation only, never counted in incidence.';

ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS exam_question_id bigint REFERENCES exam_questions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS quiz_questions_exam_question_idx
  ON quiz_questions(exam_question_id) WHERE exam_question_id IS NOT NULL;

-- A secondary topic must differ from the primary (checked here, not as a CHECK,
-- because the primary lives on the other table).
CREATE OR REPLACE FUNCTION exam_question_secondary_not_primary() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM exam_questions e WHERE e.id = NEW.exam_question_id AND e.topic_id = NEW.topic_id) THEN
    RAISE EXCEPTION 'topic % is already the primary topic of exam question %', NEW.topic_id, NEW.exam_question_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS exam_question_secondary_not_primary ON exam_question_secondary_topics;
CREATE TRIGGER exam_question_secondary_not_primary
  BEFORE INSERT OR UPDATE ON exam_question_secondary_topics
  FOR EACH ROW EXECUTE FUNCTION exam_question_secondary_not_primary();

-- ── RLS: server-only (the member app reads through the service-role client) ──
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_question_secondary_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_questions_admin ON exam_questions;
CREATE POLICY exam_questions_admin ON exam_questions FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));
DROP POLICY IF EXISTS exam_question_secondary_topics_admin ON exam_question_secondary_topics;
CREATE POLICY exam_question_secondary_topics_admin ON exam_question_secondary_topics FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));
REVOKE ALL ON exam_questions, exam_question_secondary_topics FROM anon;
REVOKE EXECUTE ON FUNCTION exam_question_secondary_not_primary() FROM PUBLIC, anon, authenticated;

-- ── topic_content: the topic's own Resumo ─────────────────────────────────────
ALTER TABLE topic_content DROP CONSTRAINT IF EXISTS topic_content_resource_type_check;
ALTER TABLE topic_content ADD CONSTRAINT topic_content_resource_type_check
  CHECK (resource_type IN ('quiz', 'simulado', 'flashcards', 'medvoice', 'revalida_up', 'resumo'));

-- ── Views ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW exam_question_registry WITH (security_invoker = true) AS
SELECT
  e.id, e.edition, e.number, e.booklet, e.annulled, e.survey_theme, e.survey_focus,
  e.topic_id, e.topic_status,
  COUNT(q.id)                                         AS records,
  COUNT(q.id) FILTER (WHERE p.status = 'publish')     AS published_records,
  COUNT(q.id) FILTER (WHERE p.status = 'publish') > 0 AS registered
FROM exam_questions e
LEFT JOIN quiz_questions q ON q.exam_question_id = e.id
LEFT JOIN pages p          ON p.id = q.page_id
GROUP BY e.id;

CREATE OR REPLACE VIEW topic_incidence_live WITH (security_invoker = true) AS
WITH reg AS (
  SELECT r.id, r.edition, r.number, r.topic_id
  FROM exam_question_registry r
  WHERE r.registered AND r.topic_id IS NOT NULL
), per_ed AS (
  SELECT topic_id, edition, COUNT(*) AS n,
         string_agg('Q' || number, ', ' ORDER BY number) AS numbers
  FROM reg GROUP BY topic_id, edition
)
SELECT
  t.id AS topic_id,
  COALESCE(SUM(pe.n), 0)::int                                   AS incidence,
  COUNT(pe.edition)::int                                        AS editions,
  COALESCE(jsonb_object_agg(pe.edition, jsonb_build_object('n', pe.n, 'numbers', pe.numbers))
           FILTER (WHERE pe.edition IS NOT NULL), '{}'::jsonb)  AS by_edition,
  CASE WHEN COALESCE(SUM(pe.n), 0) >= 9 THEN 'A'
       WHEN COALESCE(SUM(pe.n), 0) >= 6 THEN 'B'
       WHEN COALESCE(SUM(pe.n), 0) >= 3 THEN 'C'
       WHEN COALESCE(SUM(pe.n), 0) >= 1 THEN 'D' END             AS tier_by_current_rule
FROM topics t
LEFT JOIN per_ed pe ON pe.topic_id = t.id
GROUP BY t.id;

COMMENT ON VIEW topic_incidence_live IS
  'Per topic: DISTINCT registered original questions on their primary topic (R1). '
  'Self-updating as records are linked; topics.incidence_count is unchanged until approved.';

-- What the member app reads: every PUBLISHED Questões record of a topic, primary or
-- interface (secondary), with the original it is a copy of. Ungated sections only
-- (a topic view must never surface a record from a module-gated page).
CREATE OR REPLACE VIEW topic_question_links WITH (security_invoker = true) AS
SELECT e.topic_id, e.id AS exam_question_id, q.id AS question_id, q.page_id, true AS is_primary,
       e.edition, e.number
FROM exam_questions e
JOIN quiz_questions q ON q.exam_question_id = e.id
JOIN pages p ON p.id = q.page_id AND p.status = 'publish' AND p.view = 'quiz' AND p.content_module_id IS NULL
WHERE e.topic_id IS NOT NULL
UNION ALL
SELECT s.topic_id, e.id, q.id, q.page_id, false, e.edition, e.number
FROM exam_question_secondary_topics s
JOIN exam_questions e ON e.id = s.exam_question_id
JOIN quiz_questions q ON q.exam_question_id = e.id
JOIN pages p ON p.id = q.page_id AND p.status = 'publish' AND p.view = 'quiz' AND p.content_module_id IS NULL;

REVOKE ALL ON exam_question_registry, topic_incidence_live, topic_question_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON exam_question_registry, topic_incidence_live, topic_question_links TO service_role;

COMMIT;
