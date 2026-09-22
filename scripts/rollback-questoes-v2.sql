-- rollback-questoes-v2.sql
--
-- Undoes scripts/apply-questoes-v2.js using the snapshot it takes on its FIRST apply:
--   pages_bk_questoes_20260920 · quiz_questions_bk_questoes_20260920 · nav_items_bk_questoes_20260920
--
--   node scripts/run-sql.js scripts/rollback-questoes-v2.sql                       # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js scripts/rollback-questoes-v2.sql                     # local
--
-- Scope: Questões topic pages only — view='quiz' AND type='h5p-quiz' AND track_id IS NULL
-- AND content_module_id IS NULL. Flashcards, Memorecards and Simulados are never touched.
--
-- It restores IN PLACE, by id, exactly like the apply: a question that existed before
-- keeps its row, so quiz_attempts and review_schedule stay attached. Only rows the apply
-- INSERTED are deleted (their attempts cascade — they did not exist before), and the
-- duplicate rows the apply removed are put back.
--
-- It then DROPS the three snapshot tables, so the next apply snapshots a true "before".
-- Caveat: anything an admin added to a Questões page AFTER the apply (a question, a hub
-- card) is not in the snapshot and is removed too. run-sql.js wraps the file in one
-- transaction.

-- 0. refuse to run without the snapshot
DO $$
BEGIN
  IF to_regclass('public.quiz_questions_bk_questoes_20260920') IS NULL
     OR to_regclass('public.pages_bk_questoes_20260920') IS NULL
     OR to_regclass('public.nav_items_bk_questoes_20260920') IS NULL THEN
    RAISE EXCEPTION 'snapshot tables *_bk_questoes_20260920 not found — nothing to roll back to';
  END IF;
END $$;

CREATE TEMP TABLE _qp ON COMMIT DROP AS
  SELECT id FROM pages
  WHERE view = 'quiz' AND type = 'h5p-quiz' AND track_id IS NULL AND content_module_id IS NULL;

-- 1. questions the apply inserted
DELETE FROM quiz_questions q
WHERE q.page_id IN (SELECT id FROM _qp)
  AND NOT EXISTS (SELECT 1 FROM quiz_questions_bk_questoes_20260920 b WHERE b.id = q.id);

-- 2. restore surviving rows by id (park positions first: (page_id, position) is UNIQUE)
UPDATE quiz_questions q SET position = q.position + 20000
WHERE q.page_id IN (SELECT id FROM _qp);

UPDATE quiz_questions q
SET position = b.position, question = b.question, answers = b.answers,
    explanation_html = b.explanation_html, media_url = b.media_url
FROM quiz_questions_bk_questoes_20260920 b
WHERE b.id = q.id AND q.page_id IN (SELECT id FROM _qp);

-- 3. put back the duplicate rows the apply removed
INSERT INTO quiz_questions (id, page_id, position, h5p_sub_id, question, answers, media_url, created_at, explanation_html)
OVERRIDING SYSTEM VALUE -- quiz_questions.id is GENERATED ALWAYS; the restored row must keep its id
SELECT b.id, b.page_id, b.position, b.h5p_sub_id, b.question, b.answers, b.media_url, b.created_at, b.explanation_html
FROM quiz_questions_bk_questoes_20260920 b
WHERE b.page_id IN (SELECT id FROM _qp)
  AND NOT EXISTS (SELECT 1 FROM quiz_questions q WHERE q.id = b.id);

-- 4. hub cards: drop the ones the apply added, restore labels on the rest
DELETE FROM nav_items n
WHERE n.target_page_id IN (SELECT id FROM _qp)
  AND NOT EXISTS (SELECT 1 FROM nav_items_bk_questoes_20260920 b WHERE b.id = n.id);

UPDATE nav_items n SET label = b.label, position = b.position
FROM nav_items_bk_questoes_20260920 b
WHERE b.id = n.id AND n.target_page_id IN (SELECT id FROM _qp);

-- 5. pages: delete the topics the apply created, restore title/status on the rest
DELETE FROM pages p
WHERE p.id IN (SELECT id FROM _qp)
  AND NOT EXISTS (SELECT 1 FROM pages_bk_questoes_20260920 b WHERE b.id = p.id);

UPDATE pages p SET title = b.title, status = b.status, updated_at = now()
FROM pages_bk_questoes_20260920 b
WHERE b.id = p.id AND p.id IN (SELECT id FROM _qp)
  AND (p.title IS DISTINCT FROM b.title OR p.status IS DISTINCT FROM b.status);

-- 6. invariants
DO $$
DECLARE parked int; diff int;
BEGIN
  SELECT count(*) INTO parked FROM quiz_questions q JOIN pages p ON p.id = q.page_id
   WHERE p.view = 'quiz' AND p.type = 'h5p-quiz' AND q.position >= 20000;
  IF parked > 0 THEN RAISE EXCEPTION '% question(s) left parked', parked; END IF;
  SELECT count(*) INTO diff FROM quiz_questions_bk_questoes_20260920 b
   JOIN pages p ON p.id = b.page_id AND p.type = 'h5p-quiz' AND p.track_id IS NULL AND p.content_module_id IS NULL
   LEFT JOIN quiz_questions q ON q.id = b.id
   WHERE q.id IS NULL OR q.question IS DISTINCT FROM b.question OR q.position IS DISTINCT FROM b.position;
  IF diff > 0 THEN RAISE EXCEPTION '% snapshot question(s) not restored', diff; END IF;
END $$;

-- 7. the snapshot has served its purpose
DROP TABLE quiz_questions_bk_questoes_20260920;
DROP TABLE nav_items_bk_questoes_20260920;
DROP TABLE pages_bk_questoes_20260920;

SELECT count(*) AS questoes_topics_published FROM pages
 WHERE view = 'quiz' AND type = 'h5p-quiz' AND status = 'publish' AND track_id IS NULL AND content_module_id IS NULL;
