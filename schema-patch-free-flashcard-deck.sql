-- schema-patch-free-flashcard-deck.sql
--
-- Karina 2026-11-16 ("Incidência automática no Meu Plano — autorizada"). The 50 free Flashcards
-- (/flashcards-revalida/acesso, getWeightedRevalidaDeck) were picked at request time by ranking each
-- subject's themes by topics.incidence_count. Her authorization covers the incidence of MEU PLANO; the
-- switch to the count by original question would silently swap themes in the free deck (Cirurgia Pediátrica,
-- Saúde do Trabalhador, Diabetes Gestacional, Leptospirose in; Malformações, Vigilância, Sífilis na
-- Gestação, Parasitoses out). Her standing check is that the free 50 stay exactly the same.
--
-- So the deck is FROZEN: one row per card, in the order members see it. The app reads this table first and
-- only computes the old way when it is empty or missing (or tops up if a frozen card was ever deleted).
-- Re-ranking the free deck is a separate decision for Karina: TRUNCATE + re-run the seed script.
--
-- Order of application (each DB):
--   1. this patch                                   (creates the empty table)
--   2. node scripts/freeze-free-flashcard-deck.js --apply   (seeds the 50 ids from TODAY's ranking)
--   3. schema-patch-topic-incidence-automatic.sql   (refuses to run unless step 2 left 50 rows)
--
-- Rollback: DROP TABLE IF EXISTS free_flashcard_deck;  (the app falls back to computing the deck)

BEGIN;

CREATE TABLE IF NOT EXISTS free_flashcard_deck (
  position          smallint PRIMARY KEY CHECK (position BETWEEN 1 AND 50),
  flashcard_item_id bigint   NOT NULL UNIQUE REFERENCES flashcard_items(id) ON DELETE CASCADE,
  frozen_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE free_flashcard_deck IS
  'The 50 free Flashcards of the lead magnet, frozen 2026-11-16 so the Meu Plano incidence switch does not '
  'change them. Read by getWeightedRevalidaDeck (service role). Re-rank only on Karina''s decision.';

-- Server-only: the magnet reads it through the service-role client.
ALTER TABLE free_flashcard_deck ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON free_flashcard_deck FROM anon, authenticated;

COMMIT;
