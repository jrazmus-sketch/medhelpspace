-- schema-patch-fase1-2026-11-17.sql
--
-- Karina 2026-11-17 22h41 BRT, "Relatório de execução — Fase 1" (authorized): her 27 classification decisions,
-- the Meu Plano topics that follow them, and the four themes whose own materials leave the published area.
-- CLASSIFICATION ONLY — no statement, alternative, answer key or comment is touched; every record, card, lesson
-- and audio keeps its id; nothing is deleted ("despublicar/arquivar em vez de excluir").
--
--   A. 17 transfers: the existing record moves to its new section (never a copy). At the destination it takes
--      the slot of its edition/number; the other records keep their order. Attempts and pending Revisão rows
--      follow the question.
--   B. 9 redundant copies are UNPUBLISHED: the record moves to a never-published page
--      ("questoes-copias-despublicadas", draft). The copy she kept stays where it is. History of an unpublished
--      copy (on prod: one attempt + one Revisão row, Karina's own, on record 511) goes to the kept copy of the same
--      question; a student with history on BOTH copies keeps both, the copy's Revisão row suspended.
--   C. Primary topic of the 27 originals: set where it changed, and all 27 marked 'aprovado' (they were the
--      27 "A REVER"). Incidence, band and ranking are recalculated by the P20 triggers — never by hand.
--   D. Topics: "Medicina do Trabalho" renamed "Saúde do Trabalhador" (same topic, same id); new section + topic
--      Hematologia › Reações Transfusionais (questions only); new topic Outros › Corpo Estranho Nasal (the
--      2025.1 Q87 she moved to Otorrinolaringologia — same model as Cerume/Epistaxe/Adenoide of 15/11).
--   E. Archived (unpublished, kept): Microangiopatias Trombóticas — section (empty), Revalida Up, Flashcards group
--      + AudioCard, and the whole topic leaves Meu Plano; Ventilação Mecânica and Delirium — Revalida Up,
--      Flashcards group + AudioCard (the topic and its remaining question stay). Demências has no Revalida Up,
--      Flashcards or AudioCards of its own: nothing to archive, its topic keeps the remaining question.
--   F. Meu Plano links to the Revalida Up published in this batch: Espondiloartrites → its new page; the two
--      Ortopedia topics (Artrite Infecciosa, Osteomielite e Infecções Osteoarticulares) → the general "Ortopedia".
--
-- Run AFTER parsed/revalida-up-fase1-import.sql (section F needs those pages). Matching is by page slug +
-- original (edition, number) — never by id — so the same file runs on prod, local and the rehearsal copy.
-- Backups: *_bk_fase1 (full rows). Rollback: schema-patch-fase1-2026-11-17-rollback.sql. Re-run safe.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.exam_questions') IS NULL OR to_regclass('public.flashcard_group_moves') IS NULL
     OR to_regprocedure('public.move_flashcard_group(bigint,bigint,smallint)') IS NULL
     OR to_regprocedure('public.refresh_topic_incidence()') IS NULL
     OR to_regprocedure('public.exam_edition_rank(text)') IS NULL THEN
    RAISE EXCEPTION 'Fase 1: R1/R4b/single-source/automatic-incidence patches are required - nothing changed';
  END IF;
  IF (SELECT count(*) FROM pages WHERE view = 'revalida-up' AND status = 'publish'
       AND slug IN ('ortopedia-revalida-up', 'espondiloartrites-revalida-up', 'otorrinolaringologia-revalida-up')) <> 3 THEN
    RAISE EXCEPTION 'Fase 1: apply parsed/revalida-up-fase1-import.sql first - nothing changed';
  END IF;
END $$;

-- ── the plan ───────────────────────────────────────────────────────────────────────────────────────
-- kind 'move': src section → dest section.   kind 'copy': unpublish the record in src; `dest` = the section
-- whose copy stays published.
CREATE TEMP TABLE _f1 (
  i int GENERATED ALWAYS AS IDENTITY, kind text, ed text, num int, src text, dest text,
  eq bigint, qid bigint, src_page bigint, dest_page bigint, kept bigint, done boolean DEFAULT false, k numeric
) ON COMMIT DROP;
INSERT INTO _f1 (kind, ed, num, src, dest) VALUES
  ('move', '2020',    4, 'urologia',                            'tuberculose'),
  ('move', '2020',   96, 'sindromes-hipertensivas-na-gestacao', 'sindromes-hemorragicas-da-gestacao'),
  ('move', '2022.1', 64, 'assistencia-pre-natal',               'hiv-na-gestacao'),
  ('move', '2022.1', 88, 'otorrinolaringologia',                'pancreatite'),
  ('move', '2022.2', 58, 'malformacoes-congenitas',             'triagem-neonatal'),
  ('move', '2023.1', 43, 'diarreia-e-desidratacao',             'disturbios-hidroeletroliticos'),
  ('move', '2023.2', 11, 'pancreatite',                         'disturbios-hidroeletroliticos'),
  ('move', '2024.1', 49, 'sepse-neonatal',                      'assistencia-clinica-ao-parto'),
  ('move', '2024.1', 54, 'sangramento-uterino-anormal',         'etica-medica'),
  ('move', '2024.2', 12, 'hernias',                             'perioperatorio'),
  ('move', '2024.2', 28, 'anemia-falciforme',                   'reacoes-transfusionais'),
  ('move', '2024.2', 37, 'ventilacao-mecanica',                 'trauma-atendimento-inicial-e-vias-aereas'),
  ('move', '2025.1', 16, 'delirium',                            'efeitos-do-alcool-e-abstinencia'),
  ('move', '2025.1', 47, 'choque',                              'trauma-atendimento-inicial-e-vias-aereas'),
  ('move', '2025.1', 86, 'ventilacao-mecanica',                 'etica-medica'),
  ('move', '2025.1', 87, 'cirurgia-pediatrica',                 'otorrinolaringologia'),
  ('move', '2025.2', 72, 'doencas-hepatobiliares',              'choque'),
  ('copy', '2022.2', 78, 'sifilis-na-gestacao',                 'sifilis-congenita'),
  ('copy', '2023.1', 11, 'microangiopatias-tromboticas',        'disturbio-da-hemostasia-primaria'),
  ('copy', '2023.1', 47, 'perioperatorio',                      'doencas-hepatobiliares'),
  ('copy', '2023.1', 47, 'choque',                              'doencas-hepatobiliares'),
  ('copy', '2023.2', 25, 'demencias',                           'atencao-ao-idoso'),
  ('copy', '2023.2', 84, 'diabetes-da-gestacao',                'vitalidade-fetal'),
  ('copy', '2024.1', 18, 'ventilacao-mecanica',                 'manejo-inicial-do-desconforto-respiratorio-no-recem-nascido-quiz'),
  ('copy', '2025.2', 90, 'anticoncepcao',                       'etica-medica'),
  ('copy', '2026.1', 16, 'hepatites-virais',                    'vigilancia-epidemiologica');

-- primary topic of the 27 originals (topic slug) + the decision, for exam_questions.topic_note
CREATE TEMP TABLE _f1_topic (ed text, num int, topic text, note text) ON COMMIT DROP;
INSERT INTO _f1_topic VALUES
  ('2020',    4, 'tuberculose',                               'transferida de Outros › Urologia para Pneumologia › Tuberculose'),
  ('2020',   67, 'medicina-do-trabalho',                      'mantida em Saúde do Trabalhador; tema renomeado para Saúde do Trabalhador'),
  ('2020',   96, 'sindromes-hemorragicas-da-gestacao',        'transferida para Síndromes Hemorrágicas da Gestação (DPP)'),
  ('2022.1', 64, 'hiv-na-gestacao',                           'transferida para HIV na Gestação'),
  ('2022.1', 88, 'pancreatite',                               'transferida de Otorrinolaringologia para Cirurgia Geral › Pancreatite'),
  ('2022.2', 58, 'triagem-neonatal',                          'registro de Malformações Congênitas transferido para Triagem Neonatal; cópia de Cardiopatia Congênita mantida'),
  ('2022.2', 78, 'sifilis-congenita',                         'anulada; mantida em Sífilis Congênita; cópia de Sífilis na Gestação despublicada'),
  ('2023.1', 11, 'disturbio-da-hemostasia-primaria',          'mantida em Distúrbios da Hemostasia Primária; cópia de Microangiopatias Trombóticas despublicada'),
  ('2023.1', 13, 'infeccoes-neurologicas',                    'anulada; mantida em Infecções Neurológicas'),
  ('2023.1', 43, 'disturbios-hidroeletroliticos',             'transferida para Nefrologia › Distúrbios Hidroeletrolíticos Nefrológicos'),
  ('2023.1', 47, 'doencas-hepatobiliares',                    'mantida em Doenças Hepatobiliares; cópias de Perioperatório e Choque despublicadas'),
  ('2023.2', 11, 'disturbios-hidroeletroliticos',             'transferida de Pancreatite para Nefrologia › Distúrbios Hidroeletrolíticos Nefrológicos'),
  ('2023.2', 25, 'atencao-ao-idoso',                          'mantida em Atenção ao Idoso; cópia de Demências despublicada'),
  ('2023.2', 84, 'vitalidade-fetal',                          'mantida em Vitalidade Fetal; cópia de Diabetes Gestacional despublicada'),
  ('2024.1', 18, 'manejo-inicial-do-desconforto-respiratorio-no-recem-nascido-quiz', 'mantida na seção pediátrica; cópia de Ventilação Mecânica despublicada'),
  ('2024.1', 49, 'assistencia-clinica-ao-parto',              'transferida de Sepse Neonatal para Assistência Clínica ao Parto'),
  ('2024.1', 54, 'etica-medica',                              'transferida de Sangramento Uterino Anormal para Ética Médica e Medicina Legal'),
  ('2024.2', 12, 'perioperatorio',                            'transferida de Hérnias para Perioperatório'),
  ('2024.2', 28, 'reacoes-transfusionais',                    'transferida de Anemia Falciforme para a nova seção Reações Transfusionais'),
  ('2024.2', 37, 'trauma-atendimento-inicial-e-vias-aereas',  'transferida de Ventilação Mecânica para Trauma – Atendimento Inicial e Vias Aéreas'),
  ('2025.1', 16, 'efeitos-do-alcool-e-abstinencia',           'transferida de Delirium para Efeitos do Álcool e Abstinência'),
  ('2025.1', 47, 'trauma-atendimento-inicial-e-vias-aereas',  'transferida de Choque para Trauma – Atendimento Inicial e Vias Aéreas'),
  ('2025.1', 86, 'etica-medica',                              'transferida de Ventilação Mecânica para Ética Médica e Medicina Legal'),
  ('2025.1', 87, 'corpo-estranho-nasal',                      'transferida de Cirurgia Pediátrica para Outros › Otorrinolaringologia (corpo estranho nasal)'),
  ('2025.2', 72, 'choque',                                    'transferida de Doenças Hepatobiliares para Emergência › Choque'),
  ('2025.2', 90, 'etica-medica',                              'mantida em Ética Médica e Medicina Legal; cópia de Anticoncepção despublicada'),
  ('2026.1', 16, 'vigilancia-epidemiologica',                 'mantida em Vigilância Epidemiológica; cópia de Hepatites Virais despublicada');

-- ── backups (full rows; taken once, so a re-run keeps the ORIGINAL state) ───────────────────────────
CREATE TABLE IF NOT EXISTS quiz_questions_bk_fase1 AS
  SELECT q.* FROM quiz_questions q JOIN pages p ON p.id = q.page_id
   WHERE p.slug IN (SELECT src FROM _f1 UNION SELECT dest FROM _f1);
CREATE TABLE IF NOT EXISTS exam_questions_bk_fase1 AS
  SELECT e.* FROM exam_questions e JOIN _f1_topic t ON t.ed = e.edition AND t.num = e.number;
CREATE TABLE IF NOT EXISTS topics_bk_fase1 AS SELECT * FROM topics;
CREATE TABLE IF NOT EXISTS topic_content_bk_fase1 AS SELECT * FROM topic_content;
CREATE TABLE IF NOT EXISTS pages_bk_fase1 AS
  SELECT * FROM pages WHERE slug IN ('microangiopatias-tromboticas', 'microangiopatias-tromboticas-revalida-up',
                                     'ventilacao-mecanica-revalida-up', 'delirium-revalida-up');
CREATE TABLE IF NOT EXISTS nav_items_bk_fase1 AS
  SELECT n.* FROM nav_items n JOIN pages p ON p.id = n.source_page_id WHERE p.slug = 'hematologia-quiz';
-- Flashcards / AudioCards: only the three decks a group leaves (a rollback must not reach other decks)
CREATE TABLE IF NOT EXISTS flashcard_groups_bk_fase1 AS
  SELECT g.* FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
   WHERE p.slug IN ('hematologia-flashcards', 'emergencia-flashcards', 'neurologia-flashcards');
CREATE TABLE IF NOT EXISTS flashcard_items_bk_fase1 AS
  SELECT f.* FROM flashcard_items f WHERE f.group_id IN (SELECT id FROM flashcard_groups_bk_fase1);
CREATE TABLE IF NOT EXISTS lessons_bk_fase1 AS
  SELECT l.* FROM lessons l JOIN pages p ON p.id = l.page_id
   WHERE p.slug IN ('hematologia-audiocards', 'emergencia-audiocards', 'neurologia-audiocards');
CREATE TABLE IF NOT EXISTS quiz_attempts_bk_fase1 AS
  SELECT a.* FROM quiz_attempts a WHERE a.question_id IN (SELECT id FROM quiz_questions_bk_fase1);
CREATE TABLE IF NOT EXISTS review_schedule_bk_fase1 AS
  SELECT r.* FROM review_schedule r
   WHERE (r.item_type = 'quiz_question' AND r.item_id IN (SELECT id FROM quiz_questions_bk_fase1))
      OR (r.item_type = 'flashcard' AND r.item_id IN (
            SELECT f.id FROM flashcard_items f JOIN flashcard_groups g ON g.id = f.group_id JOIN pages p ON p.id = g.page_id
             WHERE (p.slug, g.label) IN (('hematologia-flashcards', 'Microangiopatias Trombóticas'),
                                         ('emergencia-flashcards', 'Ventilação Mecânica'), ('neurologia-flashcards', 'Delirium'))));
ALTER TABLE quiz_questions_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_content_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_items_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_groups_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_items_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts_bk_fase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_schedule_bk_fase1 ENABLE ROW LEVEL SECURITY;

-- what must come out identical
CREATE TEMP TABLE _f1_q ON COMMIT DROP AS
  SELECT id, exam_question_id,
         md5(question || '|' || coalesce(answers::text, '') || '|' || coalesce(explanation_html, '') || '|' || coalesce(media_url, '')) AS h
    FROM quiz_questions;
CREATE TEMP TABLE _f1_cards ON COMMIT DROP AS SELECT id, text, answer, group_id, position FROM flashcard_items;
CREATE TEMP TABLE _f1_lessons ON COMMIT DROP AS SELECT id, body_html, audio_url, title FROM lessons;
CREATE TEMP TABLE _f1_before ON COMMIT DROP AS
  SELECT (SELECT count(DISTINCT q.exam_question_id) FROM quiz_questions q JOIN pages p ON p.id = q.page_id WHERE p.status = 'publish') AS originals,
         (SELECT coalesce(sum(incidence_count), 0) FROM topics) AS incidence_sum;

-- ── D. new section, new topics, the rename ──────────────────────────────────────────────────────────
INSERT INTO pages (id, slug, title, type, status, parent_id, specialty_id, view, track_id, content_module_id, notes,
                   wp_created_at, wp_modified_at)
SELECT (SELECT max(id) + 1 FROM pages), 'reacoes-transfusionais', 'Reações Transfusionais', 'h5p-quiz', 'publish',
       (SELECT parent_id FROM pages WHERE slug = 'anemia-falciforme'), (SELECT id FROM specialties WHERE slug = 'hematologia'),
       'quiz', NULL, NULL, 'Karina 2026-11-17 (Fase 1): Hematologia → Reações Transfusionais (2024.2 Q28)', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'reacoes-transfusionais');

INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT h.id, t.id, (SELECT coalesce(max(position), 0) + 1 FROM nav_items WHERE source_page_id = h.id), 'Reações Transfusionais', 'cards'
  FROM pages h, pages t
 WHERE h.slug = 'hematologia-quiz' AND t.slug = 'reacoes-transfusionais'
   AND NOT EXISTS (SELECT 1 FROM nav_items n WHERE n.source_page_id = h.id AND n.target_page_id = t.id);

INSERT INTO pages (id, slug, title, type, status, parent_id, specialty_id, view, track_id, content_module_id, notes,
                   wp_created_at, wp_modified_at)
SELECT (SELECT max(id) + 1 FROM pages), 'questoes-copias-despublicadas',
       'Questões — cópias despublicadas (não publicadas)', 'h5p-quiz', 'draft', NULL, NULL, 'quiz', NULL, NULL,
       'Karina 17/11/2026 (Fase 1): cópias redundantes de questões que continuam publicadas em outra seção. Não publicar; não apagar.',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'questoes-copias-despublicadas');

INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source, notes)
SELECT 'Reações Transfusionais', 'reacoes-transfusionais', (SELECT id FROM specialties WHERE slug = 'hematologia'),
       (SELECT id FROM pages WHERE slug = 'reacoes-transfusionais'), 1, '2020-2026.1',
       'Karina 2026-11-17 (Fase 1): 2024.2 Q28. Somente Questões; sem Revalida Up, Flashcards, AudioCards ou MedVoice por enquanto.'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source, notes)
SELECT 'Corpo Estranho Nasal', 'corpo-estranho-nasal', (SELECT id FROM specialties WHERE slug = 'outros'),
       (SELECT id FROM pages WHERE slug = 'otorrinolaringologia'), 1, '2020-2026.1',
       'Karina 2026-11-17 (Fase 1): tema próprio no Meu Plano (2025.1 Q87); a questão fica na seção otorrinolaringologia.'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO topic_content (topic_id, resource_type, page_id, note)
SELECT t.id, x.kind, (SELECT id FROM pages WHERE slug = x.page), 'Karina 2026-11-17 (Fase 1)'
  FROM (VALUES ('reacoes-transfusionais', 'quiz', 'reacoes-transfusionais'),
               ('corpo-estranho-nasal', 'quiz', 'otorrinolaringologia'),
               ('corpo-estranho-nasal', 'revalida_up', 'otorrinolaringologia-revalida-up')) x(topic, kind, page)
  JOIN topics t ON t.slug = x.topic
 WHERE NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = x.kind);

UPDATE topics SET name = 'Saúde do Trabalhador' WHERE slug = 'medicina-do-trabalho' AND name <> 'Saúde do Trabalhador';

-- ── A + B. the records ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record; v_n int; v_kept bigint; v_hold bigint := (SELECT id FROM pages WHERE slug = 'questoes-copias-despublicadas');
BEGIN
  UPDATE _f1 f SET
    eq        = (SELECT e.id FROM exam_questions e WHERE e.edition = f.ed AND e.number = f.num),
    src_page  = (SELECT p.id FROM pages p WHERE p.slug = f.src AND p.type = 'h5p-quiz'),
    dest_page = CASE WHEN f.kind = 'move' THEN (SELECT p.id FROM pages p WHERE p.slug = f.dest AND p.type = 'h5p-quiz') ELSE v_hold END;
  IF EXISTS (SELECT 1 FROM _f1 WHERE eq IS NULL OR src_page IS NULL OR dest_page IS NULL) THEN
    RAISE EXCEPTION 'Fase 1: original or section not found for % - nothing changed',
      (SELECT string_agg(ed || ' Q' || num || ' ' || src || '→' || dest, '; ') FROM _f1 WHERE eq IS NULL OR src_page IS NULL OR dest_page IS NULL);
  END IF;

  FOR r IN SELECT * FROM _f1 ORDER BY i LOOP
    SELECT count(*) INTO v_n FROM quiz_questions q WHERE q.page_id = r.src_page AND q.exam_question_id = r.eq;
    IF v_n = 1 THEN
      UPDATE _f1 f SET qid = (SELECT q.id FROM quiz_questions q WHERE q.page_id = r.src_page AND q.exam_question_id = r.eq) WHERE f.i = r.i;
      IF r.kind = 'move' AND EXISTS (SELECT 1 FROM quiz_questions q WHERE q.page_id = r.dest_page AND q.exam_question_id = r.eq) THEN
        RAISE EXCEPTION 'Fase 1: % Q% is already in % - a transfer must not create a duplicate', r.ed, r.num, r.dest;
      END IF;
    ELSIF v_n = 0 AND EXISTS (SELECT 1 FROM quiz_questions q WHERE q.page_id = r.dest_page AND q.exam_question_id = r.eq) THEN
      UPDATE _f1 f SET done = true WHERE f.i = r.i;                       -- re-run: already there
    ELSE
      RAISE EXCEPTION 'Fase 1: expected 1 record of % Q% in %, found % - nothing changed', r.ed, r.num, r.src, v_n;
    END IF;
    IF r.kind = 'copy' THEN
      SELECT count(*), min(q.id) INTO v_n, v_kept
        FROM quiz_questions q JOIN pages p ON p.id = q.page_id
       WHERE p.slug = r.dest AND p.status = 'publish' AND q.exam_question_id = r.eq;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'Fase 1: the copy of % Q% that stays (%) must be published exactly once, found % - nothing changed', r.ed, r.num, r.dest, v_n;
      END IF;
      UPDATE _f1 f SET kept = v_kept WHERE f.i = r.i;
    END IF;
  END LOOP;

  -- slot at the destination: right before the first resident record of a later edition/number
  -- (a resident = a record that neither arrives nor leaves in this patch); none later = the end.
  UPDATE _f1 f SET k = coalesce((
      SELECT min(x.position) FROM quiz_questions x JOIN exam_questions xe ON xe.id = x.exam_question_id
       WHERE x.page_id = f.dest_page AND x.id NOT IN (SELECT qid FROM _f1 WHERE qid IS NOT NULL)
         AND (exam_edition_rank(xe.edition), xe.number) > (exam_edition_rank(f.ed), f.num)) - 0.5, 9000)
   WHERE f.qid IS NOT NULL;

  -- park every touched page clear of UNIQUE (page_id, position), then move
  UPDATE quiz_questions SET position = position + 10000
   WHERE page_id IN (SELECT src_page FROM _f1 WHERE qid IS NOT NULL UNION SELECT dest_page FROM _f1 WHERE qid IS NOT NULL);
  UPDATE quiz_questions q SET page_id = x.dest_page, position = 20000 + x.rn
    FROM (SELECT qid, dest_page, row_number() OVER (ORDER BY qid) AS rn FROM _f1 WHERE qid IS NOT NULL) x
   WHERE q.id = x.qid;
  WITH o AS (
    SELECT q.id, row_number() OVER (
             PARTITION BY q.page_id
             ORDER BY coalesce(10000 + f.k, q.position), exam_edition_rank(e.edition), e.number, q.id) AS rn
      FROM quiz_questions q
      LEFT JOIN _f1 f ON f.qid = q.id
      LEFT JOIN exam_questions e ON e.id = q.exam_question_id
     WHERE q.page_id IN (SELECT src_page FROM _f1 WHERE qid IS NOT NULL UNION SELECT dest_page FROM _f1 WHERE qid IS NOT NULL))
  UPDATE quiz_questions q SET position = o.rn FROM o WHERE q.id = o.id;

  -- history follows the question (transfers) …
  UPDATE quiz_attempts a SET page_id = f.dest_page, specialty_id = p.specialty_id
    FROM _f1 f JOIN pages p ON p.id = f.dest_page
   WHERE f.kind = 'move' AND f.qid IS NOT NULL AND a.question_id = f.qid;
  UPDATE review_schedule rs SET specialty_id = p.specialty_id
    FROM _f1 f JOIN pages p ON p.id = f.dest_page
   WHERE f.kind = 'move' AND f.qid IS NOT NULL AND rs.item_type = 'quiz_question' AND rs.item_id = f.qid;
  -- … and goes to the copy that stays (unpublished copies), unless that student already has history there
  UPDATE review_schedule rs SET item_id = f.kept, specialty_id = kp.specialty_id
    FROM _f1 f JOIN quiz_questions kq ON kq.id = f.kept JOIN pages kp ON kp.id = kq.page_id
   WHERE f.kind = 'copy' AND f.qid IS NOT NULL AND rs.item_type = 'quiz_question' AND rs.item_id = f.qid
     AND NOT EXISTS (SELECT 1 FROM review_schedule o WHERE o.user_id = rs.user_id AND o.item_type = 'quiz_question' AND o.item_id = f.kept);
  UPDATE quiz_attempts a SET question_id = f.kept, page_id = kq.page_id, specialty_id = kp.specialty_id
    FROM _f1 f JOIN quiz_questions kq ON kq.id = f.kept JOIN pages kp ON kp.id = kq.page_id
   WHERE f.kind = 'copy' AND f.qid IS NOT NULL AND a.question_id = f.qid
     AND NOT EXISTS (SELECT 1 FROM quiz_attempts o WHERE o.user_id = a.user_id AND o.question_id = f.kept);
  -- A student who answered BOTH copies keeps both histories; the Revisão row of the unpublished copy is
  -- suspended (kept, never served again — the Revisão does not look at the page status).
  UPDATE review_schedule rs SET suspended = true
    FROM _f1 f
   WHERE f.kind = 'copy' AND f.qid IS NOT NULL AND rs.item_type = 'quiz_question' AND rs.item_id = f.qid AND NOT rs.suspended;
END $$;

-- ── C. primary topic of the 27 originals ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _f1_topic x WHERE NOT EXISTS (SELECT 1 FROM topics t WHERE t.slug = x.topic)
                                          OR NOT EXISTS (SELECT 1 FROM exam_questions e WHERE e.edition = x.ed AND e.number = x.num)) THEN
    RAISE EXCEPTION 'Fase 1: a topic or original of the 27 decisions was not found - nothing changed';
  END IF;
  -- a secondary topic equal to the new primary would be refused by the trigger: none exists today
  IF EXISTS (SELECT 1 FROM _f1_topic x JOIN exam_questions e ON e.edition = x.ed AND e.number = x.num
               JOIN topics t ON t.slug = x.topic
               JOIN exam_question_secondary_topics s ON s.exam_question_id = e.id AND s.topic_id = t.id) THEN
    RAISE EXCEPTION 'Fase 1: a new primary topic is already a secondary topic of the same question - nothing changed';
  END IF;
END $$;
UPDATE exam_questions e
   SET topic_id = t.id, topic_status = 'aprovado',
       topic_note = 'Karina 17/11/2026 (Fase 1): ' || x.note
  FROM _f1_topic x JOIN topics t ON t.slug = x.topic
 WHERE e.edition = x.ed AND e.number = x.num
   AND (e.topic_id IS DISTINCT FROM t.id OR e.topic_status <> 'aprovado'
        OR e.topic_note IS DISTINCT FROM 'Karina 17/11/2026 (Fase 1): ' || x.note);

-- ── E. the four themes ──────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _f1_ret (spec text, spec_name text, label text, topic text, ru text, keep_topic boolean) ON COMMIT DROP;
INSERT INTO _f1_ret VALUES
  ('hematologia', 'Hematologia', 'Microangiopatias Trombóticas', 'microangiopatias-tromboticas', 'microangiopatias-tromboticas-revalida-up', false),
  ('emergencia',  'Emergência',  'Ventilação Mecânica',          'ventilacao-mecanica',          'ventilacao-mecanica-revalida-up',          true),
  ('neurologia',  'Neurologia',  'Delirium',                     'delirium',                     'delirium-revalida-up',                     true);

INSERT INTO pages (id, slug, title, type, status, parent_id, specialty_id, view, track_id, content_module_id, notes,
                   wp_created_at, wp_modified_at)
SELECT (SELECT max(id) FROM pages) + row_number() OVER (ORDER BY r.spec, k.ord),
       'retirados-' || r.spec || k.suffix, r.spec_name || k.title, k.type::page_type, 'draft', NULL,
       (SELECT id FROM specialties WHERE slug = r.spec), k.view::page_view, (SELECT id FROM tracks WHERE slug = k.track), NULL,
       'Karina 17/11/2026 (Fase 1): ' || r.label || ' retirado da área publicada. Não publicar; não apagar.', now(), now()
  FROM _f1_ret r
 CROSS JOIN (VALUES (1, '-flashcards', ' Flashcards — materiais retirados (não publicados)', 'h5p-quiz', 'quiz', 'flashcards'),
                    (2, '-audiocards', ' AudioCards — materiais retirados (não publicados)', 'text-lesson', NULL, 'audiocards')) k(ord, suffix, title, type, view, track)
 WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.slug = 'retirados-' || r.spec || k.suffix);

DO $$
DECLARE r record; g bigint; ret bigint; n int;
BEGIN
  -- her condition (e): what is left of each theme, counted by original question on the theme's own topic
  FOR r IN SELECT * FROM (VALUES ('microangiopatias-tromboticas', 0), ('ventilacao-mecanica', 1), ('delirium', 1), ('demencias', 1)) v(topic, expected) LOOP
    SELECT count(DISTINCT e.id) INTO n
      FROM exam_questions e JOIN topics t ON t.id = e.topic_id
      JOIN quiz_questions q ON q.exam_question_id = e.id JOIN pages p ON p.id = q.page_id AND p.status = 'publish'
     WHERE t.slug = r.topic;
    IF n <> r.expected THEN
      RAISE EXCEPTION 'Fase 1: % keeps % published question(s), expected % - nothing changed', r.topic, n, r.expected;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM quiz_questions q JOIN pages p ON p.id = q.page_id WHERE p.slug = 'microangiopatias-tromboticas') THEN
    RAISE EXCEPTION 'Fase 1: the Microangiopatias Trombóticas section is not empty - nothing changed';
  END IF;
  UPDATE pages SET status = 'draft' WHERE slug = 'microangiopatias-tromboticas' AND status <> 'draft';

  FOR r IN SELECT * FROM _f1_ret LOOP
    ret := (SELECT id FROM pages WHERE slug = 'retirados-' || r.spec || '-flashcards');
    SELECT count(*), min(fg.id) INTO n, g FROM flashcard_groups fg JOIN pages p ON p.id = fg.page_id
     WHERE fg.label = r.label AND p.slug IN (r.spec || '-flashcards', 'retirados-' || r.spec || '-flashcards');
    IF n <> 1 THEN RAISE EXCEPTION 'Fase 1: Flashcards group "%" (%) found % times - nothing changed', r.label, r.spec, n; END IF;
    IF NOT EXISTS (SELECT 1 FROM pages WHERE slug = r.ru AND view = 'revalida-up') THEN
      RAISE EXCEPTION 'Fase 1: Revalida Up % not found - nothing changed', r.ru;
    END IF;

    IF (SELECT page_id FROM flashcard_groups WHERE id = g) <> ret THEN
      INSERT INTO flashcard_group_moves (item_id, from_group_id, from_label, from_deck_id, from_position,
                                         to_group_id, to_label, to_deck_id, to_position, operation, reason)
      SELECT f.id, fg.id, fg.label, fg.page_id, f.position, fg.id, fg.label, ret, f.position, 'retire_group',
             'Retirado da área publicada (Karina 17/11/2026, Fase 1); conteúdo, áudio e identificadores preservados'
        FROM flashcard_items f JOIN flashcard_groups fg ON fg.id = f.group_id WHERE fg.id = g;
      PERFORM move_flashcard_group(g, ret, 1::smallint);
    END IF;
    -- an archived card is never asked again in the Revisão (rows kept, suspended)
    UPDATE review_schedule rs SET suspended = true
     WHERE rs.item_type = 'flashcard' AND NOT rs.suspended AND rs.item_id IN (SELECT id FROM flashcard_items WHERE group_id = g);
    UPDATE pages SET status = 'draft' WHERE slug = r.ru AND status <> 'draft';

    -- Meu Plano: no task may open an archived material. The theme's own topic loses those links (the whole
    -- topic, for Microangiopatias); a link from any OTHER topic to them is unexpected and aborts below.
    DELETE FROM topic_content c USING topics t
     WHERE c.topic_id = t.id AND t.slug = r.topic
       AND (NOT r.keep_topic OR c.flashcard_group_id = g OR c.page_id = (SELECT id FROM pages WHERE slug = r.ru));
    IF EXISTS (SELECT 1 FROM topic_content c WHERE c.flashcard_group_id = g
                  OR c.page_id IN (SELECT id FROM pages WHERE slug IN (r.ru, 'retirados-' || r.spec || '-flashcards', 'retirados-' || r.spec || '-audiocards'))) THEN
      RAISE EXCEPTION 'Fase 1: another Meu Plano topic still points at the archived materials of % - nothing changed', r.label;
    END IF;
  END LOOP;

  UPDATE topics SET notes = 'Karina 17/11/2026 (Fase 1): tema retirado do Meu Plano (sem questão publicada; seção, Revalida Up, Flashcards e AudioCards arquivados).'
   WHERE slug = 'microangiopatias-tromboticas' AND notes IS NULL;
END $$;

-- ── F. Meu Plano → the Revalida Up published in this batch ──────────────────────────────────────────
UPDATE topic_content c SET page_id = (SELECT id FROM pages WHERE slug = 'ortopedia-revalida-up')
  FROM topics t
 WHERE c.topic_id = t.id AND t.slug = 'artrite-infecciosa' AND c.resource_type = 'revalida_up'
   AND c.page_id <> (SELECT id FROM pages WHERE slug = 'ortopedia-revalida-up');
INSERT INTO topic_content (topic_id, resource_type, page_id, note)
SELECT t.id, 'revalida_up', (SELECT id FROM pages WHERE slug = x.page), 'Karina 2026-11-17 (Fase 1)'
  FROM (VALUES ('artrite-infecciosa', 'ortopedia-revalida-up'), ('trauma-osteomielite', 'ortopedia-revalida-up'),
               ('espondiloartrites', 'espondiloartrites-revalida-up')) x(topic, page)
  JOIN topics t ON t.slug = x.topic
 WHERE NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'revalida_up');

SELECT refresh_topic_incidence();

-- ── post-checks ─────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- no question text, alternative, answer key, comment or figure changed; no record created or deleted
  IF EXISTS (SELECT 1 FROM quiz_questions q FULL JOIN _f1_q b ON b.id = q.id
              WHERE q.id IS NULL OR b.id IS NULL OR q.exam_question_id IS DISTINCT FROM b.exam_question_id
                 OR md5(q.question || '|' || coalesce(q.answers::text, '') || '|' || coalesce(q.explanation_html, '') || '|' || coalesce(q.media_url, '')) <> b.h) THEN
    RAISE EXCEPTION 'Fase 1 post-check: a question changed';
  END IF;
  -- every touched section is numbered 1..n
  IF EXISTS (SELECT 1 FROM quiz_questions q
              WHERE q.page_id IN (SELECT src_page FROM _f1 UNION SELECT dest_page FROM _f1)
              GROUP BY q.page_id HAVING min(q.position) <> 1 OR max(q.position) <> count(*)) THEN
    RAISE EXCEPTION 'Fase 1 post-check: a section is not numbered 1..n';
  END IF;
  -- each record is where the decision puts it
  IF EXISTS (SELECT 1 FROM _f1 f WHERE NOT EXISTS (SELECT 1 FROM quiz_questions q WHERE q.page_id = f.dest_page AND q.exam_question_id = f.eq)
                                    OR EXISTS (SELECT 1 FROM quiz_questions q WHERE q.page_id = f.src_page AND q.exam_question_id = f.eq)) THEN
    RAISE EXCEPTION 'Fase 1 post-check: a record is not at its destination';
  END IF;
  -- one published location per original for the 27, and none lost
  IF EXISTS (SELECT 1 FROM _f1_topic x JOIN exam_questions e ON e.edition = x.ed AND e.number = x.num
              WHERE (SELECT count(*) FROM quiz_questions q JOIN pages p ON p.id = q.page_id AND p.status = 'publish'
                      WHERE q.exam_question_id = e.id) <> CASE WHEN (x.ed, x.num) = ('2022.2', 58) THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'Fase 1 post-check: one of the 27 originals is not published exactly once (2022.2 Q58: twice, by her decision)';
  END IF;
  IF (SELECT count(DISTINCT q.exam_question_id) FROM quiz_questions q JOIN pages p ON p.id = q.page_id WHERE p.status = 'publish')
       <> (SELECT originals FROM _f1_before)
     OR (SELECT coalesce(sum(incidence_count), 0) FROM topics) <> (SELECT incidence_sum FROM _f1_before) THEN
    RAISE EXCEPTION 'Fase 1 post-check: the number of published originals or the total incidence changed';
  END IF;
  -- incidence = live count, for every topic
  IF EXISTS (SELECT 1 FROM topics t WHERE t.incidence_count <> topic_incidence_count(t.id)) THEN
    RAISE EXCEPTION 'Fase 1 post-check: a topic incidence differs from the live count';
  END IF;
  IF (SELECT incidence_count FROM topics WHERE slug = 'reacoes-transfusionais') <> 1
     OR (SELECT incidence_count FROM topics WHERE slug = 'corpo-estranho-nasal') <> 1
     OR (SELECT incidence_count FROM topics WHERE slug = 'microangiopatias-tromboticas') <> 0 THEN
    RAISE EXCEPTION 'Fase 1 post-check: unexpected incidence on a new or retired topic';
  END IF;
  -- cards and AudioCards: same ids, text, audio (only the three groups changed deck)
  IF EXISTS (SELECT 1 FROM flashcard_items f FULL JOIN _f1_cards b ON b.id = f.id
              WHERE f.id IS NULL OR b.id IS NULL OR (f.text, f.answer, f.group_id, f.position) IS DISTINCT FROM (b.text, b.answer, b.group_id, b.position)) THEN
    RAISE EXCEPTION 'Fase 1 post-check: a card changed';
  END IF;
  IF EXISTS (SELECT 1 FROM lessons l JOIN _f1_lessons b ON b.id = l.id
              WHERE (l.body_html, l.audio_url, l.title) IS DISTINCT FROM (b.body_html, b.audio_url, b.title))
     OR EXISTS (SELECT 1 FROM _f1_lessons b WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = b.id)) THEN
    RAISE EXCEPTION 'Fase 1 post-check: a lesson (AudioCard, Revalida Up, MedVoice…) changed';
  END IF;
  IF EXISTS (SELECT 1 FROM _f1_ret r JOIN flashcard_groups g ON g.label = r.label
               JOIN pages d ON d.id = g.page_id AND d.slug = 'retirados-' || r.spec || '-flashcards'
               JOIN lessons l ON l.id = g.audiocard_lesson_id
              WHERE l.page_id <> (SELECT id FROM pages WHERE slug = 'retirados-' || r.spec || '-audiocards'))
     OR (SELECT count(*) FROM _f1_ret r JOIN flashcard_groups g ON g.label = r.label
           JOIN pages d ON d.id = g.page_id AND d.slug = 'retirados-' || r.spec || '-flashcards') <> 3
     OR EXISTS (SELECT 1 FROM pages WHERE status = 'publish'
                 AND (slug LIKE 'retirados-%' OR slug = 'questoes-copias-despublicadas'
                      OR slug IN (SELECT ru FROM _f1_ret) OR slug = 'microangiopatias-tromboticas')) THEN
    RAISE EXCEPTION 'Fase 1 post-check: an archived material is still published or lost its AudioCard';
  END IF;
  -- Revisão: nothing active on an unpublished copy or an archived card
  IF EXISTS (SELECT 1 FROM review_schedule rs JOIN quiz_questions q ON q.id = rs.item_id JOIN pages p ON p.id = q.page_id
              WHERE rs.item_type = 'quiz_question' AND NOT rs.suspended AND p.slug = 'questoes-copias-despublicadas')
     OR EXISTS (SELECT 1 FROM review_schedule rs JOIN flashcard_items f ON f.id = rs.item_id JOIN flashcard_groups g ON g.id = f.group_id
                  JOIN pages p ON p.id = g.page_id
                 WHERE rs.item_type = 'flashcard' AND NOT rs.suspended AND p.slug IN (SELECT 'retirados-' || spec || '-flashcards' FROM _f1_ret)) THEN
    RAISE EXCEPTION 'Fase 1 post-check: an active Revisão row points at an unpublished copy or archived card';
  END IF;
  -- Meu Plano: nothing created here points at an unpublished page
  IF EXISTS (SELECT 1 FROM topic_content c JOIN pages p ON p.id = c.page_id
              WHERE p.status <> 'publish' AND NOT EXISTS (SELECT 1 FROM topic_content_bk_fase1 b WHERE b.id = c.id AND b.page_id = c.page_id)) THEN
    RAISE EXCEPTION 'Fase 1 post-check: a new Meu Plano link points at an unpublished page';
  END IF;
END $$;

COMMIT;

-- ── what changed (printed by run-sql.js) ────────────────────────────────────────────────────────────
SELECT t.id, t.name, b.incidence_count AS antes, t.incidence_count AS depois, b.priority_tier AS faixa_antes, t.priority_tier AS faixa_depois
  FROM topics t LEFT JOIN topics_bk_fase1 b ON b.id = t.id
 WHERE b.id IS NULL OR (t.incidence_count, t.priority_tier, t.name) IS DISTINCT FROM (b.incidence_count, b.priority_tier, b.name)
 ORDER BY t.name;
