-- schema-patch-medvoice-audio-unavailable-rollback.sql — undoes schema-patch-medvoice-audio-unavailable.sql.
CREATE OR REPLACE VIEW study_plan_medvoice_lessons WITH (security_invoker = true) AS
SELECT l.id AS lesson_id, l.page_id, l.audio_duration_seconds AS duration_seconds, (l.audio_url IS NOT NULL) AS has_audio
  FROM lessons l
  JOIN pages p ON p.id = l.page_id AND p.track_id = 1 AND p.status = 'publish';
DROP TRIGGER IF EXISTS lessons_new_audio_clears_unavailable ON lessons;
DROP FUNCTION IF EXISTS lessons_new_audio_clears_unavailable();
ALTER TABLE lessons DISABLE TRIGGER USER;
ALTER TABLE lessons DROP COLUMN IF EXISTS audio_unavailable;
ALTER TABLE lessons ENABLE TRIGGER USER;
NOTIFY pgrst, 'reload schema';
