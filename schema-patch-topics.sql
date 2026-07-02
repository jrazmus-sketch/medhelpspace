-- schema-patch-topics.sql
--
-- Study-plan incidence foundation. Two new additive reference tables that let
-- the study plan rank by real Revalida topic incidence (2020–2025.2) instead of
-- by specialty alone.
--
--   topics         — one row per exam topic; `incidence_count` is the number of
--                    real past-exam questions on that topic (seeded separately
--                    from view='quiz' page counts). `priority_tier` is DERIVED
--                    from the count (A ≥9 · B 6–8 · C 3–5 · D 1–2 · else NULL)
--                    via a STORED generated column, so it self-maintains on
--                    every re-seed. Thresholds live in the CASE below — edit
--                    there if Karina ever retunes the rubric.
--   topic_content  — maps one topic to its content across the five schedulable
--                    resources (quiz / simulado / flashcards / medvoice /
--                    revalida_up). A topic has many rows (one per resource
--                    pointer). `question_filter` scopes simulado question
--                    subsets when a whole page isn't the right grain.
--
-- Both are public-read reference/content data (like `specialties`): anyone may
-- SELECT; writes are restricted to super_admin / content_admin. Content writes
-- go through the service-role client (RLS-bypassing), so the admin policy is
-- defense-in-depth for any future non-admin writer. RLS is enabled at creation
-- per the default-grants invariant.
--
-- NO seed data here — topics seed from view='quiz' counts in a follow-up script.
--
-- Idempotent (safe to re-run): IF NOT EXISTS / DROP-IF-EXISTS throughout.
--
-- Rollback:
--   DROP TABLE IF EXISTS topic_content;
--   DROP TABLE IF EXISTS topics;

BEGIN;

-- ── topics ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topics (
  id                bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              text         NOT NULL,                                 -- PT topic label
  slug              text         NOT NULL UNIQUE,
  specialty_id      smallint     REFERENCES specialties(id) ON DELETE SET NULL,
  source_page_id    bigint       REFERENCES pages(id) ON DELETE SET NULL,  -- view='quiz' page it was seeded from
  incidence_count   int          NOT NULL DEFAULT 0,                       -- real past-exam questions on this topic
  priority_tier     text         GENERATED ALWAYS AS (
                      CASE
                        WHEN incidence_count >= 9 THEN 'A'
                        WHEN incidence_count >= 6 THEN 'B'
                        WHEN incidence_count >= 3 THEN 'C'
                        WHEN incidence_count >= 1 THEN 'D'
                      END
                    ) STORED,
  exam_cycle_source text         NOT NULL DEFAULT '2020-2025.2',
  is_pinned         boolean      NOT NULL DEFAULT false,                   -- curated "start here" high-yield list
  notes             text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS topics_specialty_id_idx ON topics(specialty_id);
CREATE INDEX IF NOT EXISTS topics_priority_tier_idx ON topics(priority_tier);
CREATE INDEX IF NOT EXISTS topics_source_page_id_idx ON topics(source_page_id)
  WHERE source_page_id IS NOT NULL;

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read — topic ranking is public reference data.
DROP POLICY IF EXISTS topics_select_all ON topics;
CREATE POLICY topics_select_all ON topics
  FOR SELECT USING (true);

-- Writes restricted to super_admin / content_admin (defense-in-depth; content
-- writers use the service-role client which bypasses RLS).
DROP POLICY IF EXISTS topics_write_admin ON topics;
CREATE POLICY topics_write_admin ON topics
  FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

-- ── topic_content ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topic_content (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id        bigint      NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  resource_type   text        NOT NULL CHECK (
                    resource_type IN ('quiz', 'simulado', 'flashcards', 'medvoice', 'revalida_up')
                  ),
  page_id         bigint      REFERENCES pages(id) ON DELETE CASCADE,
  question_filter jsonb,                                   -- optional: simulado question subset
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS topic_content_topic_id_idx ON topic_content(topic_id);
CREATE INDEX IF NOT EXISTS topic_content_page_id_idx ON topic_content(page_id)
  WHERE page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS topic_content_resource_type_idx ON topic_content(resource_type);

ALTER TABLE topic_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topic_content_select_all ON topic_content;
CREATE POLICY topic_content_select_all ON topic_content
  FOR SELECT USING (true);

DROP POLICY IF EXISTS topic_content_write_admin ON topic_content;
CREATE POLICY topic_content_write_admin ON topic_content
  FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

COMMIT;
