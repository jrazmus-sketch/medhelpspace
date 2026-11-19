-- Revisão by the student's choice for the MedHelp 60D materials (Karina 2026-11-19, 13h27 EST).
--
--   1. review_schedule.item_type gains 'formula': a Fórmula MedHelp page the student chose to re-read
--      ("Quero revisar" at the end of the page). item_id = the page id. Re-reads follow the MemoreCards
--      ladder (3 → 7 → 14 → 30 days, never after the exam) — lib/review/memorecard-reread.ts.
--   2. Simulados 100Q answers no longer enter the Revisão by themselves (the app stopped writing them in
--      /api/quiz-attempt). Only a WRONG question the student ticks "Quero revisar" on enters. The rows an
--      earlier answer created automatically are NOT a choice of the student, so they leave the queue:
--      suspended = true (the row, its SM-2 state and every quiz_attempts row are kept — history intact).
--      The ids are copied first into review_schedule_bk_100q_20261119, which the rollback restores from.
--   3. The quick tips: "Seu plano de estudos" says the forecast covers the regular course up to the 60D
--      opening; the MedHelp 60D tip gains her "Escolha o que deseja revisar" text.
--
-- Re-run safe. Rollback: schema-patch-revisao-escolha-60d-rollback.sql.

BEGIN;

-- ── 1. The item type ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE review_schedule DROP CONSTRAINT IF EXISTS review_schedule_item_type_check;
ALTER TABLE review_schedule ADD CONSTRAINT review_schedule_item_type_check
  CHECK (item_type IN ('flashcard', 'quiz_question', 'memorecard', 'clinact_case', 'formula'));

-- ── 2. The automatic Simulado 100Q rows leave the queue ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_schedule_bk_100q_20261119 (
  id         BIGINT PRIMARY KEY,
  suspended  BOOLEAN NOT NULL,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE review_schedule_bk_100q_20261119 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON review_schedule_bk_100q_20261119 FROM anon, authenticated;

INSERT INTO review_schedule_bk_100q_20261119 (id, suspended)
SELECT r.id, r.suspended
  FROM review_schedule r
  JOIN quiz_questions q ON q.id = r.item_id
  JOIN pages p          ON p.id = q.page_id
 WHERE r.item_type = 'quiz_question'
   AND p.content_module_id = 1
   AND p.view = 'simulados'
ON CONFLICT (id) DO NOTHING;

UPDATE review_schedule r
   SET suspended = true
  FROM review_schedule_bk_100q_20261119 b
 WHERE r.id = b.id
   AND r.suspended = false;

-- ── 3. Quick tips (her text) ──────────────────────────────────────────────────────────────────────────────
INSERT INTO site_content (key, value)
VALUES (
  'onboarding.plano.body',
  'Configure seus dias de estudo, o tempo disponível por dia e os conteúdos que deseja incluir. O Meu Plano organiza suas atividades por prioridade, inclui revisões e estima o que cabe do curso regular até a abertura do MedHelp 60D. A programação se ajusta conforme seu progresso e as mudanças na sua disponibilidade.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO site_content (key, value)
VALUES (
  'onboarding.medhelp-60d.escolha.title',
  'Escolha o que deseja revisar'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO site_content (key, value)
VALUES (
  'onboarding.medhelp-60d.escolha.body',
  E'Ao terminar uma página do Fórmula MedHelp, marque “Quero revisar” se desejar retomá-la pela revisão espaçada. Nos Simulados 100Q, você pode selecionar individualmente as questões que errou.\n\nOs conteúdos selecionados ficam disponíveis pelo menu Revisão. Você pode desmarcar sua escolha a qualquer momento, sem perder seu histórico ou progresso no cronograma.\n\nOs MemoreCards continuam sendo incluídos automaticamente após a conclusão de cada tema. Durante o MedHelp 60D, essas revisões são opcionais e não são acrescentadas à programação diária do Meu Plano.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;

NOTIFY pgrst, 'reload schema';
