-- schema-patch-flashcard-theme-topics.sql
--
-- Ties each flashcard THEME (a deck's `group_label`, per specialty) to its exam
-- `topics` row, so the high-yield magnet deck (getWeightedRevalidaDeck) ranks
-- themes by real incidence via a FOREIGN KEY instead of fuzzy-matching group_label
-- text against topics.name at query time.
--
-- Why: the old runtime string match silently dropped ~1 in 4 high-incidence themes
-- because the deck labels and the incidence table were authored separately with
-- slightly different wording — plurals ("Hérnia" vs "Hérnias"), abbreviations
-- ("Traumatismo Cranioencefálico" vs "TCE"), connective words ("Câncer Colorretal"
-- vs "Câncer de Colorretal"), rewordings ("Diabetes Gestacional" vs "Diabetes da
-- Gestação"). Unmatched themes scored incidence -1 and fell to the bottom, so the
-- wrong (lower-yield) cards surfaced. This mapping resolves the link ONCE, offline
-- and reviewable (scripts/backfill-flashcard-theme-topics.js), and the runtime does
-- an exact FK lookup — no string matching ever again.
--
-- Keyed by (specialty_id, group_label), NOT by card id, so it SURVIVES the
-- full-replace flashcard regeneration pipeline (re-imports mint new card ids but
-- keep the same theme labels). Re-run the backfill after a regeneration to pick up
-- any new/renamed themes; it upserts and reports anything left unmapped.
--
-- Public-read reference data (like specialties / topics): anyone may SELECT; writes
-- restricted to super_admin / content_admin. Content writes go through the
-- service-role client (RLS-bypassing); the admin policy is defense-in-depth. RLS
-- enabled at creation per the default-grants invariant.
--
-- Idempotent (safe to re-run): IF NOT EXISTS / DROP-IF-EXISTS throughout.
--
-- Rollback:
--   DROP TABLE IF EXISTS flashcard_theme_topics;

BEGIN;

CREATE TABLE IF NOT EXISTS flashcard_theme_topics (
  specialty_id smallint    NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  group_label  text        NOT NULL,                                        -- flashcard theme = flashcard_items.group_label
  topic_id     bigint      NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (specialty_id, group_label)
);

CREATE INDEX IF NOT EXISTS flashcard_theme_topics_topic_id_idx ON flashcard_theme_topics(topic_id);

ALTER TABLE flashcard_theme_topics ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read — theme→topic mapping is public reference data.
DROP POLICY IF EXISTS flashcard_theme_topics_select_all ON flashcard_theme_topics;
CREATE POLICY flashcard_theme_topics_select_all ON flashcard_theme_topics
  FOR SELECT USING (true);

-- Writes restricted to super_admin / content_admin (defense-in-depth; content
-- writers use the service-role client which bypasses RLS).
DROP POLICY IF EXISTS flashcard_theme_topics_write_admin ON flashcard_theme_topics;
CREATE POLICY flashcard_theme_topics_write_admin ON flashcard_theme_topics
  FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

COMMIT;
