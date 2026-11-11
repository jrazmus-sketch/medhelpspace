-- schema-patch-ortopedia-questoes.sql
-- Questões Revalida reorganization (Karina 2026-11-11, "Nova Seção de Ortopedia e
-- Revisão de Coluna Vertebral"). CLASSIFICATION ONLY: no question is created,
-- duplicated, deleted or edited — each moved row keeps its id, text, answers,
-- comments and history (quiz_attempts / review_schedule key on the id).
--
--   1. New page Outros → Ortopedia (h5p-quiz, same model as Urologia/Oftalmo/Otorrino),
--      card on the Outros hub in alphabetical order.
--   2. Six of her 14 Ortopedia questions exist on the platform and move there:
--      Reumatologia/Artrite Infecciosa: 2020 Q15, 2021 Q95, 2022.1 Q8, 2023.2 Q31
--      Cirurgia Geral/Trauma e Infecções Musculoesqueléticas: 2024.1 Q57, 2024.2 Q52
--      (the other eight are NOT on the platform — not recreated, reported to her).
--   3. Three of her seven Coluna questions exist elsewhere and move to
--      Neurologia → Coluna Vertebral e Trauma Raquimedular:
--      Cirurgia Geral/Trauma Raquimedular: 2023.1 Q17, 2023.2 Q82
--      Ginecologia/Câncer de Mama: 2023.2 Q52
--   4. "Trauma e Infecções Musculoesqueléticas" is left empty → draft, its card leaves
--      the Cirurgia Geral hub, and its study-plan link points to Ortopedia instead.
--   5. Destination pages are ordered by edition then number; source pages keep
--      their order, renumbered without gaps.
--   6. Pending Revisão rows of a moved question follow its new specialty.
--
-- NOT done here (waiting on Karina): 2025.1 Q71 + 2025.2 Q46 (no espondiloartrite
-- section exists in Reumatologia), 2021 Q7 (recommendation only), the two
-- Cirurgia Geral copies of Coluna questions (2024.1 Q97, 2024.2 Q47).
--
-- Matching is by page slug + "Questão N · Revalida ED" (ids differ between prod and
-- local). Every match must be exactly one row, else the whole patch aborts.
-- Not re-runnable: the backup tables below already existing aborts it (on purpose).
-- Rollback: schema-patch-ortopedia-questoes-rollback.sql

CREATE TABLE pages_bk_orto_20261111 AS
  SELECT * FROM pages
   WHERE view = 'quiz'
     AND slug IN ('artrite-infecciosa','trauma-osteomielite','trauma-raquimedular','cancer-de-mama',
                  'patologias-da-coluna-vertebral','outros-questoes','cirurgia-geral-quiz');

CREATE TABLE quiz_questions_bk_orto_20261111 AS
  SELECT q.* FROM quiz_questions q JOIN pages p ON p.id = q.page_id
   WHERE p.view = 'quiz'
     AND p.slug IN ('artrite-infecciosa','trauma-osteomielite','trauma-raquimedular','cancer-de-mama',
                    'patologias-da-coluna-vertebral');

CREATE TABLE nav_items_bk_orto_20261111 AS
  SELECT n.* FROM nav_items n JOIN pages p ON p.id = n.source_page_id
   WHERE p.view = 'quiz' AND p.slug IN ('outros-questoes','cirurgia-geral-quiz');

CREATE TABLE topic_content_bk_orto_20261111 AS
  SELECT tc.* FROM topic_content tc JOIN pages p ON p.id = tc.page_id
   WHERE p.view = 'quiz' AND p.slug = 'trauma-osteomielite';

CREATE TABLE review_schedule_bk_orto_20261111 AS
  SELECT r.* FROM review_schedule r
   WHERE r.item_type = 'quiz_question'
     AND r.item_id IN (SELECT id FROM quiz_questions_bk_orto_20261111);

-- Backups hold content; never expose them through the API.
ALTER TABLE pages_bk_orto_20261111           ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions_bk_orto_20261111  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_items_bk_orto_20261111       ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_content_bk_orto_20261111   ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_schedule_bk_orto_20261111 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_outros_spec int;
  v_outros_hub  bigint;
  v_cg_hub      bigint;
  v_orto        bigint;
  v_coluna      bigint;
  v_osteo       bigint;
  v_id          bigint;
  v_n           int;
  mv            record;
BEGIN
  SELECT id INTO STRICT v_outros_spec FROM specialties WHERE slug = 'outros';
  SELECT id INTO STRICT v_outros_hub  FROM pages WHERE view = 'quiz' AND slug = 'outros-questoes';
  SELECT id INTO STRICT v_cg_hub      FROM pages WHERE view = 'quiz' AND slug = 'cirurgia-geral-quiz';
  SELECT id INTO STRICT v_coluna      FROM pages WHERE view = 'quiz' AND slug = 'patologias-da-coluna-vertebral';
  SELECT id INTO STRICT v_osteo       FROM pages WHERE view = 'quiz' AND slug = 'trauma-osteomielite';

  IF EXISTS (SELECT 1 FROM pages WHERE slug = 'ortopedia') THEN
    RAISE EXCEPTION 'slug ortopedia already exists — nothing changed';
  END IF;

  -- 1. The new page (mirrors Urologia: h5p-quiz, published, Outros, no module).
  -- pages.id has no default (WordPress ids were kept): next free id, as in the
  -- Tumores Renais Fórmula patch.
  INSERT INTO pages (id, slug, title, type, status, parent_id, specialty_id, view, track_id, content_module_id,
                     notes, wp_created_at, wp_modified_at)
  VALUES ((SELECT coalesce(max(id), 0) + 1 FROM pages), 'ortopedia', 'Ortopedia', 'h5p-quiz', 'publish', NULL,
          v_outros_spec, 'quiz', NULL, NULL,
          'Karina 2026-11-11: Outros → Ortopedia (schema-patch-ortopedia-questoes.sql)', now(), now())
  RETURNING id INTO v_orto;

  -- 2 + 3. Resolve every move to exactly one question.
  CREATE TEMP TABLE orto_moves (src text, ed text, num int, dest bigint, qid bigint) ON COMMIT DROP;
  INSERT INTO orto_moves (src, ed, num, dest) VALUES
    ('artrite-infecciosa',  '2020',   15, v_orto),
    ('artrite-infecciosa',  '2021',   95, v_orto),
    ('artrite-infecciosa',  '2022.1',  8, v_orto),
    ('artrite-infecciosa',  '2023.2', 31, v_orto),
    ('trauma-osteomielite', '2024.1', 57, v_orto),
    ('trauma-osteomielite', '2024.2', 52, v_orto),
    ('trauma-raquimedular', '2023.1', 17, v_coluna),
    ('trauma-raquimedular', '2023.2', 82, v_coluna),
    ('cancer-de-mama',      '2023.2', 52, v_coluna);

  FOR mv IN SELECT * FROM orto_moves LOOP
    SELECT count(*), min(q.id) INTO v_n, v_id
      FROM quiz_questions q JOIN pages p ON p.id = q.page_id
     WHERE p.view = 'quiz' AND p.slug = mv.src
       AND q.question ~ ('Quest[aã]o 0*' || mv.num || ' · Revalida ' || replace(mv.ed, '.', '\.') || '([^.0-9]|$)');
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'expected 1 match for % Q% in %, found % — nothing changed', mv.ed, mv.num, mv.src, v_n;
    END IF;
    UPDATE orto_moves SET qid = v_id WHERE src = mv.src AND ed = mv.ed AND num = mv.num;
  END LOOP;

  -- Park every row of the touched pages out of the way of UNIQUE (page_id, position).
  UPDATE quiz_questions SET position = position + 10000
   WHERE page_id IN (SELECT id FROM pages WHERE view = 'quiz'
                      AND slug IN ('artrite-infecciosa','trauma-osteomielite','trauma-raquimedular',
                                   'cancer-de-mama','patologias-da-coluna-vertebral'));

  UPDATE quiz_questions q SET page_id = x.dest, position = 20000 + x.rn
    FROM (SELECT qid, dest, row_number() OVER (ORDER BY qid) AS rn FROM orto_moves) x
   WHERE q.id = x.qid;

  -- Destinations: by edition, then question number.
  WITH k AS (
    SELECT q.id, q.page_id,
           row_number() OVER (
             PARTITION BY q.page_id
             ORDER BY (substring(q.question FROM 'Revalida (20[0-9]{2})'))::int,
                      coalesce((substring(q.question FROM 'Revalida 20[0-9]{2}\.([0-9])'))::int, 0),
                      (substring(q.question FROM 'Quest[aã]o 0*([0-9]+) · Revalida'))::int,
                      q.id) AS rn
      FROM quiz_questions q WHERE q.page_id IN (v_orto, v_coluna))
  UPDATE quiz_questions q SET position = k.rn FROM k WHERE q.id = k.id;

  -- Sources: same order as before, no gaps.
  WITH k AS (
    SELECT q.id, row_number() OVER (PARTITION BY q.page_id ORDER BY q.position, q.id) AS rn
      FROM quiz_questions q
     WHERE q.page_id IN (SELECT id FROM pages WHERE view = 'quiz'
                          AND slug IN ('artrite-infecciosa','trauma-osteomielite','trauma-raquimedular','cancer-de-mama')))
  UPDATE quiz_questions q SET position = k.rn FROM k WHERE q.id = k.id;

  -- 1 (cont.). Card on the Outros hub; the hub's cards in alphabetical order.
  UPDATE nav_items SET position = position + 1000 WHERE source_page_id = v_outros_hub;
  INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
  VALUES (v_outros_hub, v_orto, 1999, 'Ortopedia', 'cards');
  WITH k AS (SELECT id, row_number() OVER (ORDER BY label) rn FROM nav_items WHERE source_page_id = v_outros_hub)
  UPDATE nav_items n SET position = k.rn FROM k WHERE n.id = k.id;

  -- 4. Empty page leaves navigation; its study-plan link follows its questions.
  IF EXISTS (SELECT 1 FROM quiz_questions WHERE page_id = v_osteo) THEN
    RAISE EXCEPTION 'trauma-osteomielite is not empty after the move — nothing changed';
  END IF;
  DELETE FROM nav_items WHERE target_page_id = v_osteo;
  UPDATE pages SET status = 'draft',
         notes = coalesce(notes || E'\n', '') || 'Karina 2026-11-11: questions moved to Outros → Ortopedia; page empty, unpublished.'
   WHERE id = v_osteo;
  UPDATE topic_content SET page_id = v_orto WHERE page_id = v_osteo;

  -- 6. Pending Revisão rows follow the question's new specialty.
  UPDATE review_schedule r SET specialty_id = p.specialty_id
    FROM orto_moves m JOIN pages p ON p.id = m.dest
   WHERE r.item_type = 'quiz_question' AND r.item_id = m.qid;
END $$;
