-- Rollback of schema-patch-exam-questions.sql (R1) + its data file (parsed/exam-questions-data.sql).
-- Nothing outside R1 references these objects. Run AFTER rolling back R2 (R2 depends on nothing here,
-- but its rollback clears the new topics from exam_questions when R1 is still present).

BEGIN;

DROP VIEW IF EXISTS topic_question_links, topic_incidence_live, exam_question_registry;
ALTER TABLE quiz_questions DROP COLUMN IF EXISTS exam_question_id;
DROP TABLE IF EXISTS exam_question_secondary_topics, exam_questions;
DROP FUNCTION IF EXISTS exam_question_secondary_not_primary();
DROP FUNCTION IF EXISTS exam_edition_rank(text);
DELETE FROM topic_content WHERE resource_type = 'resumo';
ALTER TABLE topic_content DROP CONSTRAINT IF EXISTS topic_content_resource_type_check;
ALTER TABLE topic_content ADD CONSTRAINT topic_content_resource_type_check
  CHECK (resource_type IN ('quiz', 'simulado', 'flashcards', 'medvoice', 'revalida_up'));

COMMIT;
