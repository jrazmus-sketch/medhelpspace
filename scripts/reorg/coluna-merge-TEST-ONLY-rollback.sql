-- Rollback of coluna-merge-TEST-ONLY.sql: every row the union touched returns EXACTLY to the *_bk_coluna
-- backups (the two groups, their cards and positions, both AudioCards, Meu Plano links, ranking rows,
-- Revisão rows, the reorganization log). Triggers are off only while rows are restored.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.flashcard_groups_bk_coluna') IS NULL THEN
    RAISE EXCEPTION 'Coluna backups not found - nothing changed';
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

-- the removed source group must exist again before its cards point back at it
SELECT pg_temp.restore_rows('flashcard_groups', 'flashcard_groups_bk_coluna');
SELECT pg_temp.restore_rows('flashcard_items', 'flashcard_items_bk_coluna');
SELECT pg_temp.restore_rows('lessons', 'lessons_bk_coluna',
  'page_id IN (SELECT p.id FROM pages p WHERE p.track_id = (SELECT id FROM tracks WHERE slug = ''audiocards''))');
SELECT pg_temp.restore_rows('topic_content', 'topic_content_bk_coluna');
SELECT pg_temp.restore_rows('review_schedule', 'review_schedule_bk_coluna', 'item_type = ''flashcard''');
SELECT pg_temp.restore_rows('flashcard_group_moves', 'flashcard_group_moves_bk_coluna');

ALTER TABLE flashcard_theme_topics DISABLE TRIGGER USER;
DELETE FROM flashcard_theme_topics;
INSERT INTO flashcard_theme_topics SELECT * FROM flashcard_theme_topics_bk_coluna;
ALTER TABLE flashcard_theme_topics ENABLE TRIGGER USER;

DROP TABLE flashcard_groups_bk_coluna, flashcard_items_bk_coluna, lessons_bk_coluna, topic_content_bk_coluna,
           flashcard_theme_topics_bk_coluna, review_schedule_bk_coluna, flashcard_group_moves_bk_coluna;

DROP FUNCTION pg_temp.restore_rows(text, text, text);
COMMIT;
