-- Fresh backup right before the single source goes live on prod (Karina 2026-11-14, condition 5).
-- Full copies of every table the switch touches; schema-patch-single-source-cards.sql also writes
-- lessons_audiocards_bk_single_source (the transcripts) itself. RLS on, no policies = service role only.
-- Drop these once Karina confirms the single source in production.

CREATE TABLE IF NOT EXISTS public.flashcard_items_bk_ss_20261114 AS SELECT * FROM public.flashcard_items;
CREATE TABLE IF NOT EXISTS public.lessons_audiocards_bk_ss_20261114 AS
  SELECT l.* FROM public.lessons l JOIN public.pages p ON p.id = l.page_id
  WHERE p.slug LIKE '%-audiocards' AND p.slug <> 'audiocards';
CREATE TABLE IF NOT EXISTS public.topic_content_bk_ss_20261114 AS SELECT * FROM public.topic_content;
CREATE TABLE IF NOT EXISTS public.flashcard_theme_topics_bk_ss_20261114 AS SELECT * FROM public.flashcard_theme_topics;

ALTER TABLE public.flashcard_items_bk_ss_20261114 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons_audiocards_bk_ss_20261114 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_content_bk_ss_20261114 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_theme_topics_bk_ss_20261114 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flashcard_items_bk_ss_20261114, public.lessons_audiocards_bk_ss_20261114,
              public.topic_content_bk_ss_20261114, public.flashcard_theme_topics_bk_ss_20261114
  FROM anon, authenticated;
