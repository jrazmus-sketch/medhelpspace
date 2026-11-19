-- rollback-medvoice-2026-11-18.sql — undoes scripts/apply-medvoice-2026-11-18.js exactly (rows, ids, order and
-- timestamps), from the `lessons_bk_medvoice_20261118` table that run created. Run with scripts/run-sql.js (one
-- transaction). Rollbacks run in the REVERSE order of what was applied.
-- The two lessons the run created (Diverticulite Complicada, Hérnia Estrangulada) are removed: they did not exist
-- before. Any listening position or conclusion a student recorded ON THOSE TWO after the publication goes with them
-- (lesson_progress / lesson_completions cascade) — every other student record is untouched.

DO $$ BEGIN
  IF to_regclass('public.lessons_bk_medvoice_20261118') IS NULL THEN
    RAISE EXCEPTION 'backup table lessons_bk_medvoice_20261118 not found — nothing changed';
  END IF;
END $$;

ALTER TABLE lessons DISABLE TRIGGER USER;

-- The lessons created by the run (on the three pages, not in the backup).
DELETE FROM lessons l
 WHERE l.page_id IN (SELECT DISTINCT page_id FROM lessons_bk_medvoice_20261118)
   AND NOT EXISTS (SELECT 1 FROM lessons_bk_medvoice_20261118 b WHERE b.id = l.id);

-- Order first (UNIQUE (page_id, position) is not deferrable: through negative positions), then every column.
UPDATE lessons l SET position = -b.position
  FROM lessons_bk_medvoice_20261118 b WHERE b.id = l.id AND l.position IS DISTINCT FROM b.position;
UPDATE lessons SET position = -position WHERE position < 0;
UPDATE lessons l SET (title, body_html, audio_url, audio_added_at, updated_at, audio_duration_seconds, audio_unavailable)
     = (b.title, b.body_html, b.audio_url, b.audio_added_at, b.updated_at, b.audio_duration_seconds, b.audio_unavailable)
  FROM lessons_bk_medvoice_20261118 b WHERE b.id = l.id;

ALTER TABLE lessons ENABLE TRIGGER USER;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM lessons l JOIN lessons_bk_medvoice_20261118 b ON b.id = l.id
              WHERE (l.page_id, l.position, l.title, l.body_html, l.audio_url, l.audio_added_at, l.created_at, l.updated_at, l.audio_duration_seconds, l.audio_unavailable)
                    IS DISTINCT FROM (b.page_id, b.position, b.title, b.body_html, b.audio_url, b.audio_added_at, b.created_at, b.updated_at, b.audio_duration_seconds, b.audio_unavailable))
     OR (SELECT count(*) FROM lessons l WHERE l.page_id IN (SELECT DISTINCT page_id FROM lessons_bk_medvoice_20261118)) <> (SELECT count(*) FROM lessons_bk_medvoice_20261118) THEN
    RAISE EXCEPTION 'rollback did not restore every lesson — nothing changed';
  END IF;
END $$;

DROP TABLE lessons_bk_medvoice_20261118;
