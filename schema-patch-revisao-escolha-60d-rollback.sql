-- Rollback of schema-patch-revisao-escolha-60d.sql. Deploy the previous code in the same window
-- (it writes every Simulado 100Q answer into the Revisão again and has no Fórmula re-read).

BEGIN;

-- The automatic Simulado 100Q rows go back to their state before the patch.
UPDATE review_schedule r
   SET suspended = b.suspended
  FROM review_schedule_bk_100q_20261119 b
 WHERE r.id = b.id;

-- Fórmula re-reads chosen by students are removed with the item type.
DELETE FROM review_schedule WHERE item_type = 'formula';
ALTER TABLE review_schedule DROP CONSTRAINT IF EXISTS review_schedule_item_type_check;
ALTER TABLE review_schedule ADD CONSTRAINT review_schedule_item_type_check
  CHECK (item_type IN ('flashcard', 'quiz_question', 'memorecard', 'clinact_case'));

-- Quick tips back to the 2026-11-18 text.
INSERT INTO site_content (key, value)
VALUES (
  'onboarding.plano.body',
  'Configure seus dias de estudo, o tempo disponível por dia e os conteúdos que deseja incluir. O Meu Plano organiza suas atividades por prioridade, inclui revisões e estima o que cabe até a prova. A programação se ajusta conforme seu progresso e as mudanças na sua disponibilidade.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
DELETE FROM site_content WHERE key IN ('onboarding.medhelp-60d.escolha.title', 'onboarding.medhelp-60d.escolha.body');

COMMIT;

-- Keep review_schedule_bk_100q_20261119 until the rollback is confirmed, then: DROP TABLE review_schedule_bk_100q_20261119;

NOTIFY pgrst, 'reload schema';
