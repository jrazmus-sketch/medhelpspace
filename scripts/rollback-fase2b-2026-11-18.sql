-- rollback-fase2b-2026-11-18.sql — undoes scripts/apply-fase2b-2026-11-18.js exactly (rows, ids and timestamps), from the
-- `*_bk_fase2b` tables that run created. Run with scripts/run-sql.js (one transaction). The change log
-- (flashcard_item_changes) is append-only and keeps the record of what was applied.
-- If parsed/revalida-up-fase2b-import.sql was applied too, run parsed/revalida-up-fase2b-rollback.sql separately.
-- Order: this file BEFORE rollback-fase2-2026-11-18.sql (the reverse of the order they were applied in).

DO $$ BEGIN
  IF to_regclass('public.flashcard_items_bk_fase2b') IS NULL OR to_regclass('public.flashcard_groups_bk_fase2b') IS NULL
     OR to_regclass('public.lessons_bk_fase2b') IS NULL OR to_regclass('public.topic_content_bk_fase2b') IS NULL
     OR to_regclass('public.review_schedule_bk_fase2b') IS NULL OR to_regclass('public.audiocard_recordings_bk_fase2b') IS NULL THEN
    RAISE EXCEPTION 'backup tables *_bk_fase2b not found — nothing changed';
  END IF;
END $$;

ALTER TABLE flashcard_items DISABLE TRIGGER USER;
ALTER TABLE flashcard_groups DISABLE TRIGGER USER;
ALTER TABLE lessons DISABLE TRIGGER USER;
ALTER TABLE topic_content DISABLE TRIGGER USER;
SET CONSTRAINTS ALL DEFERRED;

-- Meu Plano links: exactly the rows of before.
DELETE FROM topic_content c WHERE NOT EXISTS (SELECT 1 FROM topic_content_bk_fase2b b WHERE b.id = c.id);
UPDATE topic_content c SET (topic_id, resource_type, page_id, question_filter, note, created_at, flashcard_group_id)
     = (b.topic_id, b.resource_type, b.page_id, b.question_filter, b.note, b.created_at, b.flashcard_group_id)
  FROM topic_content_bk_fase2b b WHERE b.id = c.id AND row(c.*) IS DISTINCT FROM row(b.*);

-- Recordings registered by the import.
DELETE FROM audiocard_recordings r WHERE NOT EXISTS (SELECT 1 FROM audiocard_recordings_bk_fase2b b WHERE b.id = r.id);

-- Cards: the inserted ones go, every other card returns to its row of before (text, group and position).
DELETE FROM flashcard_group_moves m WHERE m.reason LIKE 'Karina 18/11/2026 (Fase 2b)%';
DELETE FROM flashcard_items i WHERE NOT EXISTS (SELECT 1 FROM flashcard_items_bk_fase2b b WHERE b.id = i.id);
UPDATE flashcard_items i SET (page_id, group_position, group_label, position, text, answer, group_id, updated_at)
     = (b.page_id, b.group_position, b.group_label, -b.position, b.text, b.answer, b.group_id, b.updated_at)
  FROM flashcard_items_bk_fase2b b WHERE b.id = i.id AND row(i.*) IS DISTINCT FROM row(b.*);
UPDATE flashcard_items SET position = -position WHERE position < 0;

-- Groups: the archive group of Anemia Falciforme goes, the others return to before.
UPDATE flashcard_groups g SET (page_id, position, label, audiocard_lesson_id, created_at, updated_at, area)
     = (b.page_id, -b.position - 1000, b.label, b.audiocard_lesson_id, b.created_at, b.updated_at, b.area)
  FROM flashcard_groups_bk_fase2b b WHERE b.id = g.id AND row(g.*) IS DISTINCT FROM row(b.*);
DELETE FROM flashcard_groups g WHERE NOT EXISTS (SELECT 1 FROM flashcard_groups_bk_fase2b b WHERE b.id = g.id);
UPDATE flashcard_groups SET position = -position - 1000 WHERE position < 0;

-- AudioCards: every lesson returns to before (page, order, title, transcript, audio).
DELETE FROM lessons l USING pages p
 WHERE p.id = l.page_id AND p.slug LIKE '%-audiocards' AND NOT EXISTS (SELECT 1 FROM lessons_bk_fase2b b WHERE b.id = l.id)
   AND NOT EXISTS (SELECT 1 FROM flashcard_groups g WHERE g.audiocard_lesson_id = l.id);
UPDATE lessons l SET position = -l.position - 1000
  FROM lessons_bk_fase2b b WHERE b.id = l.id AND (l.page_id, l.position) IS DISTINCT FROM (b.page_id, b.position);
UPDATE lessons l SET (page_id, position, title, body_html, audio_url, audio_added_at, updated_at, audio_duration_seconds)
     = (b.page_id, b.position, b.title, b.body_html, b.audio_url, b.audio_added_at, b.updated_at, b.audio_duration_seconds)
  FROM lessons_bk_fase2b b WHERE b.id = l.id;

-- Revisão: the rows suspended by the import become active again.
UPDATE review_schedule rs SET suspended = b.suspended
  FROM review_schedule_bk_fase2b b WHERE b.id = rs.id AND rs.suspended IS DISTINCT FROM b.suspended;

ALTER TABLE flashcard_items ENABLE TRIGGER USER;
ALTER TABLE flashcard_groups ENABLE TRIGGER USER;
ALTER TABLE lessons ENABLE TRIGGER USER;
ALTER TABLE topic_content ENABLE TRIGGER USER;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM flashcard_items i FULL JOIN flashcard_items_bk_fase2b b ON b.id = i.id WHERE row(i.*) IS DISTINCT FROM row(b.*))
     OR EXISTS (SELECT 1 FROM flashcard_groups g FULL JOIN flashcard_groups_bk_fase2b b ON b.id = g.id WHERE row(g.*) IS DISTINCT FROM row(b.*))
     OR EXISTS (SELECT 1 FROM lessons l JOIN lessons_bk_fase2b b ON b.id = l.id WHERE row(l.*) IS DISTINCT FROM row(b.*))
     OR EXISTS (SELECT 1 FROM topic_content c FULL JOIN topic_content_bk_fase2b b ON b.id = c.id WHERE row(c.*) IS DISTINCT FROM row(b.*))
     OR EXISTS (SELECT 1 FROM audiocard_recordings r FULL JOIN audiocard_recordings_bk_fase2b b ON b.id = r.id WHERE row(r.*) IS DISTINCT FROM row(b.*)) THEN
    RAISE EXCEPTION 'rollback did not restore every row — nothing changed';
  END IF;
END $$;

DROP TABLE flashcard_items_bk_fase2b, flashcard_groups_bk_fase2b, lessons_bk_fase2b, topic_content_bk_fase2b,
           review_schedule_bk_fase2b, audiocard_recordings_bk_fase2b;
