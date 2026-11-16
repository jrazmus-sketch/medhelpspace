-- schema-patch-cardiopatia-congenita-meu-plano-rollback.sql — removes exactly the two links the patch created.
BEGIN;
DELETE FROM topic_content
 WHERE topic_id = 177 AND note = 'Karina 2026-11-16: vínculo após transferência para Pediatria'
   AND ((resource_type = 'medvoice' AND page_id = 3678 AND question_filter->>'lesson_id' = '437')
     OR (resource_type = 'resumo' AND page_id = 1623));
COMMIT;
