-- schema-patch-espondiloartrites-questoes-rollback.sql
-- Undoes schema-patch-espondiloartrites-questoes.sql from its *_bk_espondilo_20261111
-- backups: the three questions back to Coluna at their old positions, Atenção Básica as it
-- was, the Reumatologia hub cards as they were, Revisão specialties restored, and the
-- Espondiloartrites page removed (only once it is empty again). Backup tables are kept.

DO $$
DECLARE v_esp bigint;
BEGIN
  SELECT id INTO STRICT v_esp FROM pages WHERE slug = 'espondiloartrites' AND view = 'quiz';

  UPDATE quiz_questions SET position = position + 10000
   WHERE page_id IN (SELECT page_id FROM quiz_questions_bk_espondilo_20261111) OR page_id = v_esp;
  UPDATE quiz_questions q SET page_id = b.page_id, position = b.position
    FROM quiz_questions_bk_espondilo_20261111 b WHERE q.id = b.id;

  DELETE FROM nav_items WHERE source_page_id IN (SELECT source_page_id FROM nav_items_bk_espondilo_20261111);
  INSERT INTO nav_items OVERRIDING SYSTEM VALUE SELECT * FROM nav_items_bk_espondilo_20261111;

  UPDATE review_schedule r SET specialty_id = b.specialty_id
    FROM review_schedule_bk_espondilo_20261111 b WHERE r.id = b.id;

  IF EXISTS (SELECT 1 FROM quiz_questions WHERE page_id = v_esp) THEN
    RAISE EXCEPTION 'Espondiloartrites still holds questions not in the backup — not deleting it';
  END IF;
  DELETE FROM nav_items WHERE target_page_id = v_esp;
  DELETE FROM pages WHERE id = v_esp;
END $$;
