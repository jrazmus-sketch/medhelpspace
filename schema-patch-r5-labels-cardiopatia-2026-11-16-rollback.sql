-- schema-patch-r5-labels-cardiopatia-2026-11-16-rollback.sql — restores everything from the *_bk_nov16 backups.
BEGIN;

UPDATE pages p SET status = b.status, specialty_id = b.specialty_id, parent_id = b.parent_id
FROM pages_bk_nov16 b WHERE b.id = p.id;

UPDATE quiz_questions q SET question = b.question FROM quiz_questions_bk_nov16 b WHERE b.id = q.id;

-- lessons: park, then restore page + position
UPDATE lessons l SET position = -l.id FROM lessons_bk_nov16 b WHERE b.id = l.id;
UPDATE lessons l SET page_id = b.page_id, position = b.position FROM lessons_bk_nov16 b WHERE b.id = l.id;
UPDATE lesson_completions c SET page_id = b.page_id FROM lesson_completions_bk_nov16 b
 WHERE b.user_id = c.user_id AND b.lesson_id = c.lesson_id;

UPDATE nav_items n SET position = -n.id FROM nav_items_bk_nov16 b WHERE b.id = n.id;
UPDATE nav_items n SET source_page_id = b.source_page_id, position = b.position FROM nav_items_bk_nov16 b WHERE b.id = n.id;

DROP TABLE pages_bk_nov16, quiz_questions_bk_nov16, lessons_bk_nov16, lesson_completions_bk_nov16,
           nav_items_bk_nov16, topics_incidence_bk_nov16;

COMMIT;
