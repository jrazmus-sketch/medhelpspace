-- schema-patch-ortopedia-flashcard-groups.sql
--
-- Ortopedia in Outros (Karina 2026-11-13/14: structure approved, "identificação 'Ortopedia' acima dos dois
-- grupos, sem mudar os títulos"). TEST ONLY until she authorizes the structural transfers.
--
--   • "Trauma e Infecções Musculoesqueléticas" (Cirurgia Geral, 22 cards) and "Artrite Infecciosa"
--     (Reumatologia, 28 cards) move to Outros, in the order Oftalmologia → Ortopedia (these two) →
--     Otorrinolaringologia → Urologia. Flashcards and AudioCards move TOGETHER with move_flashcard_group():
--     same card ids, same AudioCard lesson ids, same audio files, same transcripts, Revisão rows kept.
--   • New column flashcard_groups.area: the area shown ABOVE a group's name (Flashcards and AudioCards).
--     Both groups get area = 'Ortopedia'; their titles do not change.
--   • Meu Plano: "Osteomielite e Infecções Osteoarticulares" (topic 129, renamed by R2) opens the 22-card
--     group; "Artrite Infecciosa" (103) keeps opening its group — the link follows the group by id (R4b).
--   • Every move is written to flashcard_group_moves (one row per card), the reorganization log.
--   No text, card, audio, title or question is changed.
--
-- Depends on: schema-patch-r4b-stable-group-ids.sql (links by id) and schema-patch-r2-topics-reorg.sql
-- (topic 129 renamed + moved to Outros, so the plan shows it under Outros).
-- Backups: full rows of everything a move can touch (*_bk_orto_fc).
-- Rollback: schema-patch-ortopedia-flashcard-groups-rollback.sql (exact, timestamps included).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.topic_content_bk_r4b') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'topic_content' AND column_name = 'flashcard_group_id') THEN
    RAISE EXCEPTION 'apply schema-patch-r4b-stable-group-ids.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM topics WHERE slug = 'trauma-osteomielite' AND name = 'Osteomielite e Infecções Osteoarticulares') THEN
    RAISE EXCEPTION 'apply schema-patch-r2-topics-reorg.sql first';
  END IF;
END $$;

-- ── backups (full rows) ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_groups_bk_orto_fc AS SELECT * FROM flashcard_groups;
CREATE TABLE IF NOT EXISTS flashcard_items_bk_orto_fc AS SELECT * FROM flashcard_items;
CREATE TABLE IF NOT EXISTS lessons_bk_orto_fc AS
  SELECT l.* FROM lessons l JOIN pages p ON p.id = l.page_id WHERE p.track_id = (SELECT id FROM tracks WHERE slug = 'audiocards');
CREATE TABLE IF NOT EXISTS topic_content_bk_orto_fc AS SELECT * FROM topic_content;
CREATE TABLE IF NOT EXISTS flashcard_theme_topics_bk_orto_fc AS SELECT * FROM flashcard_theme_topics;
CREATE TABLE IF NOT EXISTS review_schedule_bk_orto_fc AS SELECT * FROM review_schedule WHERE item_type = 'flashcard';
CREATE TEMP TABLE _orto_cards ON COMMIT DROP AS SELECT id, text, answer, group_id, position FROM flashcard_items;
CREATE TEMP TABLE _orto_lessons ON COMMIT DROP AS SELECT id, body_html, audio_url, title FROM lessons;
ALTER TABLE flashcard_groups_bk_orto_fc ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_items_bk_orto_fc ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons_bk_orto_fc ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_content_bk_orto_fc ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_theme_topics_bk_orto_fc ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_schedule_bk_orto_fc ENABLE ROW LEVEL SECURITY;

-- ── the reorganization log (shared with merge_flashcard_groups) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_group_moves (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id        bigint NOT NULL,          -- no FK: the history outlives a card
  from_group_id  bigint,
  from_label     text,
  from_deck_id   bigint,
  from_position  smallint,
  to_group_id    bigint,
  to_label       text,
  to_deck_id     bigint,
  to_position    smallint,
  operation      text NOT NULL CHECK (operation IN ('move_group', 'merge_groups')),
  reason         text,
  moved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flashcard_group_moves_item_idx ON flashcard_group_moves (item_id, moved_at DESC);
ALTER TABLE flashcard_group_moves ENABLE ROW LEVEL SECURITY;   -- service role only
REVOKE ALL ON flashcard_group_moves FROM anon, authenticated;

-- ── the area label ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE flashcard_groups ADD COLUMN IF NOT EXISTS area text;
COMMENT ON COLUMN flashcard_groups.area IS
  'Optional area shown above the group name in Flashcards and AudioCards (e.g. Ortopedia inside Outros). Never part of the name.';

-- ── the moves ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  outros  bigint := (SELECT id FROM pages WHERE slug = 'outros-flashcards');
  oft_pos smallint;
  g_time  bigint;  -- Trauma e Infecções Musculoesqueléticas
  g_ai    bigint;  -- Artrite Infecciosa
BEGIN
  SELECT g.id INTO g_time FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
   WHERE g.label = 'Trauma e Infecções Musculoesqueléticas' AND p.slug IN ('cirurgia-geral-flashcards', 'outros-flashcards');
  SELECT g.id INTO g_ai FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
   WHERE g.label = 'Artrite Infecciosa' AND p.slug IN ('reumatologia-flashcards', 'outros-flashcards');
  SELECT position INTO oft_pos FROM flashcard_groups WHERE page_id = outros AND label = 'Oftalmologia';
  IF outros IS NULL OR g_time IS NULL OR g_ai IS NULL OR oft_pos IS NULL THEN
    RAISE EXCEPTION 'Ortopedia: unexpected state - nothing changed';
  END IF;

  IF (SELECT page_id FROM flashcard_groups WHERE id = g_time) <> outros THEN
    INSERT INTO flashcard_group_moves (item_id, from_group_id, from_label, from_deck_id, from_position,
                                       to_group_id, to_label, to_deck_id, to_position, operation, reason)
    SELECT f.id, g.id, g.label, g.page_id, f.position, g.id, g.label, outros, f.position, 'move_group',
           'Ortopedia em Outros (Karina 13–14/11/2026)'
      FROM flashcard_items f JOIN flashcard_groups g ON g.id = f.group_id WHERE g.id = g_time;
    PERFORM move_flashcard_group(g_time, outros, (oft_pos + 1)::smallint);
  END IF;
  IF (SELECT page_id FROM flashcard_groups WHERE id = g_ai) <> outros THEN
    INSERT INTO flashcard_group_moves (item_id, from_group_id, from_label, from_deck_id, from_position,
                                       to_group_id, to_label, to_deck_id, to_position, operation, reason)
    SELECT f.id, g.id, g.label, g.page_id, f.position, g.id, g.label, outros, f.position, 'move_group',
           'Ortopedia em Outros (Karina 13–14/11/2026)'
      FROM flashcard_items f JOIN flashcard_groups g ON g.id = f.group_id WHERE g.id = g_ai;
    PERFORM move_flashcard_group(g_ai, outros, (oft_pos + 2)::smallint);
  END IF;

  UPDATE flashcard_groups SET area = 'Ortopedia' WHERE id IN (g_time, g_ai) AND area IS DISTINCT FROM 'Ortopedia';

  -- Meu Plano: Osteomielite e Infecções Osteoarticulares opens the 22 cards
  INSERT INTO topic_content (topic_id, resource_type, page_id, flashcard_group_id, note)
  SELECT t.id, 'flashcards', outros, g_time, 'Ortopedia (Karina 13–14/11/2026)'
    FROM topics t WHERE t.slug = 'trauma-osteomielite'
     AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'flashcards');
END $$;

-- ── post-checks ────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE outros bigint := (SELECT id FROM pages WHERE slug = 'outros-flashcards');
BEGIN
  IF (SELECT string_agg(label, ' | ' ORDER BY position) FROM flashcard_groups WHERE page_id = outros)
     <> 'Oftalmologia | Trauma e Infecções Musculoesqueléticas | Artrite Infecciosa | Otorrinolaringologia | Urologia' THEN
    RAISE EXCEPTION 'Ortopedia post-check: unexpected order in Outros';
  END IF;
  -- no card text, answer, id or group changed; only the deck/positions of the two groups
  IF EXISTS (SELECT 1 FROM flashcard_items f FULL JOIN _orto_cards b ON b.id = f.id
              WHERE f.id IS NULL OR b.id IS NULL OR (f.text, f.answer, f.group_id, f.position) IS DISTINCT FROM (b.text, b.answer, b.group_id, b.position)) THEN
    RAISE EXCEPTION 'Ortopedia post-check: a card changed';
  END IF;
  -- AudioCards: same ids, same audio, same transcript
  IF EXISTS (SELECT 1 FROM lessons l JOIN _orto_lessons b ON b.id = l.id
              WHERE (l.body_html, l.audio_url, l.title) IS DISTINCT FROM (b.body_html, b.audio_url, b.title)) THEN
    RAISE EXCEPTION 'Ortopedia post-check: an AudioCard changed';
  END IF;
  IF (SELECT count(*) FROM lessons l JOIN flashcard_groups g ON g.audiocard_lesson_id = l.id
       WHERE g.page_id = outros AND l.page_id <> (SELECT id FROM pages WHERE slug = 'outros-audiocards')) > 0 THEN
    RAISE EXCEPTION 'Ortopedia post-check: an AudioCard did not follow its group';
  END IF;
END $$;

COMMIT;
