-- schema-patch-topic-incidence-automatic.sql
--
-- Karina 2026-11-16 ("Incidência automática no Meu Plano — autorizada"):
--   • Meu Plano's incidence = the ORIGINAL questions registered on the platform, each counted ONCE, on its
--     primary topic (R1) — never twice because it sits in two sections. She approved the resulting change
--     (60 topics, 25 of them change band A ≥ 9 · B 6–8 · C 3–5 · D 1–2).
--   • AUTOMATIC and PERMANENT: adding an original, changing its classification, a new topic, or taking a
--     record out of the published set recalculates incidence and band by itself.
--   • The 27 classifications still pending her review COUNT on their current topic (status stays 'proposto',
--     note "A REVER"): when she reclassifies one, the count follows automatically.
--   • Nothing about members is touched: progress, Revisão history and plans are not keyed to incidence (the
--     plan is derived at read time), so nothing is deleted or reset.
--
-- Definition (same as the approved view topic_incidence_live): an original counts for topic T when
--   exam_questions.topic_id = T and at least ONE of its records (quiz_questions.exam_question_id) sits on a
--   PUBLISHED page. Two records of the same original = 1. Interface (secondary) topics never count.
--
-- Mechanism:
--   topic_incidence_count(id)   the count for one topic (indexed lookups).
--   topics BEFORE INSERT/UPDATE OF incidence_count → the stored value is ALWAYS the computed one; a manual
--                                write is silently corrected, so the number can never drift again. Each real
--                                change is logged in topic_incidence_changes (old → new, band, when).
--   refresh_topic_incidence()   re-syncs every topic whose stored value differs (returns how many changed).
--   statement-level AFTER triggers call it after any change to exam_questions, to quiz_questions'
--   exam_question_id/page_id (insert/delete too), and to pages.status. priority_tier is a GENERATED column of
--   incidence_count, so the band follows on its own.
--
-- The free 50 Flashcards were frozen first (schema-patch-free-flashcard-deck.sql + seed script); this patch
-- refuses to run until that table holds 50 cards, so the switch cannot move the lead-magnet deck.
--
-- Backup: topics_bk_incidence (id, incidence_count, priority_tier before the switch).
-- Rollback: schema-patch-topic-incidence-automatic-rollback.sql. Re-run safe.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.free_flashcard_deck') IS NULL
     OR (SELECT count(*) FROM free_flashcard_deck) <> 50 THEN
    RAISE EXCEPTION 'free_flashcard_deck must hold the 50 frozen cards first (schema-patch-free-flashcard-deck.sql + scripts/freeze-free-flashcard-deck.js --apply)';
  END IF;
  IF to_regclass('public.topic_incidence_live') IS NULL THEN
    RAISE EXCEPTION 'topic_incidence_live missing — apply schema-patch-exam-questions.sql first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS topics_bk_incidence AS
  SELECT id, incidence_count, priority_tier, now() AS backed_up_at FROM topics;
ALTER TABLE topics_bk_incidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON topics_bk_incidence FROM anon, authenticated;

-- ── History of every automatic change ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topic_incidence_changes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id   bigint NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  old_count  int,
  new_count  int    NOT NULL,
  old_tier   text,
  new_tier   text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS topic_incidence_changes_topic_idx ON topic_incidence_changes(topic_id, changed_at DESC);
ALTER TABLE topic_incidence_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS topic_incidence_changes_admin_read ON topic_incidence_changes;
CREATE POLICY topic_incidence_changes_admin_read ON topic_incidence_changes FOR SELECT
  USING (current_user_role() IN ('super_admin', 'content_admin'));
REVOKE ALL ON topic_incidence_changes FROM anon;
COMMENT ON TABLE topic_incidence_changes IS
  'One row per automatic change of topics.incidence_count (Karina 2026-11-16). Written by trigger only.';

CREATE INDEX IF NOT EXISTS quiz_questions_exam_question_idx ON quiz_questions(exam_question_id)
  WHERE exam_question_id IS NOT NULL;

-- ── The count ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION topic_incidence_count(p_topic_id bigint) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int
  FROM exam_questions e
  WHERE e.topic_id = p_topic_id
    AND EXISTS (SELECT 1 FROM quiz_questions q JOIN pages p ON p.id = q.page_id
                WHERE q.exam_question_id = e.id AND p.status = 'publish')
$$;

CREATE OR REPLACE FUNCTION incidence_tier(n int) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN n >= 9 THEN 'A' WHEN n >= 6 THEN 'B' WHEN n >= 3 THEN 'C' WHEN n >= 1 THEN 'D' END
$$;

-- topics: the stored number is always the computed one.
CREATE OR REPLACE FUNCTION topics_incidence_enforce() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  n := topic_incidence_count(NEW.id);
  NEW.incidence_count := n;
  IF TG_OP = 'UPDATE' AND OLD.incidence_count IS DISTINCT FROM n THEN
    NEW.updated_at := now();
    INSERT INTO topic_incidence_changes (topic_id, old_count, new_count, old_tier, new_tier)
    VALUES (NEW.id, OLD.incidence_count, n, incidence_tier(OLD.incidence_count), incidence_tier(n));
  ELSIF TG_OP = 'INSERT' AND n > 0 THEN
    INSERT INTO topic_incidence_changes (topic_id, old_count, new_count, old_tier, new_tier)
    VALUES (NEW.id, NULL, n, NULL, incidence_tier(n));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS topics_incidence_enforce ON topics;
CREATE TRIGGER topics_incidence_enforce
  BEFORE INSERT OR UPDATE OF incidence_count ON topics
  FOR EACH ROW EXECUTE FUNCTION topics_incidence_enforce();

-- Re-sync every topic whose stored number differs from the computed one.
CREATE OR REPLACE FUNCTION refresh_topic_incidence() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed int;
BEGIN
  WITH d AS (
    SELECT t.id FROM topics t WHERE t.incidence_count IS DISTINCT FROM topic_incidence_count(t.id)
  )
  UPDATE topics t SET incidence_count = topic_incidence_count(t.id)   -- the BEFORE trigger logs it
  FROM d WHERE d.id = t.id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END $$;

CREATE OR REPLACE FUNCTION refresh_topic_incidence_trg() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM refresh_topic_incidence();
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS exam_questions_refresh_incidence ON exam_questions;
CREATE TRIGGER exam_questions_refresh_incidence
  AFTER INSERT OR UPDATE OR DELETE ON exam_questions
  FOR EACH STATEMENT EXECUTE FUNCTION refresh_topic_incidence_trg();

DROP TRIGGER IF EXISTS quiz_questions_refresh_incidence ON quiz_questions;
CREATE TRIGGER quiz_questions_refresh_incidence
  AFTER INSERT OR DELETE OR UPDATE OF exam_question_id, page_id ON quiz_questions
  FOR EACH STATEMENT EXECUTE FUNCTION refresh_topic_incidence_trg();

DROP TRIGGER IF EXISTS pages_refresh_incidence ON pages;
CREATE TRIGGER pages_refresh_incidence
  AFTER UPDATE OF status ON pages
  FOR EACH STATEMENT EXECUTE FUNCTION refresh_topic_incidence_trg();

REVOKE EXECUTE ON FUNCTION topic_incidence_count(bigint), refresh_topic_incidence(),
  refresh_topic_incidence_trg(), topics_incidence_enforce() FROM PUBLIC, anon, authenticated;

-- ── The switch ────────────────────────────────────────────────────────────────
DO $$
DECLARE n int; mism int;
BEGIN
  n := refresh_topic_incidence();
  RAISE NOTICE 'incidence switched: % topics changed', n;
  -- The trigger's count and the approved view must agree on every topic.
  SELECT count(*) INTO mism FROM topics t JOIN topic_incidence_live l ON l.topic_id = t.id
   WHERE t.incidence_count <> l.incidence OR t.priority_tier IS DISTINCT FROM l.tier_by_current_rule;
  IF mism > 0 THEN
    RAISE EXCEPTION '% topics disagree with topic_incidence_live after the switch', mism;
  END IF;
END $$;

COMMENT ON COLUMN topics.incidence_count IS
  'Distinct ORIGINAL questions (exam_questions) on this primary topic with at least one published record. '
  'Maintained by trigger (schema-patch-topic-incidence-automatic.sql); manual writes are corrected.';

COMMIT;
