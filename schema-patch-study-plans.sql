-- Study Plans + per-user Notifications
-- Run with: node scripts/run-sql.js schema-patch-study-plans.sql

-- ── study_plans: one row per user, preferences only (plan is derived live) ────

CREATE TABLE IF NOT EXISTS study_plans (
  user_id              UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Intensity tier (auto-translates to daily minute target + content volume)
  intensity            TEXT         NOT NULL DEFAULT 'padrao'
                         CHECK (intensity IN ('leve', 'padrao', 'intenso')),

  -- Optional user override for which specialty to focus on (otherwise auto-weighted)
  focus_specialty_id   SMALLINT     REFERENCES specialties(id) ON DELETE SET NULL,

  -- Notification preferences (email)
  email_weekly_summary BOOLEAN      NOT NULL DEFAULT true,
  email_daily_plan     BOOLEAN      NOT NULL DEFAULT false,

  -- Pause / vacation mode — plan suspends and no nudges fire while paused
  paused_until         DATE,

  -- Tracks when user first opened/dismissed the welcome state on their personalized plan
  welcomed_at          TIMESTAMPTZ,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_plans_own_all ON study_plans;
DROP POLICY IF EXISTS study_plans_admin_select ON study_plans;

CREATE POLICY study_plans_own_all ON study_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY study_plans_admin_select ON study_plans
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'support_admin')
  );

-- ── user_notifications: per-user notification bell items ─────────────────────

CREATE TABLE IF NOT EXISTS user_notifications (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT         NOT NULL,
    -- 'plan-ready', 'plan-regenerated', 'missed-3-days', 'weak-specialty',
    -- 'weekly-summary', '60d-unlock', 'expiry-warning-7d', 'expiry-notice',
    -- 'milestone-100q', 'milestone-streak-7', 'milestone-streak-30'
  title       TEXT         NOT NULL,
  body        TEXT,
  href        TEXT,        -- deep link e.g. '/app/plano' or '/app/cardiologia/...'
  icon        TEXT,        -- lucide icon name hint: 'calendar', 'trophy', 'lock', etc.
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON user_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_own_select ON user_notifications;
DROP POLICY IF EXISTS user_notifications_own_update ON user_notifications;
DROP POLICY IF EXISTS user_notifications_own_delete ON user_notifications;
DROP POLICY IF EXISTS user_notifications_admin_select ON user_notifications;

CREATE POLICY user_notifications_own_select ON user_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_notifications_own_update ON user_notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_notifications_own_delete ON user_notifications
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY user_notifications_admin_select ON user_notifications
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'support_admin')
  );
