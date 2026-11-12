-- schema-patch-r2-topics-reorg.sql
--
-- R2 (Karina 2026-11-12) — Meu Plano topics follow the CURRENT classification of
-- the questions. PROPOSAL: applied to the LOCAL test database only; production waits
-- for Karina's approval of the final topic list (her item 3, "Antes de publicar…").
--
--   • Artrite Infecciosa (103): its 4 artrite séptica questions now live in
--     Outros › Ortopedia → topic moves to Outros, quiz link → ortopedia.
--     Its existing materials (Revalida Up, Reumatologia flashcard group and MedVoice
--     lesson) stay linked until she publishes new ones — nothing is swapped in.
--   • Trauma - Osteomielite (129) → renamed "Osteomielite e Infecções
--     Osteoarticulares", moves to Outros (slug kept: links and history key on id/slug).
--   • Trauma Raquimedular (123) → Neurologia; quiz link → the Coluna section
--     (where its questions are). Still a topic of its own, apart from Patologias da
--     Coluna Vertebral (76).
--   • NEW Espondiloartrites (Reumatologia) → section espondiloartrites.
--   • NEW Monoartrite Aguda (Reumatologia) → section artrite-infecciosa (whose title
--     becomes "Monoartrite Aguda" — Karina confirmed the rename; slug kept).
--   New topics start with no Revalida Up / flashcards / MedVoice: Karina produces
--   them; never borrowed from another subject.
--   incidence_count of the new topics = their distinct registered questions (the
--   live count, schema-patch-exam-questions.sql); every other count is untouched.
--
-- Rollback: restore from topics_bk_r2_20261112 / topic_content_bk_r2_20261112 /
-- pages_bk_r2_20261112 / nav_items_bk_r2_20261112 (created below):
--   DELETE FROM topic_content WHERE topic_id IN (SELECT id FROM topics WHERE slug IN ('espondiloartrites','monoartrite-aguda'));
--   UPDATE exam_questions SET topic_id = NULL WHERE topic_id IN (SELECT id FROM topics WHERE slug IN ('espondiloartrites','monoartrite-aguda'));
--   DELETE FROM topics WHERE slug IN ('espondiloartrites','monoartrite-aguda');
--   UPDATE topics t SET name=b.name, specialty_id=b.specialty_id, source_page_id=b.source_page_id FROM topics_bk_r2_20261112 b WHERE b.id=t.id;
--   DELETE FROM topic_content WHERE resource_type='quiz' AND topic_id IN (103,123);
--   INSERT INTO topic_content (topic_id, resource_type, page_id, question_filter)
--     SELECT topic_id, resource_type, page_id, question_filter FROM topic_content_bk_r2_20261112 WHERE resource_type='quiz' AND topic_id IN (103,123);
--   UPDATE pages p SET title=b.title FROM pages_bk_r2_20261112 b WHERE b.id=p.id;
--   UPDATE nav_items n SET label=b.label FROM nav_items_bk_r2_20261112 b WHERE b.id=n.id;

BEGIN;

CREATE TABLE IF NOT EXISTS topics_bk_r2_20261112 AS SELECT * FROM topics;
CREATE TABLE IF NOT EXISTS topic_content_bk_r2_20261112 AS SELECT * FROM topic_content;
CREATE TABLE IF NOT EXISTS pages_bk_r2_20261112 AS SELECT id, title FROM pages WHERE slug = 'artrite-infecciosa';
CREATE TABLE IF NOT EXISTS nav_items_bk_r2_20261112 AS
  SELECT n.* FROM nav_items n JOIN pages p ON p.id = n.target_page_id WHERE p.slug = 'artrite-infecciosa';
ALTER TABLE topics_bk_r2_20261112 ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_content_bk_r2_20261112 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages_bk_r2_20261112 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_items_bk_r2_20261112 ENABLE ROW LEVEL SECURITY;

-- Artrite Infecciosa → Outros, questions in Ortopedia
UPDATE topics SET specialty_id = (SELECT id FROM specialties WHERE slug = 'outros'),
                  source_page_id = (SELECT id FROM pages WHERE slug = 'ortopedia'), updated_at = now()
 WHERE slug = 'artrite-infecciosa';
UPDATE topic_content SET page_id = (SELECT id FROM pages WHERE slug = 'ortopedia')
 WHERE resource_type = 'quiz' AND topic_id = (SELECT id FROM topics WHERE slug = 'artrite-infecciosa');

-- Osteomielite e Infecções Osteoarticulares
UPDATE topics SET name = 'Osteomielite e Infecções Osteoarticulares',
                  specialty_id = (SELECT id FROM specialties WHERE slug = 'outros'),
                  source_page_id = (SELECT id FROM pages WHERE slug = 'ortopedia'), updated_at = now()
 WHERE slug = 'trauma-osteomielite';

-- Trauma Raquimedular → Neurologia, Coluna section
UPDATE topics SET specialty_id = (SELECT id FROM specialties WHERE slug = 'neurologia'),
                  source_page_id = (SELECT id FROM pages WHERE slug = 'patologias-da-coluna-vertebral'), updated_at = now()
 WHERE slug = 'trauma-raquimedular';
UPDATE topic_content SET page_id = (SELECT id FROM pages WHERE slug = 'patologias-da-coluna-vertebral')
 WHERE resource_type = 'quiz' AND topic_id = (SELECT id FROM topics WHERE slug = 'trauma-raquimedular');

-- New topics
INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source, notes)
SELECT 'Espondiloartrites', 'espondiloartrites', (SELECT id FROM specialties WHERE slug = 'reumatologia'),
       (SELECT id FROM pages WHERE slug = 'espondiloartrites'), 2, '2020-2026.1',
       'R2 (Karina 2026-11-12): 2025.1 Q71 + 2025.2 Q46.'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source, notes)
SELECT 'Monoartrite Aguda', 'monoartrite-aguda', (SELECT id FROM specialties WHERE slug = 'reumatologia'),
       (SELECT id FROM pages WHERE slug = 'artrite-infecciosa'), 1, '2020-2026.1',
       'R2 (Karina 2026-11-12): 2026.1 Q96.'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO topic_content (topic_id, resource_type, page_id)
SELECT t.id, 'quiz', t.source_page_id FROM topics t
 WHERE t.slug IN ('espondiloartrites', 'monoartrite-aguda')
   AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'quiz');

-- Section "Artrite Infecciosa" (Reumatologia) → "Monoartrite Aguda" (title + hub card only)
UPDATE pages SET title = 'Monoartrite Aguda' WHERE slug = 'artrite-infecciosa' AND title <> 'Monoartrite Aguda';
UPDATE nav_items n SET label = 'Monoartrite Aguda'
  FROM pages p WHERE p.id = n.target_page_id AND p.slug = 'artrite-infecciosa' AND n.label <> 'Monoartrite Aguda';

COMMIT;
