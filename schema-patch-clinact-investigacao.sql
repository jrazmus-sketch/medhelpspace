-- ClinAct — the investigation block for Clínica em Cena (Karina approved 2026-09-03).
--
-- An optional step where the student picks WHICH exams/actions to order, and
-- receives only the results of what they chose. Her words: "a informação
-- clínica pode ser consequência da investigação do aluno, e não conteúdo
-- entregue automaticamente."
--
-- This is the ENTIRE database change. One value added to one CHECK constraint.
-- Everything else the feature needs already exists:
--
--   · per-option quality        → clinact_options.quality (ideal/aceitavel/…)
--   · the result of each option → clinact_options.effect (revela[] carries the
--                                  text AND its image/audio, plus estado/relogio)
--   · the student's selection   → clinact_step_events.payload, exactly as the
--                                  `ordenar` kind already stores its order
--
-- ONE EVENT PER STEP, enforced by the existing UNIQUE (attempt_id, step_id) on
-- clinact_step_events: the whole investigation is a single decision carrying the
-- list of what was ordered. Karina's reason and mine agree — one row per exam
-- would inflate the decision count, the confidence distribution and every metric
-- built on them.
--
-- BACKWARD COMPATIBILITY, her hard condition. This patch:
--   · adds a permitted value and nothing else;
--   · touches no row, no attempt, no score, no review, no published case;
--   · leaves every existing Clínica em Cena behaving exactly as it does today,
--     because a case only gains the behaviour by containing a step of this kind.
-- There is no migration and no backfill, by design.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-investigacao.sql              # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-investigacao.sql            # local
--
-- Rollback (only safe while no case uses the kind):
--   ALTER TABLE clinact_steps DROP CONSTRAINT clinact_steps_kind_check;
--   ALTER TABLE clinact_steps ADD CONSTRAINT clinact_steps_kind_check CHECK (kind IN (
--     'narrativa','pistas','pergunta','ordenar','cena_conduta','novo_dado','reavaliacao',
--     'confianca','feedback','seducao','custo_do_atraso','midia','cronometro',
--     'leve_deste_caso','prontuario','codigo_decifrado'));

BEGIN;

ALTER TABLE clinact_steps DROP CONSTRAINT IF EXISTS clinact_steps_kind_check;

ALTER TABLE clinact_steps ADD CONSTRAINT clinact_steps_kind_check CHECK (kind IN (
  'narrativa', 'pistas', 'pergunta', 'ordenar', 'cena_conduta', 'novo_dado',
  'reavaliacao', 'confianca', 'feedback', 'seducao', 'custo_do_atraso', 'midia',
  'cronometro', 'leve_deste_caso', 'prontuario', 'codigo_decifrado',
  'investigacao'));

COMMIT;
