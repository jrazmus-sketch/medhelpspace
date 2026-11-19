-- Rollback of schema-patch-medvoice-aulas-adicionais.sql: the two additional lessons leave Meu Plano (the lessons
-- themselves stay published on the MedVoice page; students' history is on the lesson, never on the link).

BEGIN;

DELETE FROM topic_content c
 USING topics t, lessons l, pages p
 WHERE c.topic_id = t.id
   AND c.resource_type = 'medvoice'
   AND l.id = (c.question_filter->>'lesson_id')::bigint
   AND p.id = l.page_id AND p.slug = 'cirurgia-geral-medvoice'
   AND (t.slug, l.title) IN (('diverticulite', 'Diverticulite Complicada'), ('hernias', 'Hérnia Estrangulada'));

COMMIT;

NOTIFY pgrst, 'reload schema';
