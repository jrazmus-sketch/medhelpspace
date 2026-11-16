-- schema-patch-r5-labels-cardiopatia-2026-11-16.sql
--
-- Karina 2026-11-16 15h22 BRT ("Re: … Incidência automática publicada e lista única de trabalho"):
--   A. R5 — keep 3237 and 3241 (Neurologia › Coluna Vertebral e Trauma Raquimedular) and UNPUBLISH, without
--      deleting, 2633 and 2634 (Cirurgia Geral › Trauma Raquimedular). Page 2451 holds exactly those two records,
--      so the page goes to draft (records, attempts and Revisão untouched). Incidence does not change: both
--      originals stay published through the Neurologia copies. The hub card is hidden by the renderer (it skips
--      unpublished targets), nothing is deleted.
--   B. The 11 wrong labels "Questão N · Revalida AAAA" — ONLY the label inside <strong>…</strong>; statement,
--      alternatives, answer key, comment and classification untouched. Each record is checked against its
--      original (exam_question link) first; an inconsistent one is SKIPPED and reported, never changed.
--   C. MedVoice "Cardiopatias Congênitas" (lesson 437): Cardiologia MedVoice → Pediatria MedVoice (alphabetical
--      slot, after Bronquiolite). Same lesson id, text and audio; the student's completion follows it.
--   D. Resumo Narrativo "Cardiopatia Congênita" (page 1623): Cardiologia → Pediatria, content untouched; its hub
--      card moves from Cardiologia Resumos to Pediatria Resumos (alphabetical slot). Same id and slug, so
--      Questões remediation (<section>-resumos) keeps finding it. import-resumos-v2.js has a SPECIALTY_OVERRIDES
--      entry so a re-import cannot move it back.
--
-- Backups: *_bk_nov16. Rollback: schema-patch-r5-labels-cardiopatia-2026-11-16-rollback.sql. Re-run safe.

BEGIN;

CREATE TABLE IF NOT EXISTS pages_bk_nov16 AS SELECT * FROM pages WHERE id IN (2451, 1623);
CREATE TABLE IF NOT EXISTS quiz_questions_bk_nov16 AS
  SELECT id, question FROM quiz_questions WHERE id IN (2565, 2711, 2779, 3048, 3208, 3229, 2827, 2844, 2858, 2859, 2876);
CREATE TABLE IF NOT EXISTS lessons_bk_nov16 AS SELECT id, page_id, position FROM lessons WHERE page_id IN (3606, 3678);
CREATE TABLE IF NOT EXISTS lesson_completions_bk_nov16 AS SELECT * FROM lesson_completions WHERE lesson_id = 437;
CREATE TABLE IF NOT EXISTS nav_items_bk_nov16 AS SELECT * FROM nav_items WHERE source_page_id IN (1656, 90011);
CREATE TABLE IF NOT EXISTS topics_incidence_bk_nov16 AS SELECT id, incidence_count FROM topics;
ALTER TABLE pages_bk_nov16 ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions_bk_nov16 ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons_bk_nov16 ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_completions_bk_nov16 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_items_bk_nov16 ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics_incidence_bk_nov16 ENABLE ROW LEVEL SECURITY;

-- ── A. R5 ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM quiz_questions WHERE page_id = 2451) IS DISTINCT FROM ARRAY[2633, 2634]::bigint[] THEN
    RAISE EXCEPTION 'R5: page 2451 must hold exactly records 2633 and 2634';
  END IF;
  -- each Cirurgia Geral record's original must stay published through its Neurologia copy
  IF EXISTS (
    SELECT 1 FROM quiz_questions cg
    WHERE cg.id IN (2633, 2634) AND NOT EXISTS (
      SELECT 1 FROM quiz_questions n JOIN pages p ON p.id = n.page_id
      WHERE n.id IN (3237, 3241) AND n.exam_question_id = cg.exam_question_id AND p.status = 'publish')
  ) THEN
    RAISE EXCEPTION 'R5: a Neurologia copy (3237/3241) of 2633/2634 is missing or unpublished';
  END IF;
END $$;
UPDATE pages SET status = 'draft' WHERE id = 2451 AND status = 'publish';

-- ── B. Labels (3208 before 2779: 2779 takes the label 3208 holds today) ────────
CREATE TEMP TABLE _labels (ord int, id bigint, edition text, number int) ON COMMIT DROP;
INSERT INTO _labels VALUES
  (1, 3208, '2020', 67), (2, 2779, '2020', 66), (3, 2565, '2022.2', 32), (4, 2711, '2022.2', 47),
  (5, 3048, '2021', 19), (6, 3229, '2022.2', 55), (7, 2827, '2021', 46), (8, 2844, '2021', 72),
  (9, 2858, '2021', 3), (10, 2859, '2021', 53), (11, 2876, '2021', 60);
DO $$
DECLARE r record; cur text; want text; n int; done int := 0;
BEGIN
  FOR r IN SELECT * FROM _labels ORDER BY ord LOOP
    want := '<strong>Questão ' || r.number || ' · Revalida ' || r.edition || '</strong>';
    SELECT substring(q.question FROM '<strong>Questão [0-9]+ · Revalida [0-9.]+</strong>'),
           (SELECT count(*) FROM regexp_matches(q.question, '<strong>Questão [0-9]+ · Revalida [0-9.]+</strong>', 'g'))
      INTO cur, n
      FROM quiz_questions q JOIN exam_questions e ON e.id = q.exam_question_id
     WHERE q.id = r.id AND e.edition = r.edition AND e.number = r.number;
    IF cur = want THEN
      CONTINUE;                                  -- already right (re-run)
    ELSIF cur IS NULL OR n <> 1 THEN
      RAISE NOTICE 'label SKIPPED: record % (not linked to % Q% or label not found exactly once)', r.id, r.edition, r.number;
    ELSIF EXISTS (SELECT 1 FROM quiz_questions o JOIN pages p ON p.id = o.page_id
                   WHERE o.id <> r.id AND p.status = 'publish' AND position(want IN o.question) > 0
                     AND o.exam_question_id IS DISTINCT FROM (SELECT exam_question_id FROM quiz_questions WHERE id = r.id)) THEN
      RAISE NOTICE 'label SKIPPED: record % — another published record of a different original already says %', r.id, want;
    ELSE
      UPDATE quiz_questions SET question = replace(question, cur, want) WHERE id = r.id;
      done := done + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'labels corrected: %', done;
END $$;

-- ── C. MedVoice lesson 437 → Pediatria MedVoice ────────────────────────────────
DO $$
DECLARE slot int;
BEGIN
  IF (SELECT page_id FROM lessons WHERE id = 437) = 3606 THEN
    -- close the gap in Cardiologia
    UPDATE lessons SET position = position + 1000 WHERE page_id = 3606 AND position > (SELECT position FROM lessons WHERE id = 437);
    UPDATE lessons SET page_id = 3678, position = -437 WHERE id = 437;
    UPDATE lessons SET position = position - 1001 WHERE page_id = 3606 AND position > 1000;
    -- alphabetical slot in Pediatria: right after Bronquiolite
    slot := (SELECT position FROM lessons WHERE page_id = 3678 AND title = 'Bronquiolite') + 1;
    IF slot IS NULL THEN RAISE EXCEPTION 'Pediatria MedVoice: Bronquiolite not found'; END IF;
    UPDATE lessons SET position = position + 1000 WHERE page_id = 3678 AND position >= slot AND id <> 437;
    UPDATE lessons SET position = slot WHERE id = 437;
    UPDATE lessons SET position = position - 999 WHERE page_id = 3678 AND position > 1000;
    UPDATE lesson_completions SET page_id = 3678 WHERE lesson_id = 437 AND page_id = 3606;
  END IF;
END $$;

-- ── D. Resumo 1623 → Pediatria ────────────────────────────────────────────────
DO $$
DECLARE oldpos int; slot int;
BEGIN
  IF (SELECT specialty_id FROM pages WHERE id = 1623) = 1 THEN
    UPDATE pages SET specialty_id = 16, parent_id = 90011 WHERE id = 1623;
    SELECT position INTO oldpos FROM nav_items WHERE id = 1664 AND source_page_id = 1656;
    IF oldpos IS NULL THEN RAISE EXCEPTION 'nav_item 1664 not on Cardiologia Resumos'; END IF;
    UPDATE nav_items SET source_page_id = 90011, position = -1664 WHERE id = 1664;
    UPDATE nav_items SET position = position + 1000 WHERE source_page_id = 1656 AND position > oldpos;
    UPDATE nav_items SET position = position - 1001 WHERE source_page_id = 1656 AND position > 1000;
    slot := (SELECT position FROM nav_items WHERE source_page_id = 90011 AND label = 'Bronquiolite') + 1;
    IF slot IS NULL THEN RAISE EXCEPTION 'Pediatria Resumos: Bronquiolite card not found'; END IF;
    UPDATE nav_items SET position = position + 1000 WHERE source_page_id = 90011 AND position >= slot AND id <> 1664;
    UPDATE nav_items SET position = slot WHERE id = 1664;
    UPDATE nav_items SET position = position - 999 WHERE source_page_id = 90011 AND position > 1000;
  END IF;
END $$;

-- ── Post-checks ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM topics t JOIN topics_incidence_bk_nov16 b ON b.id = t.id WHERE t.incidence_count <> b.incidence_count) THEN
    RAISE EXCEPTION 'incidence changed — R5 must not change it';
  END IF;
  IF (SELECT count(*) FROM quiz_questions WHERE id IN (2633, 2634)) <> 2 THEN RAISE EXCEPTION 'R5 record missing'; END IF;
  IF EXISTS (SELECT 1 FROM lessons WHERE page_id IN (3606, 3678) GROUP BY page_id HAVING max(position) <> count(*) OR min(position) <> 1) THEN
    RAISE EXCEPTION 'MedVoice positions not contiguous';
  END IF;
  IF EXISTS (SELECT 1 FROM nav_items WHERE source_page_id IN (1656, 90011) GROUP BY source_page_id HAVING max(position) <> count(*) OR min(position) <> 1) THEN
    RAISE EXCEPTION 'Resumos hub positions not contiguous';
  END IF;
  -- statement text other than the label: identical
  IF EXISTS (SELECT 1 FROM quiz_questions q JOIN quiz_questions_bk_nov16 b ON b.id = q.id
             WHERE regexp_replace(q.question, '<strong>Questão [0-9]+ · Revalida [0-9.]+</strong>', '') <>
                   regexp_replace(b.question, '<strong>Questão [0-9]+ · Revalida [0-9.]+</strong>', '')) THEN
    RAISE EXCEPTION 'something other than the label changed';
  END IF;
END $$;

COMMIT;
