-- Rollback of schema-patch-trm-cirurgia-geral-retirada.sql: the Cirurgia Geral Trauma Raquimedular Flashcards
-- group, its AudioCard and its Revalida Up page return to the published area EXACTLY as before (decks, positions,
-- timestamps), the Meu Plano links of Trauma Raquimedular point at them again, the two "retirados-…" pages and
-- the 'retire_group' log rows go. Triggers are off only while rows are restored, so nothing is regenerated.
-- Anything changed on these tables after the patch is lost — compare with the *_bk_trm backups first.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.flashcard_groups_bk_trm') IS NULL THEN
    RAISE EXCEPTION 'TRM backups not found - nothing changed';
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

SELECT pg_temp.restore_rows('flashcard_groups', 'flashcard_groups_bk_trm');
SELECT pg_temp.restore_rows('flashcard_items', 'flashcard_items_bk_trm');
SELECT pg_temp.restore_rows('lessons', 'lessons_bk_trm',
  'page_id IN (SELECT p.id FROM pages p WHERE p.track_id = (SELECT id FROM tracks WHERE slug = ''audiocards'') OR p.slug = ''trauma-raquimedular-revalida-up'')');
SELECT pg_temp.restore_rows('topic_content', 'topic_content_bk_trm');
SELECT pg_temp.restore_rows('review_schedule', 'review_schedule_bk_trm', 'item_type = ''flashcard''');
-- the Revalida Up page back to its exact row; the two "retirados-…" pages go (nothing points at them any more)
SELECT pg_temp.restore_rows('pages', 'pages_bk_trm',
  'slug IN (''trauma-raquimedular-revalida-up'', ''retirados-cirurgia-geral-flashcards'', ''retirados-cirurgia-geral-audiocards'')');

DELETE FROM flashcard_group_moves WHERE operation = 'retire_group';

DROP TABLE flashcard_groups_bk_trm, flashcard_items_bk_trm, lessons_bk_trm, topic_content_bk_trm, pages_bk_trm,
           review_schedule_bk_trm;
DROP FUNCTION pg_temp.restore_rows(text, text, text);
COMMIT;
