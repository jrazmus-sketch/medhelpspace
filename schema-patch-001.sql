-- ============================================================
-- schema-patch-001.sql
-- Three gap fixes before frontend connects to live Supabase:
--
--   (1) profiles table — extends auth.users with role, locale,
--       theme preference, display name; auto-created by trigger.
--
--   (2) SELECT policies on reference tables — cohorts, content_modules,
--       cohort_module_access, user_cohort_memberships, tracks, specialties.
--       Any authenticated user may read these (not sensitive).
--       user_cohort_memberships additionally restricts to own row
--       unless the reader holds an admin role.
--
--   (3) Admin write policies — INSERT / UPDATE / DELETE on:
--       • content tables (pages, lessons, quiz_questions,
--         flashcard_items, presentation_slides, nav_items):
--         super_admin + content_admin
--       • cohort / module / membership tables (cohorts,
--         content_modules, cohort_module_access,
--         user_cohort_memberships):
--         super_admin + billing_admin only
--       • reference tables (specialties, tracks):
--         super_admin + content_admin
--
-- Prerequisites: run against a database that already has schema.sql
-- applied (set_updated_at() function must exist before this patch).
--
-- Run once in the Supabase SQL editor. Do not run a second time —
-- the CREATE statements are not idempotent.
-- ============================================================


-- ── 1. Enums ──────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'member',
  'super_admin',
  'content_admin',
  'support_admin',
  'billing_admin'
);

CREATE TYPE admin_locale AS ENUM ('pt-BR', 'en');

CREATE TYPE theme_preference AS ENUM ('light', 'dark', 'system');


-- ── 2. Profiles table ─────────────────────────────────────────────
--
-- One row per auth.users row. Created automatically by the trigger
-- in §3; never inserted directly.
--
-- role:             controls admin panel access (default 'member' = no access).
-- admin_locale:     language preference for the admin UI only (admin panel is
--                   bilingual; member-facing site is PT-BR only).
-- theme_preference: stored here so it persists across devices. Applied
--                   server-side before React hydration to prevent flash.

CREATE TABLE profiles (
  id               uuid             PRIMARY KEY
                     REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text             NOT NULL,
  display_name     text,
  role             user_role        NOT NULL DEFAULT 'member',
  admin_locale     admin_locale     NOT NULL DEFAULT 'pt-BR',
  theme_preference theme_preference NOT NULL DEFAULT 'system',
  created_at       timestamptz      NOT NULL DEFAULT now(),
  updated_at       timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX profiles_role_idx ON profiles(role)
  WHERE role != 'member';  -- most rows are members; admin lookups benefit from this

-- Reuse the set_updated_at() function already defined in schema.sql.
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 3. Auto-create profile on new auth user ────────────────────────
--
-- Fires AFTER INSERT on auth.users (Supabase's internal table).
-- SET search_path = public prevents search_path injection — required
-- for SECURITY DEFINER functions in Supabase.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, COALESCE(NEW.email, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── 4. Role helper ─────────────────────────────────────────────────
--
-- Returns the caller's role as text, or NULL if no profile exists.
-- SECURITY DEFINER + SET search_path = public lets this function read
-- profiles without going through RLS — breaking the circular dependency
-- that would arise if RLS policies on profiles called this function
-- while profiles itself had RLS enabled.
--
-- Call pattern in policies:  current_user_role() IN ('super_admin', ...)

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid()
$$;


-- ── 5. RLS on profiles ────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Every user reads their own row.
CREATE POLICY profiles_read_own ON profiles FOR SELECT
  USING (id = auth.uid());

-- Any admin role can read all profiles (needed for member management UI).
CREATE POLICY profiles_read_admin ON profiles FOR SELECT
  USING (
    current_user_role() IN
    ('super_admin', 'content_admin', 'support_admin', 'billing_admin')
  );

-- Users can update their own row but cannot escalate their own role.
-- WITH CHECK evaluates against the NEW (post-update) row: if the
-- role column changed, current_user_role() returns the OLD role,
-- so the comparison fails and the update is blocked.
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (
    id   = auth.uid()
    AND role = current_user_role()::user_role
  );

-- super_admin can update any profile, including role changes.
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE
  USING  (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

-- No INSERT policy — the on_auth_user_created trigger handles creation.
-- No DELETE policy — cascades from auth.users deletion.


-- ── 6. Enable RLS on reference tables ─────────────────────────────

ALTER TABLE specialties             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_modules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_module_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cohort_memberships ENABLE ROW LEVEL SECURITY;

-- Note: the existing helper functions user_has_active_membership() and
-- user_has_module_access() are SECURITY DEFINER, so they bypass RLS
-- when querying user_cohort_memberships and cohorts internally. Enabling
-- RLS on those tables does not break the existing content read policies.


-- ── 7. SELECT policies on reference tables ─────────────────────────

-- Any authenticated user can read these (not sensitive data; needed
-- client-side to render specialty lists, cohort labels, unlock dates).
CREATE POLICY specialties_read ON specialties FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY tracks_read ON tracks FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY cohorts_read ON cohorts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY content_modules_read ON content_modules FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY cohort_module_access_read ON cohort_module_access FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- user_cohort_memberships: own rows only, or any admin role.
CREATE POLICY ucm_read ON user_cohort_memberships FOR SELECT
  USING (
    user_id = auth.uid()
    OR current_user_role() IN
    ('super_admin', 'content_admin', 'support_admin', 'billing_admin')
  );


-- ── 8. Admin write policies on content tables ──────────────────────
--
-- FOR ALL stacks on top of the existing member read policies.
-- RLS uses permissive mode by default: multiple policies on the same
-- operation are OR-ed, so admins get both the member read path AND
-- full write access from these policies.
--
-- Admins can also read draft pages (the existing pages_read policy
-- restricts to status='publish'; this FOR ALL policy has no such
-- restriction, so admins see all rows).

CREATE POLICY pages_admin_all ON pages
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

CREATE POLICY lessons_admin_all ON lessons
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

CREATE POLICY quiz_questions_admin_all ON quiz_questions
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

CREATE POLICY flashcard_items_admin_all ON flashcard_items
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

CREATE POLICY presentation_slides_admin_all ON presentation_slides
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

CREATE POLICY nav_items_admin_all ON nav_items
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));


-- ── 9. Admin write policies on cohort / module / membership tables ──
--
-- Restricted to super_admin + billing_admin.
-- content_admin has no write access to pricing/membership data.
-- support_admin can read memberships (via ucm_read above) but cannot
-- assign or revoke them — that goes through billing_admin or super_admin.

CREATE POLICY cohorts_admin_all ON cohorts
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

CREATE POLICY content_modules_admin_all ON content_modules
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

CREATE POLICY cohort_module_access_admin_all ON cohort_module_access
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

CREATE POLICY ucm_admin_all ON user_cohort_memberships
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

-- Admin write on specialties and tracks (super_admin + content_admin,
-- since content structure changes are within content admin scope).
CREATE POLICY specialties_admin_all ON specialties
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

CREATE POLICY tracks_admin_all ON tracks
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));
