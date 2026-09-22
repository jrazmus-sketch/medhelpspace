-- rollback-mini-simulados.sql
--
-- Undoes scripts/apply-mini-simulados.js using the snapshot it takes on its FIRST apply:
--   pages · quiz_questions · nav_items · quiz_attempts · review_schedule · simulado_review_flags
--   (each as <table>_bk_minisim_20260922)
--
--   node scripts/run-sql.js scripts/rollback-mini-simulados.sql                       # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js scripts/rollback-mini-simulados.sql                     # local
--
-- Scope: mini simulado pages — view='simulados' AND content_module_id IS NULL. The 60D
-- Simulado 100Q (content_module_id = 1) is never touched.
--
-- Restores IN PLACE, by id: a question that existed before keeps its row (attempts stay
-- attached). Rows the apply INSERTED are deleted, pages it CREATED are deleted, and what
-- it DELETED (the Emergência simulados, their questions, cards, attempts, review rows) is
-- put back with the original ids, and the Emergência hub it unpublished is republished. The snapshot tables are then DROPPED, so the
-- next apply snapshots a true "before". Caveat: anything added to these pages after the
-- apply is not in the snapshot and is removed too. run-sql.js wraps the file in one
-- transaction. Restores name their columns (from the catalog, skipping generated ones
-- such as pages.search_tsv), so they survive column-order drift.

-- 0. refuse to run without the snapshot
DO $$
BEGIN
  IF to_regclass('public.pages_bk_minisim_20260922') IS NULL
     OR to_regclass('public.quiz_questions_bk_minisim_20260922') IS NULL
     OR to_regclass('public.nav_items_bk_minisim_20260922') IS NULL
     OR to_regclass('public.quiz_attempts_bk_minisim_20260922') IS NULL
     OR to_regclass('public.review_schedule_bk_minisim_20260922') IS NULL
     OR to_regclass('public.simulado_review_flags_bk_minisim_20260922') IS NULL THEN
    RAISE EXCEPTION 'snapshot tables *_bk_minisim_20260922 not found — nothing to roll back to';
  END IF;
END $$;

-- Re-insert snapshot rows matching p_where (written against alias b) into p_table.
-- Columns = the table's non-generated columns that the snapshot also has.
CREATE FUNCTION pg_temp.restore_rows(p_table text, p_where text, p_override boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.is_generated = 'NEVER'
    AND EXISTS (SELECT 1 FROM information_schema.columns k
                WHERE k.table_schema = 'public' AND k.table_name = p_table || '_bk_minisim_20260922'
                  AND k.column_name = c.column_name);
  EXECUTE format('INSERT INTO %I (%s) %s SELECT %s FROM %I b WHERE %s',
    p_table, cols, CASE WHEN p_override THEN 'OVERRIDING SYSTEM VALUE' ELSE '' END,
    cols, p_table || '_bk_minisim_20260922', p_where);
END $fn$;

-- 1. pages the apply CREATED (not in the snapshot): their hub cards first (target FK has
--    no ON DELETE), then the page — its questions and attempts cascade.
DELETE FROM nav_items n
WHERE n.target_page_id IN (
  SELECT p.id FROM pages p
  WHERE p.view = 'simulados' AND p.content_module_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM pages_bk_minisim_20260922 b WHERE b.id = p.id));
DELETE FROM pages p
WHERE p.view = 'simulados' AND p.content_module_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM pages_bk_minisim_20260922 b WHERE b.id = p.id);

-- 2. questions the apply INSERTED on pre-existing pages
DELETE FROM quiz_questions q
WHERE q.page_id IN (SELECT id FROM pages_bk_minisim_20260922)
  AND NOT EXISTS (SELECT 1 FROM quiz_questions_bk_minisim_20260922 b WHERE b.id = q.id);

-- 3. pages the apply DELETED (the Emergência simulados), original ids; and status/notes
--    back on the ones it kept (the Emergência hub it unpublished)
SELECT pg_temp.restore_rows('pages', 'NOT EXISTS (SELECT 1 FROM pages p WHERE p.id = b.id)');
UPDATE pages p SET status = b.status, notes = b.notes
FROM pages_bk_minisim_20260922 b
WHERE b.id = p.id AND (p.status, p.notes) IS DISTINCT FROM (b.status, b.notes);

-- 4. questions rewritten in place: park, then restore content + position from the snapshot
--    ((page_id, position) is UNIQUE, so positions move in two passes)
UPDATE quiz_questions q SET position = q.position + 10000
WHERE q.page_id IN (SELECT id FROM pages_bk_minisim_20260922);
UPDATE quiz_questions q
SET position = b.position, question = b.question, answers = b.answers,
    media_url = b.media_url, explanation_html = b.explanation_html, h5p_sub_id = b.h5p_sub_id
FROM quiz_questions_bk_minisim_20260922 b
WHERE b.id = q.id;

-- 5. questions the apply DELETED (they went with the Emergência pages)
SELECT pg_temp.restore_rows('quiz_questions', 'NOT EXISTS (SELECT 1 FROM quiz_questions q WHERE q.id = b.id)', true);

-- 6. hub cards, attempts, review rows and review flags that were removed
SELECT pg_temp.restore_rows('nav_items', 'NOT EXISTS (SELECT 1 FROM nav_items n WHERE n.id = b.id)', true);
SELECT pg_temp.restore_rows('quiz_attempts', 'NOT EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.id = b.id)');
SELECT pg_temp.restore_rows('review_schedule',
  'NOT EXISTS (SELECT 1 FROM review_schedule r WHERE r.id = b.id)
   AND NOT EXISTS (SELECT 1 FROM review_schedule r
                   WHERE r.user_id = b.user_id AND r.item_type = b.item_type AND r.item_id = b.item_id)', true);
SELECT pg_temp.restore_rows('simulado_review_flags', 'NOT EXISTS (SELECT 1 FROM simulado_review_flags f WHERE f.question_id = b.question_id)');

-- 7. invariants
DO $$
DECLARE parked int; missing int;
BEGIN
  SELECT count(*) INTO parked FROM quiz_questions WHERE position >= 10000
    AND page_id IN (SELECT id FROM pages_bk_minisim_20260922);
  IF parked > 0 THEN RAISE EXCEPTION '% question(s) left parked at position >= 10000', parked; END IF;
  SELECT count(*) INTO missing FROM quiz_questions_bk_minisim_20260922 b
    WHERE NOT EXISTS (SELECT 1 FROM quiz_questions q WHERE q.id = b.id);
  IF missing > 0 THEN RAISE EXCEPTION '% snapshot question(s) not restored', missing; END IF;
END $$;

-- 8. drop the snapshot so the next apply takes a fresh "before"
DROP TABLE pages_bk_minisim_20260922;
DROP TABLE quiz_questions_bk_minisim_20260922;
DROP TABLE nav_items_bk_minisim_20260922;
DROP TABLE quiz_attempts_bk_minisim_20260922;
DROP TABLE review_schedule_bk_minisim_20260922;
DROP TABLE simulado_review_flags_bk_minisim_20260922;

SELECT count(*) AS mini_simulado_questions_after_rollback
FROM quiz_questions q JOIN pages p ON p.id = q.page_id
WHERE p.view = 'simulados' AND p.content_module_id IS NULL;
