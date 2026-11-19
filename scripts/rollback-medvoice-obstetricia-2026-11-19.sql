-- rollback-medvoice-obstetricia-2026-11-19.sql — undoes scripts/apply-medvoice-obstetricia-2026-11-19.js exactly (rows, ids, order and
-- timestamps), from the `lessons_bk_medvoice_obst_20261119` table that run created. Run with scripts/run-sql.js (one
-- transaction). Rollbacks run in the REVERSE order of what was applied.
-- The run creates no lesson; the delete below is a guard that finds nothing. Student records are never touched.

DO $$ BEGIN
  IF to_regclass('public.lessons_bk_medvoice_obst_20261119') IS NULL THEN
    RAISE EXCEPTION 'backup table lessons_bk_medvoice_obst_20261119 not found — nothing changed';
  END IF;
END $$;

ALTER TABLE lessons DISABLE TRIGGER USER;

-- Lessons on the page that are not in the backup (none expected).
DELETE FROM lessons l
 WHERE l.page_id IN (SELECT DISTINCT page_id FROM lessons_bk_medvoice_obst_20261119)
   AND NOT EXISTS (SELECT 1 FROM lessons_bk_medvoice_obst_20261119 b WHERE b.id = l.id);

-- Order first (UNIQUE (page_id, position) is not deferrable: through negative positions), then every column.
UPDATE lessons l SET position = -b.position
  FROM lessons_bk_medvoice_obst_20261119 b WHERE b.id = l.id AND l.position IS DISTINCT FROM b.position;
UPDATE lessons SET position = -position WHERE position < 0;
UPDATE lessons l SET (title, body_html, audio_url, audio_added_at, updated_at, audio_duration_seconds, audio_unavailable)
     = (b.title, b.body_html, b.audio_url, b.audio_added_at, b.updated_at, b.audio_duration_seconds, b.audio_unavailable)
  FROM lessons_bk_medvoice_obst_20261119 b WHERE b.id = l.id;

ALTER TABLE lessons ENABLE TRIGGER USER;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM lessons l JOIN lessons_bk_medvoice_obst_20261119 b ON b.id = l.id
              WHERE (l.page_id, l.position, l.title, l.body_html, l.audio_url, l.audio_added_at, l.created_at, l.updated_at, l.audio_duration_seconds, l.audio_unavailable)
                    IS DISTINCT FROM (b.page_id, b.position, b.title, b.body_html, b.audio_url, b.audio_added_at, b.created_at, b.updated_at, b.audio_duration_seconds, b.audio_unavailable))
     OR (SELECT count(*) FROM lessons l WHERE l.page_id IN (SELECT DISTINCT page_id FROM lessons_bk_medvoice_obst_20261119)) <> (SELECT count(*) FROM lessons_bk_medvoice_obst_20261119) THEN
    RAISE EXCEPTION 'rollback did not restore every lesson — nothing changed';
  END IF;
END $$;

DROP TABLE lessons_bk_medvoice_obst_20261119;
