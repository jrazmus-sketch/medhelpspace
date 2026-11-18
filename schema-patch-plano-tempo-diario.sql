-- schema-patch-plano-tempo-diario.sql
--
-- Meu Plano: "Tempo de estudo por dia" (Karina 2026-11-18).
--   1. study_plans.daily_minutes — the minutes the student can study on EACH selected day. It replaces the weekly
--      hours and the Leve/Padrão/Intenso "Intensidade base"; the weekly total is derived (daily × study days) and
--      never stored. NULL = never set → the code default (60 min).
--   2. study_plans.temp_daily_minutes + temp_daily_until — "Reduzir o tempo de estudo por um período": a shorter
--      study day up to a date (inclusive). Replaces temp_intensity / temp_intensity_until.
--   3. CONVERSION of what is already saved, keeping the load each student had (her rule: 6 h a week on 3 days is
--      2 h a day, never 6 h a day): weekly_hours × 60 ÷ study days (available minus recurring days off) — exactly
--      what the plan used until now — else the old level's minutes (leve 30, padrão 60, intenso 120).
--   4. The quick tip "Seu plano de estudos" (site_content `onboarding.plano.body`) gets her new text.
-- The old columns (weekly_hours, intensity, temp_intensity, temp_intensity_until) are NOT dropped: nothing reads
-- them for the plan any more, and they are what the rollback returns to. Nothing here touches progress, history,
-- review or content. Re-run safe. Rollback: schema-patch-plano-tempo-diario-rollback.sql.

BEGIN;

-- ── 1 + 2. The columns ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE study_plans
  ADD COLUMN IF NOT EXISTS daily_minutes      smallint,
  ADD COLUMN IF NOT EXISTS temp_daily_minutes smallint,
  ADD COLUMN IF NOT EXISTS temp_daily_until   date;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_plans_daily_minutes_check') THEN
    ALTER TABLE study_plans ADD CONSTRAINT study_plans_daily_minutes_check
      CHECK (daily_minutes IS NULL OR daily_minutes BETWEEN 10 AND 960);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_plans_temp_daily_minutes_check') THEN
    ALTER TABLE study_plans ADD CONSTRAINT study_plans_temp_daily_minutes_check
      CHECK (temp_daily_minutes IS NULL OR temp_daily_minutes BETWEEN 10 AND 960);
  END IF;
END $$;

COMMENT ON COLUMN study_plans.daily_minutes IS
  'Minutes the student can study on each study day (Karina 2026-11-18). NULL = never set (code default: 60). '
  'The weekly total is derived: daily_minutes × study days.';
COMMENT ON COLUMN study_plans.temp_daily_minutes IS
  'A shorter study day for a period ("Reduzir o tempo de estudo por um período"); in force up to temp_daily_until.';
COMMENT ON COLUMN study_plans.temp_daily_until IS
  'Last day (inclusive, Brazilian calendar) of the temporary reduction in temp_daily_minutes.';

-- ── 3. Conversion: every saved plan keeps the minutes per study day it already had ─────────────────────────
WITH d AS (
  SELECT user_id,
         length(replace(((available_days::int & ~recurring_off_days::int) & 127)::bit(7)::text, '0', '')) AS study_days
    FROM study_plans
)
UPDATE study_plans sp
   SET daily_minutes = CASE
         WHEN sp.weekly_hours IS NOT NULL AND d.study_days > 0
           THEN LEAST(960, GREATEST(10, round(sp.weekly_hours * 60.0 / d.study_days)))::smallint
         ELSE CASE sp.intensity WHEN 'leve' THEN 30 WHEN 'intenso' THEN 120 ELSE 60 END
       END
  FROM d
 WHERE d.user_id = sp.user_id
   AND sp.daily_minutes IS NULL;

-- A temporary level still in force (it only ever applied to plans without weekly hours).
UPDATE study_plans
   SET temp_daily_minutes = CASE temp_intensity WHEN 'leve' THEN 30 WHEN 'intenso' THEN 120 ELSE 60 END,
       temp_daily_until   = temp_intensity_until
 WHERE temp_intensity IS NOT NULL
   AND temp_intensity_until >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
   AND weekly_hours IS NULL
   AND temp_daily_minutes IS NULL;

DO $$
DECLARE missing int; total int;
BEGIN
  SELECT count(*) FILTER (WHERE daily_minutes IS NULL), count(*) INTO missing, total FROM study_plans;
  IF missing > 0 THEN
    RAISE EXCEPTION 'plano-tempo-diario: % of % saved plans were left without daily_minutes', missing, total;
  END IF;
  RAISE NOTICE 'plano-tempo-diario: % saved plans converted to a daily time', total;
END $$;

-- ── 4. The quick tip (the DB row wins over the code fallback in lib/onboarding/tips.ts) ────────────────────
INSERT INTO site_content (key, value)
VALUES (
  'onboarding.plano.body',
  'Configure seus dias de estudo, o tempo disponível por dia e os conteúdos que deseja incluir. O Meu Plano organiza suas atividades por prioridade, inclui revisões e estima o que cabe até a prova. A programação se ajusta conforme seu progresso e as mudanças na sua disponibilidade.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;

NOTIFY pgrst, 'reload schema';
