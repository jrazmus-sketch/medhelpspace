-- Meu Plano: the two additional MedVoice lessons of Cirurgia Geral (Karina 2026-11-19, 01h08, item 1).
--
-- "Diverticulite Complicada" and "Hérnia Estrangulada" became their own lessons on 18/11 (apply-medvoice-2026-11-18.js),
-- right after "Diverticulite" and "Hérnia". She authorized scheduling them in Meu Plano as ADDITIONAL lessons of the
-- existing topics Diverticulite and Hérnias: no new topic, nothing duplicated, incidence / ranking / priority untouched.
--
-- One new topic_content row each (resource_type 'medvoice', same page, question_filter → the lesson). The existing
-- links (main lessons) are not touched. derive.ts schedules every MedVoice link of a topic as its own audio activity,
-- main lesson first (link id order); the topic is concluded only when every lesson is heard.
--
-- Lessons are found by page slug + title (ids differ between databases). Re-run safe (NOT EXISTS).
-- Rollback: schema-patch-medvoice-aulas-adicionais-rollback.sql.

BEGIN;

DO $$
DECLARE
  r record;
  n int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('diverticulite', 'Diverticulite',  'Diverticulite Complicada'),
      ('hernias',       'Hérnia',         'Hérnia Estrangulada')
    ) v(topic_slug, main_title, extra_title)
  LOOP
    -- The topic must already open the main lesson, and the additional lesson must exist on the same page.
    SELECT count(*) INTO n
      FROM topic_content c
      JOIN topics t  ON t.id = c.topic_id
      JOIN lessons l ON l.id = (c.question_filter->>'lesson_id')::bigint
     WHERE t.slug = r.topic_slug AND c.resource_type = 'medvoice' AND l.title = r.main_title;
    IF n <> 1 THEN RAISE EXCEPTION 'topic % does not open the lesson "%" exactly once (found %)', r.topic_slug, r.main_title, n; END IF;

    SELECT count(*) INTO n
      FROM lessons l JOIN pages p ON p.id = l.page_id
     WHERE p.slug = 'cirurgia-geral-medvoice' AND l.title = r.extra_title AND l.audio_url IS NOT NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'lesson "%" with a recording not found exactly once (found %)', r.extra_title, n; END IF;

    INSERT INTO topic_content (topic_id, resource_type, page_id, question_filter)
    SELECT t.id, 'medvoice', p.id, jsonb_build_object('lesson_id', l.id::text, 'lesson_title', l.title)
      FROM topics t, lessons l JOIN pages p ON p.id = l.page_id
     WHERE t.slug = r.topic_slug
       AND p.slug = 'cirurgia-geral-medvoice' AND l.title = r.extra_title
       AND NOT EXISTS (
         SELECT 1 FROM topic_content c
          WHERE c.topic_id = t.id AND c.resource_type = 'medvoice' AND (c.question_filter->>'lesson_id')::bigint = l.id);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
