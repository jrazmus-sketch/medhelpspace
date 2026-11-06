-- schema-patch-move-tumores-renais-urologia-rollback.sql
--
-- Exact undo of schema-patch-move-tumores-renais-urologia.sql, from its *_bk_tr_20261106
-- backup tables (original ids kept, OVERRIDING SYSTEM VALUE), then drops the backups.
-- Also restores the Urologia Revalida Up text as it was before Karina's updated file.
-- run-sql.js wraps the file in one transaction.

DO $guard$
BEGIN
  IF to_regclass('public.pages_bk_tr_20261106') IS NULL THEN
    RAISE EXCEPTION 'nothing to roll back (pages_bk_tr_20261106 does not exist)';
  END IF;
END $guard$;

-- 5. Topic back to its specialty; its study-plan links back to what they were.
UPDATE topics t SET specialty_id = b.specialty_id, updated_at = b.updated_at
  FROM topics_bk_tr_20261106 b WHERE t.id = b.id;
UPDATE topic_content tc SET page_id = b.page_id, question_filter = b.question_filter, note = b.note
  FROM topic_content_bk_tr_20261106 b WHERE tc.id = b.id;
INSERT INTO topic_content OVERRIDING SYSTEM VALUE
  SELECT * FROM topic_content_bk_tr_20261106 b WHERE NOT EXISTS (SELECT 1 FROM topic_content x WHERE x.id = b.id);

-- 4. Questões: Q23 back to Nefrologia, Urologia positions back, Q7 copy re-inserted.
UPDATE quiz_questions q SET page_id = b.page_id, position = b.position + 1000
  FROM quiz_questions_bk_tr_20261106 b WHERE q.id = b.id;
UPDATE quiz_questions q SET position = b.position
  FROM quiz_questions_bk_tr_20261106 b WHERE q.id = b.id;
INSERT INTO quiz_questions OVERRIDING SYSTEM VALUE
  SELECT * FROM quiz_questions_bk_tr_20261106 b WHERE NOT EXISTS (SELECT 1 FROM quiz_questions x WHERE x.id = b.id);
INSERT INTO quiz_attempts OVERRIDING SYSTEM VALUE
  SELECT * FROM quiz_attempts_bk_tr_20261106 b WHERE NOT EXISTS (SELECT 1 FROM quiz_attempts x WHERE x.id = b.id);
INSERT INTO simulado_review_flags OVERRIDING SYSTEM VALUE
  SELECT * FROM simulado_review_flags_bk_tr_20261106 ON CONFLICT DO NOTHING;

-- 3 + 4c. Hub cards: drop the Urologia card, restore the removed Nefrologia ones.
DELETE FROM nav_items
 WHERE source_page_id = (SELECT id FROM pages WHERE slug = 'urologia-resumos')
   AND target_page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais-resumos');
INSERT INTO nav_items OVERRIDING SYSTEM VALUE
  SELECT * FROM nav_items_bk_tr_20261106 b WHERE NOT EXISTS (SELECT 1 FROM nav_items x WHERE x.id = b.id);

-- 2 + 3 + 4c. Pages back (status, notes, specialty, parent, updated_at).
UPDATE pages p SET status = b.status, notes = b.notes, specialty_id = b.specialty_id,
                   parent_id = b.parent_id, updated_at = b.updated_at
  FROM pages_bk_tr_20261106 b WHERE p.id = b.id;
UPDATE pages p SET title = b.title FROM pages_bk_tr_20261106 b WHERE p.id = b.id;
UPDATE lessons l SET title = b.title, body_html = b.body_html, position = b.position
  FROM lessons_bk_tr_20261106 b WHERE l.id = b.id;

-- 1. Flashcards back, with their attempts/progress/review and theme→topic link.
INSERT INTO flashcard_items OVERRIDING SYSTEM VALUE
  SELECT * FROM flashcard_items_bk_tr_20261106 b WHERE NOT EXISTS (SELECT 1 FROM flashcard_items x WHERE x.id = b.id);
INSERT INTO flashcard_attempts OVERRIDING SYSTEM VALUE
  SELECT * FROM flashcard_attempts_bk_tr_20261106 ON CONFLICT DO NOTHING;
INSERT INTO flashcard_progress OVERRIDING SYSTEM VALUE
  SELECT * FROM flashcard_progress_bk_tr_20261106 ON CONFLICT DO NOTHING;
INSERT INTO flashcard_theme_topics OVERRIDING SYSTEM VALUE
  SELECT * FROM flashcard_theme_topics_bk_tr_20261106 ON CONFLICT DO NOTHING;
INSERT INTO review_schedule OVERRIDING SYSTEM VALUE
  SELECT * FROM review_schedule_bk_tr_20261106 b WHERE NOT EXISTS (SELECT 1 FROM review_schedule x WHERE x.id = b.id);

DROP TABLE pages_bk_tr_20261106, lessons_bk_tr_20261106, flashcard_items_bk_tr_20261106, flashcard_attempts_bk_tr_20261106,
  flashcard_progress_bk_tr_20261106, flashcard_theme_topics_bk_tr_20261106, quiz_questions_bk_tr_20261106,
  quiz_attempts_bk_tr_20261106, simulado_review_flags_bk_tr_20261106, review_schedule_bk_tr_20261106,
  nav_items_bk_tr_20261106, topics_bk_tr_20261106, topic_content_bk_tr_20261106;
