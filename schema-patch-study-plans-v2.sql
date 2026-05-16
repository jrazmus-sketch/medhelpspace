-- Study Plan V2 — real customization
-- Replaces paused_until with structured availability + adds multi-specialty, content types, etc.
-- Run with: node scripts/run-sql.js schema-patch-study-plans-v2.sql

-- ── 1. Add new columns to study_plans (keep old columns for back-compat for now) ─

ALTER TABLE study_plans
  ADD COLUMN IF NOT EXISTS available_days          SMALLINT NOT NULL DEFAULT 127,  -- bitmask: bit0=Sun..bit6=Sat. 127 = all 7 days
  ADD COLUMN IF NOT EXISTS recurring_off_days      SMALLINT NOT NULL DEFAULT 0,    -- bitmask for plantão pattern
  ADD COLUMN IF NOT EXISTS weekly_hours            SMALLINT,                       -- if set, drives minutes/day (weekly_hours*60 / days_available)
  ADD COLUMN IF NOT EXISTS temp_intensity          TEXT
                             CHECK (temp_intensity IN ('leve','padrao','intenso')),
  ADD COLUMN IF NOT EXISTS temp_intensity_until    DATE,
  ADD COLUMN IF NOT EXISTS weakness_sensitivity    TEXT NOT NULL DEFAULT 'balanced'
                             CHECK (weakness_sensitivity IN ('strict','balanced','off')),
  ADD COLUMN IF NOT EXISTS include_60d             BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS flashcard_daily_cap     SMALLINT,                       -- null = no cap
  ADD COLUMN IF NOT EXISTS preferred_content_types TEXT[] NOT NULL DEFAULT ARRAY['quiz','lesson','audio','flashcards','memorecards'],
  ADD COLUMN IF NOT EXISTS intensification_start_days SMALLINT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS content_type_weights    JSONB NOT NULL DEFAULT '{"quiz":40,"lesson":25,"audio":15,"flashcards":15,"memorecards":5}'::jsonb;

-- ── 2. study_plan_pauses — date-range blocks (vacation, busy weeks, sick day) ──

CREATE TABLE IF NOT EXISTS study_plan_pauses (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pause_from  DATE         NOT NULL,
  pause_until DATE         NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT pause_dates_valid CHECK (pause_until >= pause_from)
);

CREATE INDEX IF NOT EXISTS study_plan_pauses_user_dates_idx
  ON study_plan_pauses(user_id, pause_until DESC);

ALTER TABLE study_plan_pauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_plan_pauses_own_all ON study_plan_pauses;
DROP POLICY IF EXISTS study_plan_pauses_admin_select ON study_plan_pauses;

CREATE POLICY study_plan_pauses_own_all ON study_plan_pauses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY study_plan_pauses_admin_select ON study_plan_pauses
  FOR SELECT USING (current_user_role() IN ('super_admin','support_admin'));

-- ── 3. study_plan_focus_specialties — multi-focus (replaces single focus_specialty_id) ─

CREATE TABLE IF NOT EXISTS study_plan_focus_specialties (
  user_id      UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  specialty_id SMALLINT NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  priority     SMALLINT NOT NULL DEFAULT 1,  -- 1 = highest priority; multiple can share priority
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, specialty_id)
);

ALTER TABLE study_plan_focus_specialties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_plan_focus_own_all ON study_plan_focus_specialties;
DROP POLICY IF EXISTS study_plan_focus_admin_select ON study_plan_focus_specialties;

CREATE POLICY study_plan_focus_own_all ON study_plan_focus_specialties
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY study_plan_focus_admin_select ON study_plan_focus_specialties
  FOR SELECT USING (current_user_role() IN ('super_admin','support_admin'));

-- ── 4. study_plan_excluded_specialties — never schedule these ─────────────────

CREATE TABLE IF NOT EXISTS study_plan_excluded_specialties (
  user_id      UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  specialty_id SMALLINT NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, specialty_id)
);

ALTER TABLE study_plan_excluded_specialties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_plan_excluded_own_all ON study_plan_excluded_specialties;
DROP POLICY IF EXISTS study_plan_excluded_admin_select ON study_plan_excluded_specialties;

CREATE POLICY study_plan_excluded_own_all ON study_plan_excluded_specialties
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY study_plan_excluded_admin_select ON study_plan_excluded_specialties
  FOR SELECT USING (current_user_role() IN ('super_admin','support_admin'));

-- ── 5. Migrate existing focus_specialty_id rows into focus_specialties table ──

INSERT INTO study_plan_focus_specialties (user_id, specialty_id, priority)
SELECT user_id, focus_specialty_id, 1
FROM study_plans
WHERE focus_specialty_id IS NOT NULL
ON CONFLICT (user_id, specialty_id) DO NOTHING;

-- Note: keeping focus_specialty_id and paused_until columns for backward-compat
-- They will be ignored by V2 derive.ts. Drop in a future cleanup migration.
