-- schema-patch-r4-coluna-links.sql
--
-- R4 (Karina 2026-11-12, AUTHORIZED for production): fix the stale Meu Plano links of
-- the two spine topics. Links only — no Revalida Up, flashcard or MedVoice content
-- is changed.
--
-- Patologias da Coluna Vertebral (topic 76):
--   • its flashcard link named the group "Patologias da Coluna Vertebral", which no
--     longer exists; the Neurologia deck's group is now "Coluna Vertebral e Trauma
--     Raquimedular" (30 cards) → topic_content + flashcard_theme_topics follow it;
--   • it had no Revalida Up link although "Coluna Vertebral e Trauma Raquimedular
--     Revalida Up" (page coluna-vertebral-trauma-raquimedular-revalida-up) exists → added.
-- Trauma Raquimedular (topic 123):
--   • flashcard_theme_topics carried TWO rows for it: the valid "Trauma Raquimedular"
--     (Cirurgia Geral deck, 25 cards) and a lowercase "trauma raquimedular" that
--     matches no group → the lowercase row is removed, the valid one kept;
--   • its topic_content flashcard link spelled the group in lowercase → corrected to
--     the real label (same deck, same cards).
--
-- Idempotent. Apply to BOTH databases.
-- Rollback: restore from topic_content_bk_r4_20261112 / flashcard_theme_topics_bk_r4_20261112:
--   DELETE FROM topic_content WHERE topic_id IN (76,123);
--   INSERT INTO topic_content (id, topic_id, resource_type, page_id, question_filter, created_at)
--     OVERRIDING SYSTEM VALUE SELECT id, topic_id, resource_type, page_id, question_filter, created_at
--     FROM topic_content_bk_r4_20261112;
--   DELETE FROM flashcard_theme_topics WHERE topic_id IN (76,123);
--   INSERT INTO flashcard_theme_topics SELECT * FROM flashcard_theme_topics_bk_r4_20261112;

BEGIN;

CREATE TABLE IF NOT EXISTS topic_content_bk_r4_20261112 AS
  SELECT * FROM topic_content WHERE topic_id IN (76, 123);
CREATE TABLE IF NOT EXISTS flashcard_theme_topics_bk_r4_20261112 AS
  SELECT * FROM flashcard_theme_topics WHERE topic_id IN (76, 123);
ALTER TABLE topic_content_bk_r4_20261112 ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_theme_topics_bk_r4_20261112 ENABLE ROW LEVEL SECURITY;

-- Guards: the target groups and page must exist exactly as named, or nothing changes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM flashcard_items f JOIN pages p ON p.id = f.page_id
                 WHERE p.slug = 'neurologia-flashcards' AND f.group_label = 'Coluna Vertebral e Trauma Raquimedular') THEN
    RAISE EXCEPTION 'R4: group "Coluna Vertebral e Trauma Raquimedular" not found in neurologia-flashcards';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM flashcard_items f JOIN pages p ON p.id = f.page_id
                 WHERE p.slug = 'cirurgia-geral-flashcards' AND f.group_label = 'Trauma Raquimedular') THEN
    RAISE EXCEPTION 'R4: group "Trauma Raquimedular" not found in cirurgia-geral-flashcards';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'coluna-vertebral-trauma-raquimedular-revalida-up'
                 AND view = 'revalida-up' AND status = 'publish') THEN
    RAISE EXCEPTION 'R4: Revalida Up page coluna-vertebral-trauma-raquimedular-revalida-up not published';
  END IF;
END $$;

-- 76 · flashcards → the current Neurologia group
UPDATE topic_content
   SET question_filter = jsonb_build_object('group_label', 'Coluna Vertebral e Trauma Raquimedular')
 WHERE topic_id = 76 AND resource_type = 'flashcards'
   AND question_filter->>'group_label' = 'Patologias da Coluna Vertebral';
UPDATE flashcard_theme_topics
   SET group_label = 'Coluna Vertebral e Trauma Raquimedular', updated_at = now()
 WHERE specialty_id = (SELECT id FROM specialties WHERE slug = 'neurologia')
   AND group_label = 'Patologias da Coluna Vertebral' AND topic_id = 76
   AND NOT EXISTS (SELECT 1 FROM flashcard_theme_topics x
                   WHERE x.specialty_id = flashcard_theme_topics.specialty_id
                     AND x.group_label = 'Coluna Vertebral e Trauma Raquimedular');

-- 76 · Revalida Up → the existing Coluna Vertebral e Trauma Raquimedular page
INSERT INTO topic_content (topic_id, resource_type, page_id)
SELECT 76, 'revalida_up', p.id FROM pages p
 WHERE p.slug = 'coluna-vertebral-trauma-raquimedular-revalida-up'
   AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = 76 AND c.resource_type = 'revalida_up');

-- 123 · drop the lowercase theme row, keep "Trauma Raquimedular"
DELETE FROM flashcard_theme_topics
 WHERE specialty_id = (SELECT id FROM specialties WHERE slug = 'cirurgia-geral')
   AND group_label = 'trauma raquimedular' AND topic_id = 123
   AND EXISTS (SELECT 1 FROM flashcard_theme_topics x
               WHERE x.specialty_id = flashcard_theme_topics.specialty_id
                 AND x.group_label = 'Trauma Raquimedular' AND x.topic_id = 123);

-- 123 · its deck link names the real group
UPDATE topic_content
   SET question_filter = jsonb_build_object('group_label', 'Trauma Raquimedular')
 WHERE topic_id = 123 AND resource_type = 'flashcards'
   AND question_filter->>'group_label' = 'trauma raquimedular';

COMMIT;
