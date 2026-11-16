-- schema-patch-trm-cirurgia-geral-retirada.sql
--
-- Karina 2026-11-15 (item 5): the OLD Cirurgia Geral Trauma Raquimedular materials leave the published area.
-- Coluna Vertebral e Trauma Raquimedular stays in Clínica Médica › Neurologia (its definitive place), with the
-- Neurologia Flashcards/AudioCards/Revalida Up UNCHANGED until she updates them. The 55-card union is NOT done.
--
--   • Flashcards "Trauma Raquimedular" (Cirurgia Geral, 25 cards) and its AudioCard (same lesson, audio file,
--     transcript) move together — move_flashcard_group(), same ids — to two NEW, NEVER-PUBLISHED pages
--     ("retirados-cirurgia-geral-flashcards" / "-audiocards", status draft). Unpublished = out of the members'
--     area; NOTHING is deleted: cards, lesson, audio URL, transcript and every id stay, so a rollback (or Karina)
--     can bring the group back exactly.
--   • Revalida Up "Trauma Raquimedular Revalida Up" (Cirurgia Geral) → status draft (the page and its text stay).
--   • Meu Plano: topic Trauma Raquimedular opens the Neurologia group "Coluna Vertebral e Trauma Raquimedular"
--     (by its stable id, R4b) and the Neurologia Revalida Up — the same materials as Patologias da Coluna
--     Vertebral; the plan shows them once when both topics fall on the same day (derive.ts dedupe).
--   • Every card of the retired group is written to flashcard_group_moves (operation 'retire_group').
--   Not touched: questions (the CG "Trauma Raquimedular" section and its records — R5 is separate), the CG
--   Resumo, the MedVoice lesson, Fórmula, any text, any audio.
--
-- Depends on: schema-patch-r4b-stable-group-ids.sql (links by id) and schema-patch-ortopedia-flashcard-groups.sql
-- (flashcard_group_moves). Backups: full rows (*_bk_trm). Rollback: schema-patch-trm-cirurgia-geral-retirada-rollback.sql
-- (exact, timestamps included). Re-run safe.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.flashcard_group_moves') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'topic_content' AND column_name = 'flashcard_group_id') THEN
    RAISE EXCEPTION 'apply R4b and the Ortopedia flashcards patch first - nothing changed';
  END IF;
  IF (SELECT count(*) FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
       WHERE g.label = 'Trauma Raquimedular' AND p.slug IN ('cirurgia-geral-flashcards', 'retirados-cirurgia-geral-flashcards')) <> 1
     OR (SELECT count(*) FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
          WHERE g.label = 'Coluna Vertebral e Trauma Raquimedular' AND p.slug = 'neurologia-flashcards') <> 1
     OR NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'trauma-raquimedular-revalida-up' AND view = 'revalida-up')
     OR NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'coluna-vertebral-trauma-raquimedular-revalida-up' AND status = 'publish')
     OR NOT EXISTS (SELECT 1 FROM topics WHERE slug = 'trauma-raquimedular') THEN
    RAISE EXCEPTION 'TRM retirement: unexpected state - nothing changed';
  END IF;
END $$;

-- ── backups (full rows) ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_groups_bk_trm AS SELECT * FROM flashcard_groups;
CREATE TABLE IF NOT EXISTS flashcard_items_bk_trm AS SELECT * FROM flashcard_items;
CREATE TABLE IF NOT EXISTS lessons_bk_trm AS
  SELECT l.* FROM lessons l JOIN pages p ON p.id = l.page_id
   WHERE p.track_id = (SELECT id FROM tracks WHERE slug = 'audiocards') OR p.slug = 'trauma-raquimedular-revalida-up';
CREATE TABLE IF NOT EXISTS topic_content_bk_trm AS SELECT * FROM topic_content;
CREATE TABLE IF NOT EXISTS pages_bk_trm AS SELECT * FROM pages WHERE slug = 'trauma-raquimedular-revalida-up';
CREATE TABLE IF NOT EXISTS review_schedule_bk_trm AS SELECT * FROM review_schedule WHERE item_type = 'flashcard';
ALTER TABLE flashcard_groups_bk_trm ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_items_bk_trm ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons_bk_trm ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_content_bk_trm ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages_bk_trm ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_schedule_bk_trm ENABLE ROW LEVEL SECURITY;
CREATE TEMP TABLE _trm_cards ON COMMIT DROP AS SELECT id, text, answer, group_id, position FROM flashcard_items;
CREATE TEMP TABLE _trm_lessons ON COMMIT DROP AS SELECT id, body_html, audio_url, title FROM lessons;

-- ── the two never-published pages that keep the retired group ─────────────────────────────────────
INSERT INTO pages (id, slug, title, type, status, parent_id, specialty_id, view, track_id, content_module_id, notes,
                   wp_created_at, wp_modified_at)
SELECT (SELECT max(id) + 1 FROM pages), 'retirados-cirurgia-geral-flashcards',
       'Cirurgia Geral Flashcards — materiais retirados (não publicados)', 'h5p-quiz', 'draft', NULL,
       (SELECT id FROM specialties WHERE slug = 'cirurgia-geral'), 'quiz', (SELECT id FROM tracks WHERE slug = 'flashcards'),
       NULL, 'Karina 15/11/2026: Trauma Raquimedular (Cirurgia Geral) retirado da área publicada. Não publicar; não apagar.',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'retirados-cirurgia-geral-flashcards');
INSERT INTO pages (id, slug, title, type, status, parent_id, specialty_id, view, track_id, content_module_id, notes,
                   wp_created_at, wp_modified_at)
SELECT (SELECT max(id) + 1 FROM pages), 'retirados-cirurgia-geral-audiocards',
       'Cirurgia Geral AudioCards — materiais retirados (não publicados)', 'text-lesson', 'draft', NULL,
       (SELECT id FROM specialties WHERE slug = 'cirurgia-geral'), NULL, (SELECT id FROM tracks WHERE slug = 'audiocards'),
       NULL, 'Karina 15/11/2026: AudioCard Trauma Raquimedular (Cirurgia Geral) retirado da área publicada. Não publicar; não apagar.',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'retirados-cirurgia-geral-audiocards');

DO $$
DECLARE
  ret    bigint := (SELECT id FROM pages WHERE slug = 'retirados-cirurgia-geral-flashcards');
  g_trm  bigint;
  g_col  bigint;
  ru_old bigint := (SELECT id FROM pages WHERE slug = 'trauma-raquimedular-revalida-up');
  ru_new bigint := (SELECT id FROM pages WHERE slug = 'coluna-vertebral-trauma-raquimedular-revalida-up');
  t_trm  bigint := (SELECT id FROM topics WHERE slug = 'trauma-raquimedular');
BEGIN
  SELECT g.id INTO g_trm FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
   WHERE g.label = 'Trauma Raquimedular' AND p.slug IN ('cirurgia-geral-flashcards', 'retirados-cirurgia-geral-flashcards');
  SELECT g.id INTO g_col FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
   WHERE g.label = 'Coluna Vertebral e Trauma Raquimedular' AND p.slug = 'neurologia-flashcards';

  IF (SELECT page_id FROM flashcard_groups WHERE id = g_trm) <> ret THEN
    INSERT INTO flashcard_group_moves (item_id, from_group_id, from_label, from_deck_id, from_position,
                                       to_group_id, to_label, to_deck_id, to_position, operation, reason)
    SELECT f.id, g.id, g.label, g.page_id, f.position, g.id, g.label, ret, f.position, 'retire_group',
           'Retirado da área publicada (Karina 15/11/2026); conteúdo, áudio e identificadores preservados'
      FROM flashcard_items f JOIN flashcard_groups g ON g.id = f.group_id WHERE g.id = g_trm;
    PERFORM move_flashcard_group(g_trm, ret, 1::smallint);
  END IF;

  UPDATE pages SET status = 'draft' WHERE id = ru_old AND status <> 'draft';

  -- Meu Plano: Trauma Raquimedular → the Neurologia materials (no link may keep pointing at the retired ones)
  UPDATE topic_content SET flashcard_group_id = g_col
   WHERE topic_id = t_trm AND resource_type = 'flashcards' AND flashcard_group_id IS DISTINCT FROM g_col;
  UPDATE topic_content SET page_id = ru_new
   WHERE resource_type = 'revalida_up' AND page_id = ru_old;
  IF EXISTS (SELECT 1 FROM topic_content WHERE flashcard_group_id = g_trm OR page_id IN (ru_old, ret)) THEN
    RAISE EXCEPTION 'TRM retirement: a Meu Plano link still points at the retired materials';
  END IF;
END $$;

-- ── post-checks ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- no card text, answer, id, group or position changed (only the retired group's deck)
  IF EXISTS (SELECT 1 FROM flashcard_items f FULL JOIN _trm_cards b ON b.id = f.id
              WHERE f.id IS NULL OR b.id IS NULL OR (f.text, f.answer, f.group_id, f.position) IS DISTINCT FROM (b.text, b.answer, b.group_id, b.position)) THEN
    RAISE EXCEPTION 'TRM post-check: a card changed';
  END IF;
  -- AudioCards: same ids, same audio, same transcript
  IF EXISTS (SELECT 1 FROM lessons l FULL JOIN _trm_lessons b ON b.id = l.id
              WHERE l.id IS NULL OR b.id IS NULL OR (l.body_html, l.audio_url, l.title) IS DISTINCT FROM (b.body_html, b.audio_url, b.title)) THEN
    RAISE EXCEPTION 'TRM post-check: an AudioCard changed';
  END IF;
  -- the retired AudioCard followed its group; nothing on the retired pages is published
  IF EXISTS (SELECT 1 FROM flashcard_groups g JOIN lessons l ON l.id = g.audiocard_lesson_id
              WHERE g.page_id = (SELECT id FROM pages WHERE slug = 'retirados-cirurgia-geral-flashcards')
                AND l.page_id <> (SELECT id FROM pages WHERE slug = 'retirados-cirurgia-geral-audiocards'))
     OR EXISTS (SELECT 1 FROM pages WHERE slug IN ('retirados-cirurgia-geral-flashcards', 'retirados-cirurgia-geral-audiocards',
                                                   'trauma-raquimedular-revalida-up') AND status = 'publish') THEN
    RAISE EXCEPTION 'TRM post-check: retired material still published';
  END IF;
END $$;

COMMIT;
