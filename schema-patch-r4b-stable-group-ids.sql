-- schema-patch-r4b-stable-group-ids.sql
--
-- R4b with STABLE IDS (Karina 2026-11-14: approved for TEST; production waits for her authorization).
--
-- Until now Meu Plano found a topic's Flashcards group by the group's NAME (topic_content.question_filter
-- ->> 'group_label') and the free 50-card deck ranked groups through flashcard_theme_topics, keyed by
-- (specialty, group NAME). A rename silently broke both. The single source (live 2026-11-14) gave every
-- group a stable id (flashcard_groups.id); this patch makes both links point at that id.
--
--   topic_content.flashcard_group_id   the topic's group. page_id and question_filter.group_label are
--                                      now COPIES kept in sync from the group (trigger), so the app as
--                                      published today keeps working before and after this patch, and a
--                                      group that is renamed or moves deck takes its links with it.
--   flashcard_theme_topics.group_id    same for the ranking map; specialty_id/group_label become copies.
--
-- Data (counted on a production copy, 2026-11-15):
--   168 Flashcards links: 151 matched the group name exactly, 11 differ only in capitals/accents,
--     6 name a group that was renamed (explicit map below). All 168 keep their destination.
--   204 ranking rows: 184 match a group; 18 old-name rows duplicate a valid row of the same group with
--     the SAME topic (removed, backed up); 2 are the only row of a renamed group (re-keyed, kept):
--     "Úlceras Genitais IST" → Úlceras Genitais e IST (topic 65), "Psiquiatria na Infância" →
--     Psiquiatria Infantil (topic 96). 8 groups have no ranking row (unchanged).
--
-- Guards: aborts unless every link resolves to exactly one group. Re-run safe.
-- Rollback: schema-patch-r4b-stable-group-ids-rollback.sql (restores both tables exactly from the backups).

BEGIN;

CREATE TABLE IF NOT EXISTS topic_content_bk_r4b AS SELECT * FROM topic_content;
CREATE TEMP TABLE _r4b_before ON COMMIT DROP AS SELECT id, topic_id, resource_type, page_id FROM topic_content;
CREATE TABLE IF NOT EXISTS flashcard_theme_topics_bk_r4b AS SELECT * FROM flashcard_theme_topics;
ALTER TABLE topic_content_bk_r4b ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_theme_topics_bk_r4b ENABLE ROW LEVEL SECURITY;

-- Accent/case-insensitive key (no unaccent extension on prod).
CREATE OR REPLACE FUNCTION flashcard_label_key(t text) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(translate(lower(coalesce(t, '')),
           'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g'))
$$;

-- ── 1. topic_content ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE topic_content
  ADD COLUMN IF NOT EXISTS flashcard_group_id bigint REFERENCES flashcard_groups(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS topic_content_flashcard_group_idx ON topic_content(flashcard_group_id)
  WHERE flashcard_group_id IS NOT NULL;

CREATE TEMP TABLE _r4b_renames (old_label text, group_id bigint) ON COMMIT DROP;
INSERT INTO _r4b_renames VALUES
  ('Úlceras Genitais IST', 24),                       -- Úlceras Genitais e IST
  ('Psiquiatria na Infância', 139),                   -- Psiquiatria Infantil
  ('Trauma: Atendimento Inicial e Vias Aéreas', 61),  -- Trauma – Atendimento Inicial e Vias Aéreas
  ('HPV e Câncer de Colo Uterino', 79),               -- HPV e Câncer do Colo Uterino
  ('Invaginação Intestinal em Lactente', 22),         -- Invaginação Intestinal no Lactente
  ('SUS: histórico, princípios e diretrizes', 130),   -- SUS – Histórico, Princípios e Diretrizes
  ('HIV e AIDS', 186),                                -- HIV/Aids (ranking map only)
  ('Crescimento e Desenvolvimento', 94),              -- Crescimento e Desenvolvimento Infantil (ranking map only)
  ('Maus-tratos, Violência e Prevenção de Acidentes na Infância', 99); -- (ranking map only)

-- exact name in the same deck → same name ignoring case/accents → explicit rename (same deck required)
UPDATE topic_content c SET flashcard_group_id = COALESCE(
    (SELECT g.id FROM flashcard_groups g WHERE g.page_id = c.page_id AND g.label = c.question_filter->>'group_label'),
    (SELECT g.id FROM flashcard_groups g WHERE g.page_id = c.page_id
       AND flashcard_label_key(g.label) = flashcard_label_key(c.question_filter->>'group_label')
       AND (SELECT count(*) FROM flashcard_groups g2 WHERE g2.page_id = c.page_id
              AND flashcard_label_key(g2.label) = flashcard_label_key(c.question_filter->>'group_label')) = 1),
    (SELECT r.group_id FROM _r4b_renames r JOIN flashcard_groups g ON g.id = r.group_id
       WHERE r.old_label = c.question_filter->>'group_label' AND g.page_id = c.page_id))
 WHERE c.resource_type = 'flashcards' AND c.flashcard_group_id IS NULL;

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.id || ':' || coalesce(c.question_filter->>'group_label', '∅'), ', ') INTO bad
    FROM topic_content c WHERE c.resource_type = 'flashcards' AND c.flashcard_group_id IS NULL;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'R4b: Flashcards links without a group: %', bad; END IF;
END $$;

ALTER TABLE topic_content DROP CONSTRAINT IF EXISTS topic_content_flashcards_group_required;
ALTER TABLE topic_content ADD CONSTRAINT topic_content_flashcards_group_required
  CHECK ((resource_type = 'flashcards') = (flashcard_group_id IS NOT NULL));

-- ── 2. flashcard_theme_topics ──────────────────────────────────────────────────────────────────────
ALTER TABLE flashcard_theme_topics
  ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES flashcard_groups(id) ON DELETE CASCADE;

UPDATE flashcard_theme_topics f SET group_id = g.id
  FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
 WHERE f.group_id IS NULL AND p.specialty_id = f.specialty_id AND g.label = f.group_label;

-- old-name rows: a duplicate of a valid row of the same group goes (backed up above); the only row of
-- a renamed group is re-keyed to it. A duplicate pointing at ANOTHER topic aborts (needs Karina).
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(f.group_label, ', ') INTO bad
    FROM flashcard_theme_topics f
    JOIN LATERAL (
      SELECT COALESCE(
        (SELECT r.group_id FROM _r4b_renames r WHERE r.old_label = f.group_label),
        (SELECT g.id FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
          WHERE p.specialty_id = f.specialty_id AND flashcard_label_key(g.label) = flashcard_label_key(f.group_label)
          LIMIT 1)) AS gid) m ON true
   WHERE f.group_id IS NULL
     AND (m.gid IS NULL OR EXISTS (SELECT 1 FROM flashcard_theme_topics v WHERE v.group_id = m.gid AND v.topic_id <> f.topic_id));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'R4b: ranking rows that need a decision: %', bad; END IF;
END $$;

DELETE FROM flashcard_theme_topics f
 WHERE f.group_id IS NULL
   AND EXISTS (SELECT 1 FROM flashcard_theme_topics v WHERE v.group_id IS NOT NULL AND v.topic_id = f.topic_id
                 AND v.group_id = COALESCE(
                   (SELECT r.group_id FROM _r4b_renames r WHERE r.old_label = f.group_label),
                   (SELECT g.id FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
                     WHERE p.specialty_id = f.specialty_id AND flashcard_label_key(g.label) = flashcard_label_key(f.group_label)
                     LIMIT 1)));

-- re-key the remaining (only rows of renamed groups): new name, same topic
UPDATE flashcard_theme_topics f SET group_id = r.group_id, group_label = g.label
  FROM _r4b_renames r JOIN flashcard_groups g ON g.id = r.group_id
 WHERE f.group_id IS NULL AND r.old_label = f.group_label;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM flashcard_theme_topics WHERE group_id IS NULL) THEN
    RAISE EXCEPTION 'R4b: ranking rows still without a group';
  END IF;
END $$;
ALTER TABLE flashcard_theme_topics ALTER COLUMN group_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_theme_topics_group_key ON flashcard_theme_topics(group_id);

-- ── 3. Keep the copies in sync ─────────────────────────────────────────────────────────────────────
-- A link row written with only the name (old scripts) is resolved to the group; with the id, the copies
-- are filled from the group. Either way page/specialty/name always describe the group as it is now.
CREATE OR REPLACE FUNCTION topic_content_sync_flashcard_group() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
DECLARE g flashcard_groups;
BEGIN
  IF NEW.resource_type <> 'flashcards' THEN RETURN NEW; END IF;
  IF NEW.flashcard_group_id IS NULL THEN
    SELECT * INTO g FROM flashcard_groups WHERE page_id = NEW.page_id AND label = NEW.question_filter->>'group_label';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'topic_content: Flashcards group "%" not found in deck %', NEW.question_filter->>'group_label', NEW.page_id;
    END IF;
    NEW.flashcard_group_id := g.id;
  ELSE
    SELECT * INTO g FROM flashcard_groups WHERE id = NEW.flashcard_group_id;
  END IF;
  NEW.page_id := g.page_id;
  NEW.question_filter := jsonb_build_object('group_label', g.label);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS topic_content_sync_flashcard_group ON topic_content;
CREATE TRIGGER topic_content_sync_flashcard_group BEFORE INSERT OR UPDATE ON topic_content
  FOR EACH ROW EXECUTE FUNCTION topic_content_sync_flashcard_group();

CREATE OR REPLACE FUNCTION flashcard_theme_topics_sync_group() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
DECLARE gid bigint; lbl text; sid bigint;
BEGIN
  IF NEW.group_id IS NULL THEN
    SELECT g.id INTO gid FROM flashcard_groups g JOIN pages p ON p.id = g.page_id
     WHERE p.specialty_id = NEW.specialty_id AND g.label = NEW.group_label;
    IF gid IS NULL THEN
      RAISE EXCEPTION 'flashcard_theme_topics: group "%" not found in specialty %', NEW.group_label, NEW.specialty_id;
    END IF;
    NEW.group_id := gid;
  END IF;
  SELECT g.label, p.specialty_id INTO lbl, sid FROM flashcard_groups g JOIN pages p ON p.id = g.page_id WHERE g.id = NEW.group_id;
  NEW.group_label := lbl;
  NEW.specialty_id := sid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS flashcard_theme_topics_sync_group ON flashcard_theme_topics;
CREATE TRIGGER flashcard_theme_topics_sync_group BEFORE INSERT OR UPDATE ON flashcard_theme_topics
  FOR EACH ROW EXECUTE FUNCTION flashcard_theme_topics_sync_group();

-- A group renamed or moved to another deck carries its links (AFTER: reads the new group values).
CREATE OR REPLACE FUNCTION flashcard_groups_propagate_links() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.page_id, NEW.label) IS DISTINCT FROM (OLD.page_id, OLD.label) THEN
    UPDATE topic_content SET flashcard_group_id = NEW.id WHERE flashcard_group_id = NEW.id;
    UPDATE flashcard_theme_topics SET group_id = NEW.id WHERE group_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS flashcard_groups_propagate_links ON flashcard_groups;
CREATE TRIGGER flashcard_groups_propagate_links AFTER UPDATE OF page_id, label ON flashcard_groups
  FOR EACH ROW EXECUTE FUNCTION flashcard_groups_propagate_links();

REVOKE EXECUTE ON FUNCTION topic_content_sync_flashcard_group(), flashcard_theme_topics_sync_group(),
  flashcard_groups_propagate_links() FROM PUBLIC, anon, authenticated;

-- The 17 links that still carried an old spelling of the name now carry the group's current name.
UPDATE topic_content SET flashcard_group_id = flashcard_group_id
 WHERE resource_type = 'flashcards' AND question_filter->>'group_label' IS DISTINCT FROM
       (SELECT g.label FROM flashcard_groups g WHERE g.id = topic_content.flashcard_group_id);

-- ── 4. Post-checks ─────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- compared with the state at the start of this run: no link added, removed or sent elsewhere
  IF (SELECT count(*) FROM topic_content) <> (SELECT count(*) FROM _r4b_before)
     OR EXISTS (SELECT 1 FROM topic_content c FULL JOIN _r4b_before b ON b.id = c.id
                 WHERE c.id IS NULL OR b.id IS NULL
                    OR (c.topic_id, c.resource_type, c.page_id) IS DISTINCT FROM (b.topic_id, b.resource_type, b.page_id)) THEN
    RAISE EXCEPTION 'R4b post-check: a link was added, removed or changed topic, type or deck';
  END IF;
  -- every Flashcards link's deck is its group's deck
  IF EXISTS (SELECT 1 FROM topic_content c JOIN flashcard_groups g ON g.id = c.flashcard_group_id WHERE c.page_id <> g.page_id) THEN
    RAISE EXCEPTION 'R4b post-check: a Flashcards link is not on its group''s deck';
  END IF;
END $$;

COMMIT;
