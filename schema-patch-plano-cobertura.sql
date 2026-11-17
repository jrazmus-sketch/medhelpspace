-- schema-patch-plano-cobertura.sql
--
-- Meu Plano → time-budgeted schedule with a forecast to the exam (Karina 2026-11-17, agreed by phone with Justin).
--   1. study_plan_settings  — ONE row holding every time estimate / share the plan uses; edited by Karina at
--                             /admin/plano (no code change, no deploy).
--   2. study_plans.pace_mode — the student's "Ritmo de estudo": auto (default) | slow | standard | fast.
--   3. lessons.audio_duration_seconds — the real MedVoice audio length (filled by
--                             scripts/measure-audio-durations.js → parsed/audio-durations.sql).
--   4. Three small catalog views the plan reads (sizes of each material) + two functions (a student's Flashcards
--      facts; the typical pace across all students, for the admin screen).
-- Nothing here touches content, attempts, review or incidence. Re-run safe. Rollback: ...-rollback.sql.

BEGIN;

-- ── 1. Settings (singleton) ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_plan_settings (
  id                              boolean PRIMARY KEY DEFAULT true CHECK (id),
  minutes_per_question            numeric(5,2) NOT NULL DEFAULT 2.5  CHECK (minutes_per_question  BETWEEN 0.25 AND 15),
  seconds_per_flashcard           integer      NOT NULL DEFAULT 30   CHECK (seconds_per_flashcard BETWEEN 5 AND 300),
  minutes_per_revalida_up_insight numeric(5,2) NOT NULL DEFAULT 1.5  CHECK (minutes_per_revalida_up_insight BETWEEN 0.25 AND 15),
  medvoice_fallback_minutes       integer      NOT NULL DEFAULT 12   CHECK (medvoice_fallback_minutes BETWEEN 1 AND 120),
  review_seconds_per_item         integer      NOT NULL DEFAULT 30   CHECK (review_seconds_per_item BETWEEN 5 AND 300),
  review_max_share                numeric(4,2) NOT NULL DEFAULT 0.50 CHECK (review_max_share BETWEEN 0 AND 1),
  review_reserve_share            numeric(4,2) NOT NULL DEFAULT 0.20 CHECK (review_reserve_share BETWEEN 0 AND 0.9),
  -- A regular MINI SIMULADO (25 questions, Questões › Simulados). The MedHelp 60D materials (Fórmula MedHelp,
  -- MemoreCards, Simulados 100Q) are NOT scheduled by Meu Plano: they get their own schedule on the 60D page.
  simulado_questions              integer      NOT NULL DEFAULT 25   CHECK (simulado_questions BETWEEN 5 AND 120),
  simulado_days_per_week          integer      NOT NULL DEFAULT 1    CHECK (simulado_days_per_week BETWEEN 0 AND 7),
  simulado_max_weekly_share       numeric(4,2) NOT NULL DEFAULT 0.25 CHECK (simulado_max_weekly_share BETWEEN 0.05 AND 1),
  pace_slow_factor                numeric(4,2) NOT NULL DEFAULT 1.50 CHECK (pace_slow_factor BETWEEN 1 AND 3),
  pace_fast_factor                numeric(4,2) NOT NULL DEFAULT 0.70 CHECK (pace_fast_factor BETWEEN 0.3 AND 1),
  adaptive_pace_enabled           boolean      NOT NULL DEFAULT true,
  pace_min_samples                integer      NOT NULL DEFAULT 30   CHECK (pace_min_samples BETWEEN 5 AND 500),
  updated_at                      timestamptz  NOT NULL DEFAULT now(),
  updated_by                      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
COMMENT ON TABLE study_plan_settings IS
  'Meu Plano time estimates and shares (Karina 2026-11-17). One row. Read by lib/study-plan/settings-server.ts, '
  'edited at /admin/plano. A missing row means the code defaults (identical values).';
INSERT INTO study_plan_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE study_plan_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON study_plan_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON study_plan_settings TO service_role;

-- ── 2. The student's pace choice ───────────────────────────────────────────────────────────────────────────
ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS pace_mode text NOT NULL DEFAULT 'auto';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_plans_pace_mode_check') THEN
    ALTER TABLE study_plans ADD CONSTRAINT study_plans_pace_mode_check
      CHECK (pace_mode IN ('auto', 'slow', 'standard', 'fast'));
  END IF;
END $$;

-- ── 3. Real audio length ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS audio_duration_seconds integer
  CHECK (audio_duration_seconds IS NULL OR audio_duration_seconds > 0);

-- ── 4. Catalog views (sizes) ───────────────────────────────────────────────────────────────────────────────
-- Cards per Flashcards group (the unit a topic links to).
CREATE OR REPLACE VIEW study_plan_flashcard_groups WITH (security_invoker = true) AS
SELECT g.id AS group_id, count(i.id)::int AS cards
  FROM flashcard_groups g
  JOIN pages p ON p.id = g.page_id AND p.status = 'publish'
  LEFT JOIN flashcard_items i ON i.group_id = g.id
 GROUP BY g.id;

-- A Revalida Up page = one lesson; its insights are the <h3> blocks of the body.
CREATE OR REPLACE VIEW study_plan_revalida_up_pages WITH (security_invoker = true) AS
SELECT DISTINCT ON (l.page_id)
       l.page_id, l.id AS lesson_id,
       GREATEST(1, (SELECT count(*) FROM regexp_matches(COALESCE(l.body_html, ''), '<h3[ >]', 'gi')))::int AS insights
  FROM lessons l
  JOIN pages p ON p.id = l.page_id AND p.view = 'revalida-up' AND p.status = 'publish'
 ORDER BY l.page_id, l.position, l.id;

-- MedVoice lessons with their measured length (NULL = not measured yet → settings fallback).
CREATE OR REPLACE VIEW study_plan_medvoice_lessons WITH (security_invoker = true) AS
SELECT l.id AS lesson_id, l.page_id, l.audio_duration_seconds AS duration_seconds, (l.audio_url IS NOT NULL) AS has_audio
  FROM lessons l
  JOIN pages p ON p.id = l.page_id AND p.track_id = 1 AND p.status = 'publish';

REVOKE ALL ON study_plan_flashcard_groups, study_plan_revalida_up_pages, study_plan_medvoice_lessons
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON study_plan_flashcard_groups, study_plan_revalida_up_pages, study_plan_medvoice_lessons TO service_role;

-- ── 5. A student's Flashcards facts, in one call ───────────────────────────────────────────────────────────
-- seen:       group_id → distinct cards of the group the student has answered at least once
-- pace:       median seconds between two consecutive answers of one session (2 s … 5 min), over the last 300
-- today:      answers since p_today_start (the student's Brazilian day)
CREATE OR REPLACE FUNCTION study_plan_flashcard_facts(p_user uuid, p_today_start timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH seen AS (
    SELECT i.group_id, count(DISTINCT a.flashcard_item_id)::int AS n
      FROM flashcard_attempts a JOIN flashcard_items i ON i.id = a.flashcard_item_id
     WHERE a.user_id = p_user AND i.group_id IS NOT NULL
     GROUP BY i.group_id
  ), gaps AS (
    SELECT extract(epoch FROM a.attempted_at - lag(a.attempted_at) OVER (PARTITION BY a.session_id ORDER BY a.attempted_at)) AS s,
           a.attempted_at
      FROM flashcard_attempts a WHERE a.user_id = p_user
  ), recent AS (
    SELECT s FROM gaps WHERE s BETWEEN 2 AND 300 ORDER BY attempted_at DESC LIMIT 300
  )
  SELECT jsonb_build_object(
    'seen',  COALESCE((SELECT jsonb_object_agg(group_id::text, n) FROM seen), '{}'::jsonb),
    'pace_seconds', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s) FROM recent),
    'pace_samples', (SELECT count(*) FROM recent),
    'today', (SELECT count(*) FROM flashcard_attempts WHERE user_id = p_user AND attempted_at >= p_today_start)
  );
$$;
REVOKE ALL ON FUNCTION study_plan_flashcard_facts(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION study_plan_flashcard_facts(uuid, timestamptz) TO service_role;

-- ── 6. Typical pace across ALL students (admin screen: shown next to each default) ─────────────────────────
CREATE OR REPLACE FUNCTION study_plan_pace_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH q AS (
    SELECT user_id, extract(epoch FROM created_at - lag(created_at) OVER (PARTITION BY user_id ORDER BY created_at, id)) AS s
      FROM quiz_attempts
  ), f AS (
    SELECT user_id, extract(epoch FROM attempted_at - lag(attempted_at) OVER (PARTITION BY session_id ORDER BY attempted_at)) AS s
      FROM flashcard_attempts
  )
  SELECT jsonb_build_object(
    'question_seconds',  (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s) FROM q WHERE s BETWEEN 10 AND 900),
    'question_samples',  (SELECT count(*) FROM q WHERE s BETWEEN 10 AND 900),
    'question_students', (SELECT count(DISTINCT user_id) FROM q WHERE s BETWEEN 10 AND 900),
    'flashcard_seconds', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s) FROM f WHERE s BETWEEN 2 AND 300),
    'flashcard_samples', (SELECT count(*) FROM f WHERE s BETWEEN 2 AND 300),
    'flashcard_students',(SELECT count(DISTINCT user_id) FROM f WHERE s BETWEEN 2 AND 300)
  );
$$;
REVOKE ALL ON FUNCTION study_plan_pace_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION study_plan_pace_stats() TO service_role;

COMMIT;
