-- schema-patch-merge-flashcard-groups.sql
--
-- merge_flashcard_groups(): unite two Flashcards groups into one (Karina 2026-11-14, Coluna Vertebral e
-- Trauma Raquimedular: "um único grupo em Neurologia … nenhum cartão retirado, transferido individualmente,
-- excluído ou reescrito"). TEST ONLY until she authorizes it; the Coluna union itself is a separate script
-- (scripts/reorg/coluna-merge-TEST-ONLY.sql) that waits for her pedagogical update.
--
-- What it does, in one transaction:
--   1. Every card of the source group goes to the target group, in the order given (p_order = ALL card ids
--      of both groups, each exactly once). Same card ids, so attempts, progress and Revisão follow the card.
--   2. The target's AudioCard transcript is regenerated from its cards (single source, automatic). Its
--      recording stays as it is: the admin panel then shows "texto alterado após a gravação" and Karina
--      decides (no audio is ever suspended automatically).
--   3. The source group's AudioCard is DETACHED (before any card moves), not deleted: lesson, transcript
--      and audio stay published, unchanged, where they are until Karina validates the unified AudioCard
--      (then it is unpublished separately).
--   4. Meu Plano links to the source group now open the target group (topics stay separate); the source's
--      ranking row (free deck) goes — the target keeps its own.
--   5. Each card's move is written to flashcard_group_moves; the empty source group is removed and the
--      groups after it in its deck close the gap.
-- No text is written: the change log (flashcard_item_changes) records text edits only and stays untouched.
--
-- Depends on: schema-patch-ortopedia-flashcard-groups.sql (creates flashcard_group_moves),
-- schema-patch-r4b-stable-group-ids.sql (links by id).
-- Rollback: DROP FUNCTION merge_flashcard_groups(bigint, bigint, bigint[], text, uuid);

BEGIN;

CREATE OR REPLACE FUNCTION merge_flashcard_groups(p_source bigint, p_target bigint, p_order bigint[],
                                                  p_reason text, p_actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s flashcard_groups; t flashcard_groups;
  expected bigint[]; given bigint[];
BEGIN
  IF p_source = p_target THEN RAISE EXCEPTION 'source and target are the same group'; END IF;
  SELECT * INTO s FROM flashcard_groups WHERE id = p_source FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group % not found', p_source; END IF;
  SELECT * INTO t FROM flashcard_groups WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group % not found', p_target; END IF;

  SELECT array_agg(id ORDER BY id) INTO expected FROM flashcard_items WHERE group_id IN (p_source, p_target);
  SELECT array_agg(x ORDER BY x) INTO given FROM unnest(p_order) x;
  IF given IS DISTINCT FROM expected OR cardinality(p_order) <> (SELECT count(DISTINCT x) FROM unnest(p_order) x) THEN
    RAISE EXCEPTION 'p_order must list every card of both groups exactly once (% given, % expected)',
      cardinality(p_order), cardinality(expected);
  END IF;

  INSERT INTO flashcard_group_moves (item_id, from_group_id, from_label, from_deck_id, from_position,
                                     to_group_id, to_label, to_deck_id, to_position, operation, reason, moved_by)
  SELECT f.id, f.group_id, g.label, g.page_id, f.position, t.id, t.label, t.page_id, o.ord::smallint,
         'merge_groups', p_reason, p_actor
    FROM unnest(p_order) WITH ORDINALITY o(id, ord)
    JOIN flashcard_items f ON f.id = o.id JOIN flashcard_groups g ON g.id = f.group_id
   WHERE (f.group_id, f.position) IS DISTINCT FROM (t.id, o.ord::smallint);

  -- Detach the source AudioCard FIRST: moving its cards out regenerates the transcript of every group the
  -- cards touch, and a still-linked AudioCard of an emptied group would get an EMPTY transcript.
  UPDATE flashcard_groups SET audiocard_lesson_id = NULL WHERE id = p_source;

  SET CONSTRAINTS flashcard_groups_page_position_key, flashcard_items_page_id_group_position_position_key DEFERRED;
  -- park both groups on disjoint negative ranges (the (group_id, position) index is not deferrable)
  UPDATE flashcard_items SET position = -position WHERE group_id = p_target;
  UPDATE flashcard_items SET position = -position - 1000 WHERE group_id = p_source;
  UPDATE flashcard_items SET group_id = p_target WHERE group_id = p_source;
  UPDATE flashcard_items f SET position = o.ord::smallint
    FROM unnest(p_order) WITH ORDINALITY o(id, ord) WHERE f.id = o.id;

  -- Meu Plano + ranking map
  UPDATE topic_content SET flashcard_group_id = p_target WHERE flashcard_group_id = p_source;
  DELETE FROM flashcard_theme_topics WHERE group_id = p_source;

  -- Revisão keeps its rows; only the denormalised specialty follows the deck
  UPDATE review_schedule r SET specialty_id = (SELECT specialty_id FROM pages WHERE id = t.page_id)
   WHERE r.item_type = 'flashcard' AND r.item_id = ANY(p_order)
     AND r.specialty_id IS DISTINCT FROM (SELECT specialty_id FROM pages WHERE id = t.page_id);

  -- the source AudioCard stays published, detached above (its transcript is no longer generated)
  DELETE FROM flashcard_groups WHERE id = p_source;
  UPDATE flashcard_groups SET position = position - 1 WHERE page_id = s.page_id AND position > s.position;

  -- the unified transcript (the statement-level triggers already did it; explicit for clarity)
  PERFORM refresh_audiocard_transcripts(ARRAY[p_target]);
END $$;
REVOKE EXECUTE ON FUNCTION merge_flashcard_groups(bigint, bigint, bigint[], text, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
