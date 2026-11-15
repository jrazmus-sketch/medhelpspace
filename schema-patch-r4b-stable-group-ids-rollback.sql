-- Rollback of schema-patch-r4b-stable-group-ids.sql: both link tables return EXACTLY to the backups taken
-- by the patch (topic_content_bk_r4b, flashcard_theme_topics_bk_r4b). Run only while those backups exist.
-- Any link created after the patch is lost — check first:
--   SELECT * FROM topic_content WHERE id NOT IN (SELECT id FROM topic_content_bk_r4b);

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.topic_content_bk_r4b') IS NULL OR to_regclass('public.flashcard_theme_topics_bk_r4b') IS NULL THEN
    RAISE EXCEPTION 'R4b backups not found - nothing changed';
  END IF;
END $$;

DROP TRIGGER IF EXISTS flashcard_groups_propagate_links ON flashcard_groups;
DROP TRIGGER IF EXISTS topic_content_sync_flashcard_group ON topic_content;
DROP TRIGGER IF EXISTS flashcard_theme_topics_sync_group ON flashcard_theme_topics;
DROP FUNCTION IF EXISTS flashcard_groups_propagate_links();
DROP FUNCTION IF EXISTS topic_content_sync_flashcard_group();
DROP FUNCTION IF EXISTS flashcard_theme_topics_sync_group();

ALTER TABLE topic_content DROP CONSTRAINT IF EXISTS topic_content_flashcards_group_required;
ALTER TABLE topic_content DROP COLUMN IF EXISTS flashcard_group_id;
UPDATE topic_content c SET topic_id = b.topic_id, resource_type = b.resource_type, page_id = b.page_id,
       question_filter = b.question_filter, note = b.note
  FROM topic_content_bk_r4b b WHERE b.id = c.id;
DELETE FROM topic_content WHERE id NOT IN (SELECT id FROM topic_content_bk_r4b);
INSERT INTO topic_content (id, topic_id, resource_type, page_id, question_filter, note, created_at)
  OVERRIDING SYSTEM VALUE
  SELECT id, topic_id, resource_type, page_id, question_filter, note, created_at FROM topic_content_bk_r4b b
   WHERE NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.id = b.id);

DROP INDEX IF EXISTS flashcard_theme_topics_group_key;
ALTER TABLE flashcard_theme_topics DROP COLUMN IF EXISTS group_id;
DELETE FROM flashcard_theme_topics;
INSERT INTO flashcard_theme_topics SELECT * FROM flashcard_theme_topics_bk_r4b;

DROP FUNCTION IF EXISTS flashcard_label_key(text);
DROP TABLE topic_content_bk_r4b;
DROP TABLE flashcard_theme_topics_bk_r4b;

COMMIT;
