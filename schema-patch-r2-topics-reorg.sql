-- schema-patch-r2-topics-reorg.sql
--
-- R2 (Karina 2026-11-12) — Meu Plano topics follow the CURRENT classification of the questions.
-- AUTHORIZED for production by Karina 2026-11-15 (21:55 UTC), in the order R4b → R1 → R2 → Ortopedia,
-- together with the four new Outros topics below (her item 2).
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

-- Four low-recurrence Outros subjects get their OWN plan topic (Karina 2026-11-15, item 2): Cerume Impactado
-- (2021 Q5), Epistaxe (2026.1 Q24), Hipertrofia Adenoideana (2026.1 Q30) — Otorrinolaringologia; Fístulas
-- Urinárias (2023.2 Q42) — Urologia. Statistics only: the questions STAY in their current sections (no new
-- section, no new Flashcards/AudioCards/Revalida Up group). Each topic opens the EXISTING material that has
-- its content — the area's Revalida Up page (insights ① ⑦ ⑧ Otorrino, ⑮ Urologia) and the area's Flashcards
-- group (Otorrino cards 1–4, 24–27, 28–29; Urologia cards 27–28), by the group's stable id (R4b must run first).
-- incidence_count = 1 each = its distinct original question.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'topic_content' AND column_name = 'flashcard_group_id')
     OR (SELECT count(*) FROM pages WHERE slug IN ('otorrinolaringologia', 'urologia', 'otorrinolaringologia-revalida-up',
                                                   'urologia-revalida-up', 'outros-flashcards') AND status = 'publish') <> 5
     OR (SELECT count(*) FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
          WHERE p.slug = 'outros-flashcards' AND g.label IN ('Otorrinolaringologia', 'Urologia')) <> 2 THEN
    RAISE EXCEPTION 'R2 (temas novos): run R4b first / unexpected Outros state - nothing changed';
  END IF;
END $$;
INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source, notes)
SELECT v.name, v.slug, (SELECT id FROM specialties WHERE slug = 'outros'), (SELECT id FROM pages WHERE slug = v.section),
       1, '2020-2026.1', 'Karina 2026-11-15: tema próprio no Meu Plano (' || v.q || '); questões continuam na seção ' || v.section || '.'
FROM (VALUES ('Cerume Impactado', 'cerume-impactado', 'otorrinolaringologia', '2021 Q5'),
             ('Epistaxe', 'epistaxe', 'otorrinolaringologia', '2026.1 Q24'),
             ('Hipertrofia Adenoideana', 'hipertrofia-adenoideana', 'otorrinolaringologia', '2026.1 Q30'),
             ('Fístulas Urinárias', 'fistulas-urinarias', 'urologia', '2023.2 Q42')) v(name, slug, section, q)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO topic_content (topic_id, resource_type, page_id, note)
SELECT t.id, x.kind, (SELECT id FROM pages WHERE slug = x.page), 'Karina 2026-11-15'
FROM topics t
JOIN (VALUES ('otorrinolaringologia', 'quiz', 'otorrinolaringologia'), ('otorrinolaringologia', 'revalida_up', 'otorrinolaringologia-revalida-up'),
             ('urologia', 'quiz', 'urologia'), ('urologia', 'revalida_up', 'urologia-revalida-up')) x(section, kind, page)
  ON x.section = (SELECT slug FROM pages WHERE id = t.source_page_id)
WHERE t.slug IN ('cerume-impactado', 'epistaxe', 'hipertrofia-adenoideana', 'fistulas-urinarias')
  AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = x.kind);
INSERT INTO topic_content (topic_id, resource_type, page_id, flashcard_group_id, question_filter, note)
SELECT t.id, 'flashcards', g.page_id, g.id, jsonb_build_object('group_label', g.label), 'Karina 2026-11-15'
FROM topics t
JOIN flashcard_groups g ON g.label = CASE WHEN t.slug = 'fistulas-urinarias' THEN 'Urologia' ELSE 'Otorrinolaringologia' END
JOIN pages d ON d.id = g.page_id AND d.slug = 'outros-flashcards'
WHERE t.slug IN ('cerume-impactado', 'epistaxe', 'hipertrofia-adenoideana', 'fistulas-urinarias')
  AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'flashcards');

-- Section "Artrite Infecciosa" (Reumatologia) → "Monoartrite Aguda" (title + hub card only)
UPDATE pages SET title = 'Monoartrite Aguda' WHERE slug = 'artrite-infecciosa' AND title <> 'Monoartrite Aguda';
UPDATE nav_items n SET label = 'Monoartrite Aguda'
  FROM pages p WHERE p.id = n.target_page_id AND p.slug = 'artrite-infecciosa' AND n.label <> 'Monoartrite Aguda';

COMMIT;
