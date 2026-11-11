-- schema-patch-ortopedia-questoes-rollback.sql
-- Undoes schema-patch-ortopedia-questoes.sql from its *_bk_orto_20261111 backups:
-- questions back to their pages and positions, Outros/Cirurgia Geral hub cards as they
-- were, Trauma e Infecções Musculoesqueléticas republished with its study-plan link,
-- Revisão specialties restored, the Ortopedia page removed (only once it is empty again).
-- The backup tables are kept; drop them by hand once the change is confirmed.

DO $$
DECLARE v_orto bigint;
BEGIN
  SELECT id INTO STRICT v_orto FROM pages WHERE slug = 'ortopedia' AND view = 'quiz';

  -- Questions: park, then restore page + position from the backup.
  UPDATE quiz_questions SET position = position + 10000
   WHERE page_id IN (SELECT page_id FROM quiz_questions_bk_orto_20261111) OR page_id = v_orto;
  UPDATE quiz_questions q SET page_id = b.page_id, position = b.position
    FROM quiz_questions_bk_orto_20261111 b WHERE q.id = b.id;

  -- Hub cards: exactly the backed-up rows.
  DELETE FROM nav_items WHERE source_page_id IN (SELECT source_page_id FROM nav_items_bk_orto_20261111);
  INSERT INTO nav_items OVERRIDING SYSTEM VALUE SELECT * FROM nav_items_bk_orto_20261111;

  -- Pages: status and notes as before.
  UPDATE pages p SET status = b.status, notes = b.notes FROM pages_bk_orto_20261111 b WHERE p.id = b.id;

  -- Study plan + Revisão.
  UPDATE topic_content tc SET page_id = b.page_id FROM topic_content_bk_orto_20261111 b WHERE tc.id = b.id;
  UPDATE review_schedule r SET specialty_id = b.specialty_id FROM review_schedule_bk_orto_20261111 b WHERE r.id = b.id;

  IF EXISTS (SELECT 1 FROM quiz_questions WHERE page_id = v_orto) THEN
    RAISE EXCEPTION 'Ortopedia still holds questions not in the backup — not deleting it';
  END IF;
  DELETE FROM nav_items WHERE target_page_id = v_orto;
  DELETE FROM pages WHERE id = v_orto;
END $$;
