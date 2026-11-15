-- Rollback of schema-patch-r2-topics-reorg.sql: topics, topic_content, the "artrite-infecciosa" page and
-- its hub cards return EXACTLY to the *_bk_r2 backups (timestamps included), the two new topics go.
-- Run BEFORE rolling back R1 (it clears the new topics from exam_questions when R1 is present).
-- Any topic or link created after R2 is lost — check first:
--   SELECT * FROM topics WHERE id NOT IN (SELECT id FROM topics_bk_r2);

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.topics_bk_r2') IS NULL OR to_regclass('public.topic_content_bk_r2') IS NULL
     OR to_regclass('public.pages_bk_r2') IS NULL OR to_regclass('public.nav_items_bk_r2') IS NULL THEN
    RAISE EXCEPTION 'R2 backups not found - nothing changed';
  END IF;
END $$;

-- exam questions that R1 put on the new topics go back to "no topic" (R1 re-run fills them again)
DO $$
BEGIN
  IF to_regclass('public.exam_questions') IS NOT NULL THEN
    DELETE FROM exam_question_secondary_topics
     WHERE topic_id IN (SELECT id FROM topics WHERE id NOT IN (SELECT id FROM topics_bk_r2));
    IF to_regclass('public.exam_questions_bk_r2') IS NOT NULL THEN
      -- exactly as before R2 (topic, status, note and timestamp)
      EXECUTE 'UPDATE exam_questions e SET topic_id = b.topic_id, topic_status = b.topic_status, topic_note = b.topic_note,
                      updated_at = b.updated_at
                 FROM exam_questions_bk_r2 b
                WHERE b.id = e.id AND (e.topic_id, e.topic_status, e.topic_note, e.updated_at)
                      IS DISTINCT FROM (b.topic_id, b.topic_status, b.topic_note, b.updated_at)';
      EXECUTE 'DROP TABLE exam_questions_bk_r2';
    END IF;
    UPDATE exam_questions SET topic_id = NULL
     WHERE topic_id IN (SELECT id FROM topics WHERE id NOT IN (SELECT id FROM topics_bk_r2));
  END IF;
END $$;

DELETE FROM topic_content WHERE id NOT IN (SELECT id FROM topic_content_bk_r2);
UPDATE topic_content c SET topic_id = b.topic_id, resource_type = b.resource_type, page_id = b.page_id,
       question_filter = b.question_filter, note = b.note, created_at = b.created_at
  FROM topic_content_bk_r2 b WHERE b.id = c.id AND (c.topic_id, c.resource_type, c.page_id) IS DISTINCT FROM (b.topic_id, b.resource_type, b.page_id);
DELETE FROM topics WHERE id NOT IN (SELECT id FROM topics_bk_r2);
UPDATE topics t SET name = b.name, slug = b.slug, specialty_id = b.specialty_id, source_page_id = b.source_page_id,
       incidence_count = b.incidence_count, exam_cycle_source = b.exam_cycle_source,
       is_pinned = b.is_pinned, notes = b.notes, created_at = b.created_at, updated_at = b.updated_at
  FROM topics_bk_r2 b WHERE b.id = t.id AND row(t.*) IS DISTINCT FROM row(b.*);

ALTER TABLE pages DISABLE TRIGGER pages_updated_at;
UPDATE pages p SET title = b.title, updated_at = b.updated_at FROM pages_bk_r2 b WHERE b.id = p.id;
ALTER TABLE pages ENABLE TRIGGER pages_updated_at;
UPDATE nav_items n SET label = b.label FROM nav_items_bk_r2 b WHERE b.id = n.id;

-- the identity of topics/topic_content may have advanced; harmless (ids are never reused)
DROP TABLE topics_bk_r2;
DROP TABLE topic_content_bk_r2;
DROP TABLE pages_bk_r2;
DROP TABLE nav_items_bk_r2;

COMMIT;
