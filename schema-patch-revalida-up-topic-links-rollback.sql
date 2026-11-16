-- Rollback of schema-patch-revalida-up-topic-links.sql: the 24 links go, topic_content returns EXACTLY to the
-- topic_content_bk_ru backup, the check view goes. Links created after the patch are lost — compare first.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.topic_content_bk_ru') IS NULL THEN
    RAISE EXCEPTION 'Revalida Up links backup not found - nothing changed';
  END IF;
END $$;

DROP VIEW IF EXISTS revalida_up_link_check;
ALTER TABLE topic_content DISABLE TRIGGER USER;
DELETE FROM topic_content t WHERE NOT EXISTS (SELECT 1 FROM topic_content_bk_ru b WHERE b.id = t.id);
ALTER TABLE topic_content ENABLE TRIGGER USER;
DROP TABLE topic_content_bk_ru;

COMMIT;
