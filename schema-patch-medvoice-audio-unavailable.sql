-- schema-patch-medvoice-audio-unavailable.sql
--
-- Karina 2026-11-18 (19h21): Meu Plano must not schedule an audio activity whose recording is not available.
-- Two MedVoice lessons have an address but no file on the CDN (404): "Maus-Tratos e Prevenção de Acidentes na
-- Infância" and "Neuroblastoma" (Pediatria). She does not want the old files recovered (a full MedVoice
-- replacement is coming), so the lessons are only MARKED: nothing is deleted, the address is kept.
--
--   lessons.audio_unavailable   true = the file of audio_url is known to be missing.
--   A new audio_url clears the mark by itself (trigger), so the next delivery needs no extra step.
--   study_plan_medvoice_lessons.has_audio = has an address AND is not marked → the plan reads it.
--
-- Idempotent. Rollback: schema-patch-medvoice-audio-unavailable-rollback.sql. Rollbacks run in the REVERSE order of
-- the patches: an older rollback that compares whole `lessons` rows with its backup needs this column gone first.

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS audio_unavailable boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN lessons.audio_unavailable IS
  'true = the file of audio_url is known to be missing on the CDN. Meu Plano does not schedule the lesson. Cleared automatically when audio_url changes.';

CREATE OR REPLACE FUNCTION lessons_new_audio_clears_unavailable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.audio_url IS DISTINCT FROM OLD.audio_url THEN NEW.audio_unavailable := false; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lessons_new_audio_clears_unavailable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lessons_new_audio_clears_unavailable ON lessons;
CREATE TRIGGER lessons_new_audio_clears_unavailable
  BEFORE UPDATE OF audio_url ON lessons
  FOR EACH ROW EXECUTE FUNCTION lessons_new_audio_clears_unavailable();

-- The two recordings that are missing (checked on the CDN on 2026-11-18). Keyed by address, never by id.
-- The lesson's own content does not change, so its updated_at is left as it is.
ALTER TABLE lessons DISABLE TRIGGER lessons_updated_at;
UPDATE lessons SET audio_unavailable = true
 WHERE audio_url IN (
   'https://medhelpspace.b-cdn.net/MedVoice-Audio/pediatria-feito/maus-tratos-e-prevencao-de-acidentes-na-infancia-m.mp3',
   'https://medhelpspace.b-cdn.net/MedVoice-Audio/pediatria-feito/neuroblastoma-m.mp3')
   AND NOT audio_unavailable;
ALTER TABLE lessons ENABLE TRIGGER lessons_updated_at;

CREATE OR REPLACE VIEW study_plan_medvoice_lessons WITH (security_invoker = true) AS
SELECT l.id AS lesson_id, l.page_id, l.audio_duration_seconds AS duration_seconds,
       (l.audio_url IS NOT NULL AND NOT l.audio_unavailable) AS has_audio
  FROM lessons l
  JOIN pages p ON p.id = l.page_id AND p.track_id = 1 AND p.status = 'publish';

-- Expect 2 marked; has_audio false for them.
SELECT l.id, l.title, l.audio_unavailable, v.has_audio
  FROM lessons l LEFT JOIN study_plan_medvoice_lessons v ON v.lesson_id = l.id
 WHERE l.audio_unavailable;

NOTIFY pgrst, 'reload schema';
