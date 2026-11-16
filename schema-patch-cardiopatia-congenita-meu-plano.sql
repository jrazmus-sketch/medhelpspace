-- schema-patch-cardiopatia-congenita-meu-plano.sql
--
-- Karina 2026-11-16 18h40 BRT ("Re: … Confirmação: R5, rótulos e transferências para Pediatria"):
-- link the two Cardiopatia Congênita items moved to Pediatria on 16/11 (P23, P24) to the Meu Plano topic
-- 177 "Cardiopatia Congênita" (Pediatria). Contents and ids untouched — two topic_content rows only:
--   • medvoice: page 3678 (pediatria-medvoice), lesson 437 "Cardiopatias Congênitas" (same shape as every
--     other MedVoice link: question_filter {lesson_id, lesson_title});
--   • resumo:   page 1623 (cardiopatia-congenita-resumos).
-- Guarded: aborts unless topic, lesson and page are exactly as verified on 16/11. Re-run safe (NOT EXISTS).
-- Rollback: schema-patch-cardiopatia-congenita-meu-plano-rollback.sql.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM topics WHERE id = 177 AND name = 'Cardiopatia Congênita' AND specialty_id = 16) THEN
    RAISE EXCEPTION 'topic 177 is not Pediatria / Cardiopatia Congênita - nothing changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lessons l JOIN pages p ON p.id = l.page_id
                  WHERE l.id = 437 AND l.title = 'Cardiopatias Congênitas'
                    AND p.id = 3678 AND p.slug = 'pediatria-medvoice' AND p.status = 'publish') THEN
    RAISE EXCEPTION 'lesson 437 is not on the published Pediatria MedVoice page - nothing changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pages WHERE id = 1623 AND slug = 'cardiopatia-congenita-resumos'
                    AND view = 'resumos' AND status = 'publish' AND specialty_id = 16) THEN
    RAISE EXCEPTION 'page 1623 is not the published Pediatria resumo - nothing changed';
  END IF;
END $$;

INSERT INTO topic_content (topic_id, resource_type, page_id, question_filter, note)
SELECT 177, 'medvoice', 3678, jsonb_build_object('lesson_id', '437', 'lesson_title', 'Cardiopatias Congênitas'),
       'Karina 2026-11-16: vínculo após transferência para Pediatria'
 WHERE NOT EXISTS (SELECT 1 FROM topic_content WHERE topic_id = 177 AND resource_type = 'medvoice');

INSERT INTO topic_content (topic_id, resource_type, page_id, note)
SELECT 177, 'resumo', 1623, 'Karina 2026-11-16: vínculo após transferência para Pediatria'
 WHERE NOT EXISTS (SELECT 1 FROM topic_content WHERE topic_id = 177 AND resource_type = 'resumo');

DO $$
BEGIN
  IF (SELECT count(*) FROM topic_content WHERE topic_id = 177
        AND ((resource_type = 'medvoice' AND page_id = 3678 AND question_filter->>'lesson_id' = '437')
          OR (resource_type = 'resumo' AND page_id = 1623))) <> 2 THEN
    RAISE EXCEPTION 'post-check: topic 177 does not hold exactly the two links - rolled back';
  END IF;
  -- neither item may also be linked to another topic
  IF EXISTS (SELECT 1 FROM topic_content WHERE topic_id <> 177
              AND ((resource_type = 'medvoice' AND question_filter->>'lesson_id' = '437')
                OR (resource_type = 'resumo' AND page_id = 1623))) THEN
    RAISE EXCEPTION 'post-check: lesson 437 or page 1623 is also linked to another topic - rolled back';
  END IF;
END $$;

COMMIT;
