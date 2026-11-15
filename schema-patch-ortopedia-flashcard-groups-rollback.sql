-- Rollback of schema-patch-ortopedia-flashcard-groups.sql: every row the moves touched returns EXACTLY to
-- the *_bk_orto_fc backups (positions, decks, timestamps), the area column and the log table go.
-- Triggers are switched off only while the rows are restored, so nothing is regenerated.
-- Anything created after the patch on these tables is lost — compare with the backups first.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.flashcard_groups_bk_orto_fc') IS NULL THEN
    RAISE EXCEPTION 'Ortopedia backups not found - nothing changed';
  END IF;
END $$;

-- Restore the rows of p_tbl (keyed by id) from p_bk, limited to p_scope (rows outside it are not touched).
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

ALTER TABLE flashcard_groups DROP COLUMN IF EXISTS area;   -- the backup predates the column
SELECT pg_temp.restore_rows('flashcard_groups', 'flashcard_groups_bk_orto_fc');
SELECT pg_temp.restore_rows('flashcard_items', 'flashcard_items_bk_orto_fc');
SELECT pg_temp.restore_rows('lessons', 'lessons_bk_orto_fc',
  'page_id IN (SELECT p.id FROM pages p WHERE p.track_id = (SELECT id FROM tracks WHERE slug = ''audiocards''))');
SELECT pg_temp.restore_rows('topic_content', 'topic_content_bk_orto_fc');
SELECT pg_temp.restore_rows('review_schedule', 'review_schedule_bk_orto_fc', 'item_type = ''flashcard''');

ALTER TABLE flashcard_theme_topics DISABLE TRIGGER USER;
DELETE FROM flashcard_theme_topics;
INSERT INTO flashcard_theme_topics SELECT * FROM flashcard_theme_topics_bk_orto_fc;
ALTER TABLE flashcard_theme_topics ENABLE TRIGGER USER;

DROP TABLE flashcard_group_moves;
DROP TABLE flashcard_groups_bk_orto_fc, flashcard_items_bk_orto_fc, lessons_bk_orto_fc, topic_content_bk_orto_fc,
           flashcard_theme_topics_bk_orto_fc, review_schedule_bk_orto_fc;

DROP FUNCTION pg_temp.restore_rows(text, text, text);
COMMIT;
