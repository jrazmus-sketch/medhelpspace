-- ⚠ TEST ONLY — NOT FOR PRODUCTION until Karina finishes her pedagogical update of Coluna Vertebral e
-- Trauma Raquimedular (her e-mail of 15/11/2026: "a união definitiva dos materiais na produção continuará
-- aguardando minha atualização").
--
-- Unites Cirurgia Geral › "Trauma Raquimedular" (25 cards, C1–C25) into Neurologia › "Coluna Vertebral e
-- Trauma Raquimedular" (30 cards, N1–N30) = ONE group of 55 cards in Neurologia (her decision of 14/11/2026):
-- no card removed, transferred individually, deleted or rewritten; N7, N26, N29 and N30 stay; the redundant
-- pairs (C14/N22, C18/N23, C19/N24, C21/N25) are kept side by side and only recorded. Order = the
-- pedagogical order of the 14/11 report, with each redundant card next to its equivalent:
--   1 Lombalgia → cauda equina      N1–N17
--   2 Trauma: abordagem e liberação N18, C1–C8, N19, N20, N21
--   3 Exame neurológico             N22, C14, C15, C16, C17, C9, C10, C12, C13, N24, C19, C25, N23, C18
--   4 Força muscular                C20, C21, N25, C11, C22, C23, C24, N26
--   5 Escoliose                     N27, N28
--   6 Espondiloartrite axial        N29, N30 (until the Espondiloartrites materials exist)
-- Meu Plano: Patologias da Coluna Vertebral (76) and Trauma Raquimedular (123) stay separate topics and
-- both open the unified group. The Cirurgia Geral AudioCard stays published (detached) until she validates.
-- Rollback: coluna-merge-TEST-ONLY-rollback.sql (exact).

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('merge_flashcard_groups(bigint,bigint,bigint[],text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'apply schema-patch-merge-flashcard-groups.sql first';
  END IF;
END $$;

CREATE TABLE flashcard_groups_bk_coluna AS SELECT * FROM flashcard_groups;
CREATE TABLE flashcard_items_bk_coluna AS SELECT * FROM flashcard_items;
CREATE TABLE lessons_bk_coluna AS
  SELECT l.* FROM lessons l JOIN pages p ON p.id = l.page_id WHERE p.track_id = (SELECT id FROM tracks WHERE slug = 'audiocards');
CREATE TABLE topic_content_bk_coluna AS SELECT * FROM topic_content;
CREATE TABLE flashcard_theme_topics_bk_coluna AS SELECT * FROM flashcard_theme_topics;
CREATE TABLE review_schedule_bk_coluna AS SELECT * FROM review_schedule WHERE item_type = 'flashcard';
CREATE TABLE flashcard_group_moves_bk_coluna AS SELECT * FROM flashcard_group_moves;
ALTER TABLE flashcard_groups_bk_coluna ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_items_bk_coluna ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons_bk_coluna ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_content_bk_coluna ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_theme_topics_bk_coluna ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_schedule_bk_coluna ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_group_moves_bk_coluna ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_grp bigint; c_grp bigint; ord bigint[];
  seq text[] := ARRAY[
    'N1','N2','N3','N4','N5','N6','N7','N8','N9','N10','N11','N12','N13','N14','N15','N16','N17',
    'N18','C1','C2','C3','C4','C5','C6','C7','C8','N19','N20','N21',
    'N22','C14','C15','C16','C17','C9','C10','C12','C13','N24','C19','C25','N23','C18',
    'C20','C21','N25','C11','C22','C23','C24','N26',
    'N27','N28',
    'N29','N30'];
BEGIN
  SELECT g.id INTO n_grp FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
   WHERE p.slug = 'neurologia-flashcards' AND g.label = 'Coluna Vertebral e Trauma Raquimedular';
  SELECT g.id INTO c_grp FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
   WHERE p.slug = 'cirurgia-geral-flashcards' AND g.label = 'Trauma Raquimedular';
  IF n_grp IS NULL OR c_grp IS NULL
     OR (SELECT count(*) FROM flashcard_items WHERE group_id = n_grp) <> 30
     OR (SELECT count(*) FROM flashcard_items WHERE group_id = c_grp) <> 25
     OR cardinality(seq) <> 55 THEN
    RAISE EXCEPTION 'Coluna: unexpected state - nothing changed';
  END IF;
  SELECT array_agg(f.id ORDER BY s.ord) INTO ord
    FROM unnest(seq) WITH ORDINALITY s(code, ord)
    JOIN flashcard_items f ON f.group_id = CASE left(s.code, 1) WHEN 'N' THEN n_grp ELSE c_grp END
                          AND f.position = substr(s.code, 2)::int;
  PERFORM merge_flashcard_groups(c_grp, n_grp, ord,
    'Coluna Vertebral e Trauma Raquimedular: grupo único em Neurologia (Karina 14/11/2026) — TESTE');
END $$;

-- post-checks: 55 cards, same ids and texts, both topics open the unified group, the CG AudioCard kept
DO $$
DECLARE g bigint;
BEGIN
  SELECT gg.id INTO g FROM flashcard_groups gg JOIN pages p ON p.id = gg.page_id
   WHERE p.slug = 'neurologia-flashcards' AND gg.label = 'Coluna Vertebral e Trauma Raquimedular';
  IF (SELECT count(*) FROM flashcard_items WHERE group_id = g) <> 55 THEN RAISE EXCEPTION 'Coluna post-check: not 55 cards'; END IF;
  IF EXISTS (SELECT 1 FROM flashcard_items f FULL JOIN flashcard_items_bk_coluna b ON b.id = f.id
              WHERE f.id IS NULL OR b.id IS NULL OR (f.text, f.answer) IS DISTINCT FROM (b.text, b.answer)) THEN
    RAISE EXCEPTION 'Coluna post-check: a card text changed or a card is missing';
  END IF;
  IF (SELECT count(DISTINCT c.topic_id) FROM topic_content c JOIN topics t ON t.id = c.topic_id
       WHERE c.flashcard_group_id = g AND t.slug IN ('patologias-da-coluna-vertebral', 'trauma-raquimedular')) <> 2 THEN
    RAISE EXCEPTION 'Coluna post-check: the two topics do not both open the unified group';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lessons l JOIN pages p ON p.id = l.page_id
                  WHERE p.slug = 'cirurgia-geral-audiocards' AND l.title = 'Trauma Raquimedular' AND l.audio_url IS NOT NULL) THEN
    RAISE EXCEPTION 'Coluna post-check: the Cirurgia Geral AudioCard is gone';
  END IF;
  IF EXISTS (SELECT 1 FROM lessons l JOIN lessons_bk_coluna b ON b.id = l.id WHERE l.audio_url IS DISTINCT FROM b.audio_url) THEN
    RAISE EXCEPTION 'Coluna post-check: an audio file changed';
  END IF;
END $$;

COMMIT;
