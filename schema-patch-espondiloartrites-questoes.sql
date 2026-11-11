-- schema-patch-espondiloartrites-questoes.sql
-- Questões Revalida, second round (Karina 2026-11-11 16:02 BRT, reply to the Ortopedia
-- report). CLASSIFICATION ONLY: no question is created, duplicated, deleted or edited —
-- each moved row keeps its id, text, answers, comments and history.
--
--   1. New page Clínica Médica → Reumatologia → Espondiloartrites (h5p-quiz, same model as
--      Artrite Reumatoide / Fibromialgia), card on the Reumatologia hub in alphabetical order
--      (the free position 3, between Artrite Reumatoide and Fibromialgia).
--   2. From Neurologia → Coluna Vertebral e Trauma Raquimedular:
--        2025.1 Q71 (lombalgia inflamatória / espondiloartrite axial) → Espondiloartrites
--        2025.2 Q46 (espondilite anquilosante)                        → Espondiloartrites
--        2021 Q7   (dor miofascial / apoio matricial)                 → Saúde Coletiva → Atenção Básica
--   3. Destinations ordered by edition then number (Atenção Básica already is, so its other
--      32 questions keep their relative order); Coluna renumbered without gaps.
--   4. Pending Revisão rows of a moved question follow its new specialty.
--
-- Matching by page slug + "Questão N · Revalida ED"; every match must be exactly one row,
-- else the whole patch aborts. Not re-runnable (backup tables already existing aborts it).
-- Rollback: schema-patch-espondiloartrites-questoes-rollback.sql

CREATE TABLE quiz_questions_bk_espondilo_20261111 AS
  SELECT q.* FROM quiz_questions q JOIN pages p ON p.id = q.page_id
   WHERE p.view = 'quiz' AND p.slug IN ('patologias-da-coluna-vertebral','atencao-basica');

CREATE TABLE nav_items_bk_espondilo_20261111 AS
  SELECT n.* FROM nav_items n JOIN pages p ON p.id = n.source_page_id
   WHERE p.view = 'quiz' AND p.slug = 'reumatologia-quiz';

CREATE TABLE review_schedule_bk_espondilo_20261111 AS
  SELECT r.* FROM review_schedule r
   WHERE r.item_type = 'quiz_question'
     AND r.item_id IN (SELECT id FROM quiz_questions_bk_espondilo_20261111);

ALTER TABLE quiz_questions_bk_espondilo_20261111  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_items_bk_espondilo_20261111       ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_schedule_bk_espondilo_20261111 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_reumato_spec int;
  v_reumato_hub  bigint;
  v_reumato_wp   bigint;
  v_coluna       bigint;
  v_ab           bigint;
  v_espondilo    bigint;
  v_id           bigint;
  v_n            int;
  mv             record;
BEGIN
  SELECT id INTO STRICT v_reumato_spec FROM specialties WHERE slug = 'reumatologia';
  SELECT id INTO STRICT v_reumato_hub  FROM pages WHERE view = 'quiz' AND slug = 'reumatologia-quiz';
  SELECT parent_id INTO STRICT v_reumato_wp FROM pages WHERE view = 'quiz' AND slug = 'artrite-reumatoide';
  SELECT id INTO STRICT v_coluna       FROM pages WHERE view = 'quiz' AND slug = 'patologias-da-coluna-vertebral';
  SELECT id INTO STRICT v_ab           FROM pages WHERE view = 'quiz' AND slug = 'atencao-basica';

  IF EXISTS (SELECT 1 FROM pages WHERE slug = 'espondiloartrites') THEN
    RAISE EXCEPTION 'slug espondiloartrites already exists — nothing changed';
  END IF;
  IF EXISTS (SELECT 1 FROM nav_items WHERE source_page_id = v_reumato_hub AND position = 3) THEN
    RAISE EXCEPTION 'Reumatologia hub position 3 is taken — nothing changed';
  END IF;

  -- 1. The new page (mirrors Artrite Reumatoide: h5p-quiz, published, Reumatologia, no module).
  INSERT INTO pages (id, slug, title, type, status, parent_id, specialty_id, view, track_id, content_module_id,
                     notes, wp_created_at, wp_modified_at)
  VALUES ((SELECT coalesce(max(id), 0) + 1 FROM pages), 'espondiloartrites', 'Espondiloartrites', 'h5p-quiz', 'publish',
          v_reumato_wp, v_reumato_spec, 'quiz', NULL, NULL,
          'Karina 2026-11-11: Reumatologia → Espondiloartrites (schema-patch-espondiloartrites-questoes.sql)', now(), now())
  RETURNING id INTO v_espondilo;

  INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
  VALUES (v_reumato_hub, v_espondilo, 3, 'Espondiloartrites', 'cards');

  -- 2. Resolve every move to exactly one question.
  CREATE TEMP TABLE esp_moves (src text, ed text, num int, dest bigint, qid bigint) ON COMMIT DROP;
  INSERT INTO esp_moves (src, ed, num, dest) VALUES
    ('patologias-da-coluna-vertebral', '2025.1', 71, v_espondilo),
    ('patologias-da-coluna-vertebral', '2025.2', 46, v_espondilo),
    ('patologias-da-coluna-vertebral', '2021',    7, v_ab);

  FOR mv IN SELECT * FROM esp_moves LOOP
    SELECT count(*), min(q.id) INTO v_n, v_id
      FROM quiz_questions q JOIN pages p ON p.id = q.page_id
     WHERE p.view = 'quiz' AND p.slug = mv.src
       AND q.question ~ ('Quest[aã]o 0*' || mv.num || ' · Revalida ' || replace(mv.ed, '.', '\.') || '([^.0-9]|$)');
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'expected 1 match for % Q% in %, found % — nothing changed', mv.ed, mv.num, mv.src, v_n;
    END IF;
    UPDATE esp_moves SET qid = v_id WHERE src = mv.src AND ed = mv.ed AND num = mv.num;
  END LOOP;

  -- Park the touched pages out of the way of UNIQUE (page_id, position).
  UPDATE quiz_questions SET position = position + 10000 WHERE page_id IN (v_coluna, v_ab);

  UPDATE quiz_questions q SET page_id = x.dest, position = 20000 + x.rn
    FROM (SELECT qid, dest, row_number() OVER (ORDER BY qid) AS rn FROM esp_moves) x
   WHERE q.id = x.qid;

  -- 3. Destinations: by edition, then question number (ties keep their previous order).
  WITH k AS (
    SELECT q.id,
           row_number() OVER (
             PARTITION BY q.page_id
             ORDER BY (substring(q.question FROM 'Revalida (20[0-9]{2})'))::int,
                      coalesce((substring(q.question FROM 'Revalida 20[0-9]{2}\.([0-9])'))::int, 0),
                      (substring(q.question FROM 'Quest[aã]o 0*([0-9]+) · Revalida'))::int,
                      q.position, q.id) AS rn
      FROM quiz_questions q WHERE q.page_id IN (v_espondilo, v_ab))
  UPDATE quiz_questions q SET position = k.rn FROM k WHERE q.id = k.id;

  -- Source: same order as before, no gaps.
  WITH k AS (
    SELECT q.id, row_number() OVER (ORDER BY q.position, q.id) AS rn
      FROM quiz_questions q WHERE q.page_id = v_coluna)
  UPDATE quiz_questions q SET position = k.rn FROM k WHERE q.id = k.id;

  -- 4. Pending Revisão rows follow the question's new specialty.
  UPDATE review_schedule r SET specialty_id = p.specialty_id
    FROM esp_moves m JOIN pages p ON p.id = m.dest
   WHERE r.item_type = 'quiz_question' AND r.item_id = m.qid;
END $$;
