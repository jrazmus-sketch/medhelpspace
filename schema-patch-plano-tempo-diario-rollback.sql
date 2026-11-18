-- schema-patch-plano-tempo-diario-rollback.sql
--
-- Undoes schema-patch-plano-tempo-diario.sql. Deploy the previous code FIRST (it reads weekly_hours / intensity,
-- which the patch left untouched), then run this. A daily time the student changed after the patch is lost: the
-- plan goes back to the weekly hours / level saved before it.

BEGIN;

ALTER TABLE study_plans DROP CONSTRAINT IF EXISTS study_plans_daily_minutes_check;
ALTER TABLE study_plans DROP CONSTRAINT IF EXISTS study_plans_temp_daily_minutes_check;
ALTER TABLE study_plans
  DROP COLUMN IF EXISTS daily_minutes,
  DROP COLUMN IF EXISTS temp_daily_minutes,
  DROP COLUMN IF EXISTS temp_daily_until;

-- The quick tip as it was (seed of 2026-07-02, schema-patch-onboarding-copy-refresh.sql).
UPDATE site_content
   SET value = 'Um cronograma diário montado a partir das suas metas e do seu desempenho. Faça a **calibração rápida** — data da prova, especialidades fracas, horas por semana e os tipos de conteúdo que quer treinar — e o plano organiza o que estudar a cada dia, com **links diretos** para o próximo conteúdo. Ative os **lembretes por email** (resumo semanal e plano do dia) para saber quando e o que estudar. Pode pausar ou ajustar quando precisar — ele se reequilibra sozinho.',
       updated_at = now()
 WHERE key = 'onboarding.plano.body';

COMMIT;

NOTIFY pgrst, 'reload schema';
