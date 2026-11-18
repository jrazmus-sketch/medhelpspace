-- Rollback of schema-patch-fase1-2026-11-17.sql: every record returns to its section and position, the 27
-- originals to their previous topic and note, the topics / Meu Plano links / hub card to their exact rows, the
-- three Flashcards groups + AudioCards and the three Revalida Up pages to the published area, the Microangiopatias
-- section to "publish"; the pages and topics the patch created go. Triggers are off only while rows are restored,
-- so nothing is regenerated; incidence is recalculated at the end (it must equal the backup).
-- Anything changed on these rows after the patch is lost — compare with the *_bk_fase1 backups first.
-- The Revalida Up texts are a separate file: run parsed/revalida-up-fase1-rollback.sql AFTER this one.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.quiz_questions_bk_fase1') IS NULL OR to_regclass('public.topic_content_bk_fase1') IS NULL THEN
    RAISE EXCEPTION 'Fase 1 backups not found - nothing changed';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.restore_rows(p_tbl text, p_bk text, p_scope text DEFAULT 'true') RETURNS void
LANGUAGE plpgsql AS $$
DECLARE cols text; sets text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg(quote_ident(column_name) || ' = b.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols, sets
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = p_tbl AND is_generated = 'NEVER' AND column_name <> 'id';
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', p_tbl);
  EXECUTE format('DELETE FROM public.%I t WHERE (%s) AND NOT EXISTS (SELECT 1 FROM public.%I b WHERE b.id = t.id)', p_tbl, p_scope, p_bk);
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_tbl AND column_name = 'position') THEN
    EXECUTE format('UPDATE public.%I t SET position = -t.position - 10000 FROM public.%I b WHERE b.id = t.id AND row(t.*) IS DISTINCT FROM row(b.*)', p_tbl, p_bk);
  END IF;
  EXECUTE format('UPDATE public.%I t SET %s FROM public.%I b WHERE b.id = t.id AND row(t.*) IS DISTINCT FROM row(b.*)', p_tbl, sets, p_bk);
  EXECUTE format('INSERT INTO public.%I (id, %s) OVERRIDING SYSTEM VALUE SELECT id, %s FROM public.%I b WHERE NOT EXISTS (SELECT 1 FROM public.%I t WHERE t.id = b.id)',
                 p_tbl, cols, cols, p_bk, p_tbl);
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', p_tbl);
END $$;

-- classification first (new topics can only go once nothing references them)
SELECT pg_temp.restore_rows('exam_questions', 'exam_questions_bk_fase1', 'false');
SELECT pg_temp.restore_rows('topic_content', 'topic_content_bk_fase1');
SELECT pg_temp.restore_rows('topics', 'topics_bk_fase1');

-- the records and their history
SELECT pg_temp.restore_rows('quiz_attempts', 'quiz_attempts_bk_fase1', 'false');
SELECT pg_temp.restore_rows('review_schedule', 'review_schedule_bk_fase1', 'false');
SELECT pg_temp.restore_rows('quiz_questions', 'quiz_questions_bk_fase1', 'false');

-- Flashcards groups + AudioCards back to their decks
SELECT pg_temp.restore_rows('flashcard_groups', 'flashcard_groups_bk_fase1', 'false');
SELECT pg_temp.restore_rows('flashcard_items', 'flashcard_items_bk_fase1', 'false');
SELECT pg_temp.restore_rows('lessons', 'lessons_bk_fase1', 'false');
DELETE FROM flashcard_group_moves WHERE operation = 'retire_group' AND reason LIKE '%Fase 1%';

-- hub card, then the pages: four back to their exact rows, the eight created by the patch go
SELECT pg_temp.restore_rows('nav_items', 'nav_items_bk_fase1',
  'source_page_id = (SELECT id FROM pages WHERE slug = ''hematologia-quiz'')');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM quiz_questions q JOIN pages p ON p.id = q.page_id
              WHERE p.slug IN ('questoes-copias-despublicadas', 'reacoes-transfusionais'))
     OR EXISTS (SELECT 1 FROM flashcard_groups g JOIN pages p ON p.id = g.page_id WHERE p.slug LIKE 'retirados-%'
                 AND p.slug NOT IN ('retirados-cirurgia-geral-flashcards', 'retirados-cirurgia-geral-audiocards')) THEN
    RAISE EXCEPTION 'Fase 1 rollback: a page created by the patch is not empty - nothing changed';
  END IF;
END $$;
SELECT pg_temp.restore_rows('pages', 'pages_bk_fase1',
  'slug IN (''microangiopatias-tromboticas'', ''microangiopatias-tromboticas-revalida-up'', ''ventilacao-mecanica-revalida-up'',
            ''delirium-revalida-up'', ''questoes-copias-despublicadas'', ''reacoes-transfusionais'',
            ''retirados-hematologia-flashcards'', ''retirados-hematologia-audiocards'', ''retirados-emergencia-flashcards'',
            ''retirados-emergencia-audiocards'', ''retirados-neurologia-flashcards'', ''retirados-neurologia-audiocards'')');

SELECT refresh_topic_incidence();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM topics t FULL JOIN topics_bk_fase1 b ON b.id = t.id
              WHERE t.id IS NULL OR b.id IS NULL OR (t.name, t.incidence_count, t.priority_tier) IS DISTINCT FROM (b.name, b.incidence_count, b.priority_tier)) THEN
    RAISE EXCEPTION 'Fase 1 rollback: topics differ from the backup after the restore';
  END IF;
  IF EXISTS (SELECT 1 FROM quiz_questions q JOIN quiz_questions_bk_fase1 b ON b.id = q.id
              WHERE (q.page_id, q.position) IS DISTINCT FROM (b.page_id, b.position)) THEN
    RAISE EXCEPTION 'Fase 1 rollback: a record is not back at its section/position';
  END IF;
END $$;

DROP TABLE quiz_questions_bk_fase1, exam_questions_bk_fase1, topics_bk_fase1, topic_content_bk_fase1, pages_bk_fase1,
           nav_items_bk_fase1, flashcard_groups_bk_fase1, flashcard_items_bk_fase1, lessons_bk_fase1,
           quiz_attempts_bk_fase1, review_schedule_bk_fase1;
DROP FUNCTION pg_temp.restore_rows(text, text, text);
COMMIT;
