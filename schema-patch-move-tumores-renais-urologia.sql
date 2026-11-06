-- schema-patch-move-tumores-renais-urologia.sql
--
-- Data fix (no DDL besides backup tables). Karina 2026-11-06, "Reorganização do tema
-- Tumores Renais": the theme leaves Nefrologia and lives in Outros → Urologia. ONLY the
-- organisation changes — no question text, alternative, answer key or comment is edited.
--
--   1. Flashcards   — the Nefrologia deck's "Tumores Renais" theme (25 cards) is removed.
--   2. Revalida Up  — tumores-renais-revalida-up → draft. Its content now lives in the
--                     Urologia Revalida Up, replaced from her attached file by the
--                     Revalida Up importer (apply THAT first, then this patch).
--   3. Resumos      — tumores-renais-resumos moves (same page, same slug, same text) from the
--                     Nefrologia Resumos hub to the Urologia area hub (Resumos → Outros →
--                     Urologia). Slug kept: Questões remediation finds resumos by slug.
--   4. Questões     — "Questão 7 · Revalida 2024.2" was ALREADY in Urologia (same statement,
--                     same answer key; she suspected so) → the Nefrologia copy is removed, no
--                     duplicate is created. "Questão 23 · Revalida 2022.1" MOVES (same row,
--                     same id) to the Urologia page, in year order (after 2021, before
--                     Q27 · 2022.1). The emptied Nefrologia "Tumores Renais" quiz page → draft
--                     and its cards leave the Nefrologia hubs.
--   5. Study plan   — topic "Tumores Renais" follows: specialty → Outros, its Revalida Up and
--                     Questões links point at the Urologia pages, its flashcards link is dropped.
--
-- NOT touched (not asked): the 60D Fórmula page tumores-renais-formula; the draft legacy
-- tumores-renais-simulados page.
--
-- History: verified on prod + local before writing — none of the removed cards/question has a
-- review_schedule row, quiz attempt, simulado flag or completion. Everything removed is still
-- copied to *_bk_tr_20261106 tables (RLS on, no grants) and restored exactly by
-- schema-patch-move-tumores-renais-urologia-rollback.sql.
--
-- Apply (per database) as ONE file, this patch FIRST and the generated Urologia Revalida Up
-- import after it, so the backup below captures the Urologia text before it is replaced:
--   cat schema-patch-move-tumores-renais-urologia.sql parsed/revalida-up-v2-import.sql --     > parsed/tumores-renais-urologia-apply.sql && node scripts/run-sql.js parsed/tumores-renais-urologia-apply.sql
--
-- Guards: refuses to run unless the layout is EXACTLY what was verified (and refuses a second
-- run). run-sql.js wraps the file in one transaction — any RAISE rolls everything back.

DO $guard$
DECLARE v int; s text;
BEGIN
  IF to_regclass('public.pages_bk_tr_20261106') IS NOT NULL THEN
    RAISE EXCEPTION 'already applied (pages_bk_tr_20261106 exists) — run the rollback first';
  END IF;
  SELECT count(*) INTO v FROM flashcard_items f JOIN pages p ON p.id = f.page_id
   WHERE p.slug = 'nefrologia-flashcards' AND f.group_label = 'Tumores Renais';
  IF v <> 25 THEN RAISE EXCEPTION 'expected 25 Tumores Renais flashcards in Nefrologia, found %', v; END IF;
  SELECT string_agg(substring(question from '<strong>([^<]*)</strong>'), '|' ORDER BY position) INTO s
    FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais');
  IF s IS DISTINCT FROM 'Questão 23 · Revalida 2022.1|Questão 7 · Revalida 2024.2' THEN
    RAISE EXCEPTION 'Nefrologia Tumores Renais questions are not the expected two: %', s; END IF;
  SELECT count(*) INTO v FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'urologia');
  IF v <> 30 THEN RAISE EXCEPTION 'expected 30 Urologia questions, found %', v; END IF;
  SELECT string_agg(substring(question from '<strong>([^<]*)</strong>'), '|' ORDER BY position) INTO s
    FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'urologia') AND position IN (6, 7);
  IF s IS DISTINCT FROM 'Questão 35 · Revalida 2021|Questão 27 · Revalida 2022.1 · Anulada' THEN
    RAISE EXCEPTION 'Urologia positions 6/7 are not 2021 / Q27 2022.1: %', s; END IF;
  -- The Urologia copy of Q7 · 2024.2 must be the same question (statement differs only by a
  -- final colon) with the same answer key and figure, or we would be dropping real content.
  SELECT count(*) INTO v FROM quiz_questions a, quiz_questions b
   WHERE a.page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais')
     AND b.page_id = (SELECT id FROM pages WHERE slug = 'urologia')
     AND a.question LIKE '%Questão 7 · Revalida 2024.2<%' AND b.question LIKE '%Questão 7 · Revalida 2024.2<%'
     AND a.answers = b.answers AND a.media_url IS NOT DISTINCT FROM b.media_url
     AND rtrim(a.question, ':</p>') = rtrim(b.question, ':</p>');
  IF v <> 1 THEN RAISE EXCEPTION 'Urologia copy of Q7 · 2024.2 is not identical to the Nefrologia one'; END IF;
  SELECT count(*) INTO v FROM quiz_questions WHERE question LIKE '%Questão 23 · Revalida 2022.1<%';
  IF v <> 1 THEN RAISE EXCEPTION 'expected exactly one Q23 · 2022.1, found %', v; END IF;
  SELECT count(*) INTO v FROM nav_items WHERE source_page_id = (SELECT id FROM pages WHERE slug = 'urologia-resumos');
  IF v <> 7 THEN RAISE EXCEPTION 'expected 7 cards on the Urologia Resumos hub, found %', v; END IF;
  SELECT count(*) INTO v FROM pages WHERE status = 'publish' AND slug IN
    ('tumores-renais', 'tumores-renais-resumos', 'tumores-renais-revalida-up', 'urologia', 'urologia-resumos', 'urologia-revalida-up');
  IF v <> 6 THEN RAISE EXCEPTION 'expected the 6 pages involved to be published, found %', v; END IF;
END $guard$;

-- ── Backups (everything this patch removes or changes) ──────────────────────────────────
CREATE TABLE pages_bk_tr_20261106 AS
  SELECT * FROM pages WHERE slug IN ('tumores-renais', 'tumores-renais-resumos', 'tumores-renais-revalida-up', 'urologia-revalida-up');
-- The Urologia Revalida Up text as it was BEFORE her updated file (the import runs in the
-- same transaction, AFTER this patch — see the apply notes at the top).
CREATE TABLE lessons_bk_tr_20261106 AS
  SELECT * FROM lessons WHERE page_id = (SELECT id FROM pages WHERE slug = 'urologia-revalida-up');
CREATE TABLE flashcard_items_bk_tr_20261106 AS
  SELECT f.* FROM flashcard_items f JOIN pages p ON p.id = f.page_id
   WHERE p.slug = 'nefrologia-flashcards' AND f.group_label = 'Tumores Renais';
CREATE TABLE flashcard_attempts_bk_tr_20261106 AS
  SELECT * FROM flashcard_attempts WHERE flashcard_item_id IN (SELECT id FROM flashcard_items_bk_tr_20261106);
CREATE TABLE flashcard_progress_bk_tr_20261106 AS
  SELECT * FROM flashcard_progress WHERE flashcard_item_id IN (SELECT id FROM flashcard_items_bk_tr_20261106);
CREATE TABLE flashcard_theme_topics_bk_tr_20261106 AS
  SELECT * FROM flashcard_theme_topics WHERE group_label = 'Tumores Renais'
     AND specialty_id = (SELECT id FROM specialties WHERE slug = 'nefrologia');
-- Both quiz pages in full: the moved/removed rows AND every Urologia position.
CREATE TABLE quiz_questions_bk_tr_20261106 AS
  SELECT * FROM quiz_questions WHERE page_id IN (SELECT id FROM pages WHERE slug IN ('tumores-renais', 'urologia'));
CREATE TABLE quiz_attempts_bk_tr_20261106 AS
  SELECT * FROM quiz_attempts WHERE question_id IN
    (SELECT id FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais'));
CREATE TABLE simulado_review_flags_bk_tr_20261106 AS
  SELECT * FROM simulado_review_flags WHERE question_id IN
    (SELECT id FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais'));
CREATE TABLE review_schedule_bk_tr_20261106 AS
  SELECT * FROM review_schedule
   WHERE (item_type = 'flashcard' AND item_id IN (SELECT id FROM flashcard_items_bk_tr_20261106))
      OR (item_type = 'quiz_question' AND item_id IN
          (SELECT id FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais')));
CREATE TABLE nav_items_bk_tr_20261106 AS
  SELECT * FROM nav_items WHERE target_page_id IN (SELECT id FROM pages WHERE slug IN ('tumores-renais', 'tumores-renais-resumos'));
CREATE TABLE topics_bk_tr_20261106 AS
  SELECT * FROM topics WHERE name = 'Tumores Renais' AND specialty_id = (SELECT id FROM specialties WHERE slug = 'nefrologia');
CREATE TABLE topic_content_bk_tr_20261106 AS
  SELECT * FROM topic_content WHERE topic_id IN (SELECT id FROM topics_bk_tr_20261106);

DO $lock$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pages','lessons','flashcard_items','flashcard_attempts','flashcard_progress','flashcard_theme_topics',
    'quiz_questions','quiz_attempts','simulado_review_flags','review_schedule','nav_items','topics','topic_content'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t || '_bk_tr_20261106');
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t || '_bk_tr_20261106');
  END LOOP;
END $lock$;

-- ── 1. Flashcards: remove the Nefrologia "Tumores Renais" theme ───────────────────────────
DELETE FROM review_schedule
 WHERE item_type = 'flashcard' AND item_id IN (SELECT id FROM flashcard_items_bk_tr_20261106);
DELETE FROM flashcard_theme_topics
 WHERE group_label = 'Tumores Renais' AND specialty_id = (SELECT id FROM specialties WHERE slug = 'nefrologia');
DELETE FROM topic_content
 WHERE topic_id IN (SELECT id FROM topics_bk_tr_20261106) AND resource_type = 'flashcards';
DELETE FROM flashcard_items WHERE id IN (SELECT id FROM flashcard_items_bk_tr_20261106);   -- cascades attempts/progress

-- ── 2. Revalida Up: the Nefrologia topic page retires (content is in Urologia now) ─────────
UPDATE pages
   SET status = 'draft', updated_at = now(),
       notes = concat_ws(E'\n', notes, 'retirado 2026-11-06: Tumores Renais passou para o Revalida Up de Urologia (Karina)')
 WHERE slug = 'tumores-renais-revalida-up';
UPDATE topic_content
   SET page_id = (SELECT id FROM pages WHERE slug = 'urologia-revalida-up')
 WHERE topic_id IN (SELECT id FROM topics_bk_tr_20261106) AND resource_type = 'revalida_up'
   AND page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais-revalida-up');

-- ── 3. Resumos: same page, new home under Outros → Urologia ──────────────────────────────
UPDATE pages
   SET specialty_id = (SELECT id FROM specialties WHERE slug = 'outros'),
       parent_id = (SELECT id FROM pages WHERE slug = 'urologia-resumos'),
       updated_at = now()
 WHERE slug = 'tumores-renais-resumos';
DELETE FROM nav_items
 WHERE source_page_id = (SELECT id FROM pages WHERE slug = 'nefrologia-resumos')
   AND target_page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais-resumos');
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT (SELECT id FROM pages WHERE slug = 'urologia-resumos'),
       (SELECT id FROM pages WHERE slug = 'tumores-renais-resumos'),
       8, 'Tumores Renais', 'cards';   -- after "Tumor de Testículo" (alphabetical, like the rest)

-- ── 4. Questões ─────────────────────────────────────────────────────────────────────────
-- 4a. Q7 · 2024.2 already lives in Urologia → drop the Nefrologia copy (no duplicate).
DELETE FROM review_schedule
 WHERE item_type = 'quiz_question' AND item_id IN
   (SELECT id FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais')
       AND question LIKE '%Questão 7 · Revalida 2024.2<%');
DELETE FROM quiz_questions
 WHERE page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais')
   AND question LIKE '%Questão 7 · Revalida 2024.2<%';
-- 4b. Q23 · 2022.1 moves (same row) into Urologia at position 7; positions 7..30 shift by one.
--     Two steps because (page_id, position) is UNIQUE.
UPDATE quiz_questions SET position = position + 1000
 WHERE page_id = (SELECT id FROM pages WHERE slug = 'urologia') AND position >= 7;
UPDATE quiz_questions SET position = position - 999
 WHERE page_id = (SELECT id FROM pages WHERE slug = 'urologia') AND position >= 1007;
UPDATE quiz_questions
   SET page_id = (SELECT id FROM pages WHERE slug = 'urologia'), position = 7
 WHERE page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais')
   AND question LIKE '%Questão 23 · Revalida 2022.1<%';
-- 4c. The emptied Nefrologia quiz page retires; its cards leave the Nefrologia hubs.
UPDATE pages
   SET status = 'draft', updated_at = now(),
       notes = concat_ws(E'\n', notes, 'retirado 2026-11-06: questões de Tumores Renais passaram para Outros → Urologia (Karina)')
 WHERE slug = 'tumores-renais';
DELETE FROM nav_items WHERE target_page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais');
UPDATE topic_content
   SET page_id = (SELECT id FROM pages WHERE slug = 'urologia')
 WHERE topic_id IN (SELECT id FROM topics_bk_tr_20261106) AND resource_type = 'quiz'
   AND page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais');

-- ── 5. Study-plan topic follows the theme to Outros ─────────────────────────────────────
UPDATE topics SET specialty_id = (SELECT id FROM specialties WHERE slug = 'outros'), updated_at = now()
 WHERE id IN (SELECT id FROM topics_bk_tr_20261106);

-- ── Post-check ──────────────────────────────────────────────────────────────────────────
DO $post$
DECLARE v int; s text;
BEGIN
  SELECT count(*) INTO v FROM flashcard_items f JOIN pages p ON p.id = f.page_id
   WHERE p.slug = 'nefrologia-flashcards' AND f.group_label = 'Tumores Renais';
  IF v <> 0 THEN RAISE EXCEPTION 'post: % Nefrologia Tumores Renais flashcards left', v; END IF;
  SELECT count(*) INTO v FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'urologia');
  IF v <> 31 THEN RAISE EXCEPTION 'post: Urologia has % questions, expected 31', v; END IF;
  SELECT count(*) INTO v FROM quiz_questions WHERE question LIKE '%Questão 7 · Revalida 2024.2<%' AND question LIKE '%Um homem de 72 anos%';
  IF v <> 1 THEN RAISE EXCEPTION 'post: % copies of Q7 · 2024.2', v; END IF;
  SELECT substring(question from '<strong>([^<]*)</strong>') INTO s FROM quiz_questions
   WHERE page_id = (SELECT id FROM pages WHERE slug = 'urologia') AND position = 7;
  IF s IS DISTINCT FROM 'Questão 23 · Revalida 2022.1' THEN RAISE EXCEPTION 'post: Urologia #7 is %', s; END IF;
  SELECT count(*) INTO v FROM quiz_questions WHERE page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais');
  IF v <> 0 THEN RAISE EXCEPTION 'post: % questions left on the Nefrologia page', v; END IF;
  SELECT count(*) INTO v FROM nav_items n JOIN pages p ON p.id = n.source_page_id
   WHERE p.specialty_id = (SELECT id FROM specialties WHERE slug = 'nefrologia')
     AND n.target_page_id IN (SELECT id FROM pages WHERE slug IN ('tumores-renais', 'tumores-renais-resumos', 'tumores-renais-revalida-up'));
  IF v <> 0 THEN RAISE EXCEPTION 'post: % Nefrologia hub cards still point at Tumores Renais', v; END IF;
  SELECT count(*) INTO v FROM topic_content tc JOIN pages p ON p.id = tc.page_id
   WHERE tc.topic_id IN (SELECT id FROM topics_bk_tr_20261106) AND p.status <> 'publish';
  IF v <> 0 THEN RAISE EXCEPTION 'post: % study-plan links of Tumores Renais point at unpublished pages', v; END IF;
END $post$;
