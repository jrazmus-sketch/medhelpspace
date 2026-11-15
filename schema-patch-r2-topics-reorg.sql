-- schema-patch-r2-topics-reorg.sql
--
-- R2 (Karina 2026-11-12) — Meu Plano topics follow the CURRENT classification of the questions.
-- TEST ONLY: production waits for Karina's authorization (2026-11-15: "Não autorizo ainda a publicação
-- da R1, R2, R4b ou das transferências estruturais").
--
--   • Artrite Infecciosa (103): its artrite séptica questions now live in Outros › Ortopedia → the topic
--     moves to Outros, quiz link → ortopedia. Its materials (Revalida Up, the "Artrite Infecciosa"
--     Flashcards group, MedVoice lesson) stay linked — nothing is swapped in.
--   • Trauma - Osteomielite (129) → renamed "Osteomielite e Infecções Osteoarticulares", moves to
--     Outros (slug kept: links and history key on id/slug).
--   • Trauma Raquimedular (123) → Neurologia; quiz link → the Coluna section (where its questions are).
--     Still a topic of its own, apart from Patologias da Coluna Vertebral (76).
--   • NEW Espondiloartrites (Reumatologia) → section espondiloartrites.
--   • NEW Monoartrite Aguda (Reumatologia) → section artrite-infecciosa, whose title (and hub card)
--     becomes "Monoartrite Aguda" (Karina confirmed the rename; slug kept).
--   New topics start with no Revalida Up / Flashcards / MedVoice: Karina produces them; never borrowed
--   from another subject. incidence_count of the new topics = their distinct registered questions.
--
-- Depends on: nothing structural (R1's exam_questions picks up the new topics when its data file is
-- re-run after this patch — that file only fills topics still 'proposto').
-- Backups: full rows of everything touched (*_bk_r2). Rollback: schema-patch-r2-topics-reorg-rollback.sql
-- (restores the rows EXACTLY, timestamps included). Re-run safe.

BEGIN;

CREATE TABLE IF NOT EXISTS topics_bk_r2 AS SELECT * FROM topics;
CREATE TABLE IF NOT EXISTS topic_content_bk_r2 AS SELECT * FROM topic_content;
CREATE TABLE IF NOT EXISTS pages_bk_r2 AS SELECT * FROM pages WHERE slug = 'artrite-infecciosa';
CREATE TABLE IF NOT EXISTS nav_items_bk_r2 AS
  SELECT n.* FROM nav_items n JOIN pages p ON p.id = n.target_page_id WHERE p.slug = 'artrite-infecciosa';
ALTER TABLE topics_bk_r2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_content_bk_r2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages_bk_r2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_items_bk_r2 ENABLE ROW LEVEL SECURITY;
-- with R1 present, its originals too (the R1 data re-run after this patch puts 3 of them on the new topics)
DO $$
BEGIN
  IF to_regclass('public.exam_questions') IS NOT NULL AND to_regclass('public.exam_questions_bk_r2') IS NULL THEN
    EXECUTE 'CREATE TABLE exam_questions_bk_r2 AS SELECT * FROM exam_questions';
    EXECUTE 'ALTER TABLE exam_questions_bk_r2 ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT count(*) FROM pages WHERE slug IN ('ortopedia', 'patologias-da-coluna-vertebral', 'espondiloartrites', 'artrite-infecciosa')) <> 4
     OR (SELECT count(*) FROM topics WHERE slug IN ('artrite-infecciosa', 'trauma-osteomielite', 'trauma-raquimedular')) <> 3
     OR NOT EXISTS (SELECT 1 FROM specialties WHERE slug = 'outros') THEN
    RAISE EXCEPTION 'R2: unexpected state - nothing changed';
  END IF;
END $$;

-- Artrite Infecciosa → Outros, questions in Ortopedia
UPDATE topics SET specialty_id = (SELECT id FROM specialties WHERE slug = 'outros'),
                  source_page_id = (SELECT id FROM pages WHERE slug = 'ortopedia'), updated_at = now()
 WHERE slug = 'artrite-infecciosa' AND specialty_id <> (SELECT id FROM specialties WHERE slug = 'outros');
UPDATE topic_content SET page_id = (SELECT id FROM pages WHERE slug = 'ortopedia')
 WHERE resource_type = 'quiz' AND topic_id = (SELECT id FROM topics WHERE slug = 'artrite-infecciosa')
   AND page_id <> (SELECT id FROM pages WHERE slug = 'ortopedia');

-- Osteomielite e Infecções Osteoarticulares
UPDATE topics SET name = 'Osteomielite e Infecções Osteoarticulares',
                  specialty_id = (SELECT id FROM specialties WHERE slug = 'outros'),
                  source_page_id = (SELECT id FROM pages WHERE slug = 'ortopedia'), updated_at = now()
 WHERE slug = 'trauma-osteomielite' AND name <> 'Osteomielite e Infecções Osteoarticulares';

-- Trauma Raquimedular → Neurologia, Coluna section
UPDATE topics SET specialty_id = (SELECT id FROM specialties WHERE slug = 'neurologia'),
                  source_page_id = (SELECT id FROM pages WHERE slug = 'patologias-da-coluna-vertebral'), updated_at = now()
 WHERE slug = 'trauma-raquimedular' AND specialty_id <> (SELECT id FROM specialties WHERE slug = 'neurologia');
UPDATE topic_content SET page_id = (SELECT id FROM pages WHERE slug = 'patologias-da-coluna-vertebral')
 WHERE resource_type = 'quiz' AND topic_id = (SELECT id FROM topics WHERE slug = 'trauma-raquimedular')
   AND page_id <> (SELECT id FROM pages WHERE slug = 'patologias-da-coluna-vertebral');

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
