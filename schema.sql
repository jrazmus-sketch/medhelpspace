-- MedHelpSpace Migration — Supabase Schema
-- Phase 2 revised. Cohort + module-access membership model.
-- Not final; pending team review before parser work begins.
--
-- Conventions: snake_case, all timestamps timestamptz.
-- WP post IDs are preserved as PK on pages so CSV-sourced FKs survive import intact.

-- ──────────────────────────────────────────────────────────────
-- 0. Extensions
-- ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ──────────────────────────────────────────────────────────────
-- 0.5 User profile enums
-- ──────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'member',
  'super_admin',
  'content_admin',
  'support_admin',
  'billing_admin'
);

CREATE TYPE admin_locale AS ENUM ('pt-BR', 'en');

CREATE TYPE theme_preference AS ENUM ('light', 'dark', 'system');


-- ──────────────────────────────────────────────────────────────
-- 1. Cohorts
--    Each cohort represents one exam cycle of students.
--    test_date drives unlock_date computation for date-gated modules (see §4).
--    Dates are placeholders; all are admin-editable after deployment.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE cohorts (
  id                   smallint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                 text        NOT NULL UNIQUE,
  name                 text        NOT NULL,
  test_date            date        NOT NULL,
  membership_starts_at timestamptz NOT NULL,
  membership_ends_at   timestamptz NOT NULL
);

INSERT INTO cohorts (slug, name, test_date, membership_starts_at, membership_ends_at) VALUES
  ('revalida-2026-2', 'Revalida 2026.2', '2026-07-01', '2025-08-01', '2026-08-31'),
  ('revalida-2027-1', 'Revalida 2027.1', '2027-01-15', '2026-02-01', '2027-02-28');


-- ──────────────────────────────────────────────────────────────
-- 2. User cohort memberships
--    A user belongs to one cohort at a time in the typical case,
--    but the schema allows multiple (e.g. a student who renews into
--    the next cohort while the previous is still active).
-- ──────────────────────────────────────────────────────────────

CREATE TABLE user_cohort_memberships (
  user_id   uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cohort_id smallint NOT NULL REFERENCES cohorts(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cohort_id)
);

CREATE INDEX user_cohort_memberships_cohort_idx ON user_cohort_memberships(cohort_id);


-- ──────────────────────────────────────────────────────────────
-- 3. Content modules
--    Named, date-gated sections that unlock relative to a cohort's test_date.
--    unlock_offset_days: how many days before test_date the module opens.
--    The concrete unlock_date is stored on cohort_module_access (§4) and kept
--    in sync with test_date via trigger (§14).
-- ──────────────────────────────────────────────────────────────

CREATE TABLE content_modules (
  id                  smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                text     NOT NULL UNIQUE,
  name                text     NOT NULL,
  description         text,
  unlock_offset_days  smallint NOT NULL DEFAULT 0
  -- 0 = unlocks when membership starts; positive = N days before test_date
);

INSERT INTO content_modules (slug, name, description, unlock_offset_days) VALUES
  ('medhelp-60d', 'MedHelp 60D',
   'Fórmula MedHelp + Memorecards — unlocks 60 days before the cohort test date', 60);


-- ──────────────────────────────────────────────────────────────
-- 4. Cohort module access
--    Which cohort can access which module, and from when.
--    unlock_date = cohorts.test_date - content_modules.unlock_offset_days.
--    Kept as a stored column for fast RLS evaluation; recomputed by trigger
--    whenever cohorts.test_date or content_modules.unlock_offset_days changes.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE cohort_module_access (
  cohort_id         smallint NOT NULL REFERENCES cohorts(id),
  content_module_id smallint NOT NULL REFERENCES content_modules(id),
  unlock_date       date     NOT NULL,  -- trigger-maintained; do not edit manually
  PRIMARY KEY (cohort_id, content_module_id)
);

CREATE INDEX cohort_module_access_module_idx ON cohort_module_access(content_module_id);

-- Seed: every cohort gets every module; unlock_date computed from test_date - offset.
INSERT INTO cohort_module_access (cohort_id, content_module_id, unlock_date)
SELECT
  c.id,
  m.id,
  c.test_date - m.unlock_offset_days
FROM cohorts c CROSS JOIN content_modules m;


-- ──────────────────────────────────────────────────────────────
-- 5. Specialties
--    The 12 core medical specialties of the Revalida curriculum.
--    OB/GYN sub-topics (ciclo-menstrual, hemorragia-puerperal, etc.) and
--    Pediatrics sub-hubs are pages with specialty_id = NULL, migrated as
--    drafts pending content team completion.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE specialties (
  id            smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug          text     NOT NULL UNIQUE,
  name          text     NOT NULL,
  display_order smallint NOT NULL DEFAULT 0,
  active        boolean  NOT NULL DEFAULT true
);

INSERT INTO specialties (slug, name, display_order) VALUES
  ('cardiologia',       'Cardiologia',       1),
  ('dermatologia',      'Dermatologia',       2),
  ('emergencia',        'Emergência',         3),
  ('endocrinologia',    'Endocrinologia',     4),
  ('gastroenterologia', 'Gastroenterologia',  5),
  ('hematologia',       'Hematologia',        6),
  ('infectologia',      'Infectologia',       7),
  ('nefrologia',        'Nefrologia',         8),
  ('neurologia',        'Neurologia',         9),
  ('pneumologia',       'Pneumologia',       10),
  ('psiquiatria',       'Psiquiatria',       11),
  ('reumatologia',      'Reumatologia',      12);


-- ──────────────────────────────────────────────────────────────
-- 6. Tracks
--    Cross-cutting content series: each track has one page per specialty
--    (or close to it). A page can belong to a track AND be gated by a
--    content_module (e.g. memorecards pages are inside medhelp-60d).
--
--    Known tracks from inventory:
--      medvoice   — audio narration + text transcript per specialty (19 pages total)
--      audiocards — text-lesson toggles with embedded audio cards (18 pages)
--      flashcards — H5P flashcard quizzes per specialty (18 pages)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE tracks (
  id            smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug          text     NOT NULL UNIQUE,
  name          text     NOT NULL,
  description   text,
  display_order smallint NOT NULL DEFAULT 0
);

INSERT INTO tracks (slug, name, description, display_order) VALUES
  ('medvoice',   'MedVoice',
   'Audio narration and text script per specialty; one audio-lesson per specialty', 1),
  ('audiocards', 'Audiocards',
   'Text-lesson toggle cards with embedded audio per specialty', 2),
  ('flashcards', 'Flashcards',
   'H5P flashcard quizzes per specialty; content type may differ from standard MCQ', 3);


-- ──────────────────────────────────────────────────────────────
-- 7. User profiles
--    One row per auth.users row, created automatically by the
--    on_auth_user_created trigger below.
--
--    role:             controls admin panel access ('member' = no access).
--    admin_locale:     language for the admin UI; member-facing site is
--                      always PT-BR so this field is admin-only.
--    theme_preference: stored here to persist across devices; applied
--                      server-side before React hydration to prevent flash.
-- ──────────────────────────────────────────────────────────────

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

-- Most rows are members; admin lookups benefit from skipping them.
CREATE INDEX profiles_role_idx ON profiles(role)
  WHERE role != 'member';


-- ──────────────────────────────────────────────────────────────
-- 8. Page types and views
-- ──────────────────────────────────────────────────────────────

CREATE TYPE page_type AS ENUM (
  'plain-content',
  'text-lesson',
  'h5p-quiz',
  'blurb-nav-hub',
  'audio-lesson',
  'navigation-toggle'
);

CREATE TYPE page_view AS ENUM (
  'hub',       -- specialty main hub (blurb-nav-hub under objetivas-comentadas)
  'quiz',      -- per-topic H5P quiz (under specialty hub)
  'formula',   -- plain-content formula page (under *-formula hub)
  'resumos',   -- plain-content resumo page (under *-resumos hub)
  'simulados'  -- text-lesson exam walkthrough (under *-simulados hub)
);


-- ──────────────────────────────────────────────────────────────
-- 8. Pages
--    One row per migrated WP page.
--
--    specialty_id + view: denormalized from slug and parent chain at migration time.
--      NULL specialty_id = section root or cross-cutting page (tracks, modules, drafts).
--    content_module_id: set on 37 pages (medhelp-60d root + all descendants).
--    track_id: set on track hub pages and their children.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE pages (
  id                bigint    PRIMARY KEY,  -- original WP post ID; preserved for FK stability
  slug              text      NOT NULL UNIQUE,
  title             text      NOT NULL,
  type              page_type NOT NULL,
  status            text      NOT NULL DEFAULT 'publish'
                      CHECK (status IN ('publish', 'draft')),
  parent_id         bigint    REFERENCES pages(id),
  specialty_id      smallint  REFERENCES specialties(id),
  view              page_view,
  track_id          smallint  REFERENCES tracks(id),
  content_module_id smallint  REFERENCES content_modules(id),
  notes             text,        -- migration flags: orphaned-h5p-ref, blurb-cards-links-not-set-incomplete, etc.
  wp_created_at     timestamptz,
  wp_modified_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Tree traversal: breadcrumbs, blurb target resolution.
CREATE INDEX pages_parent_id_idx ON pages(parent_id);

-- Primary read pattern: "all quiz pages for Cardiologia".
CREATE INDEX pages_specialty_view_idx
  ON pages(specialty_id, view)
  WHERE specialty_id IS NOT NULL;

CREATE INDEX pages_type_idx ON pages(type);

-- Content team dashboard: draft pages requiring attention.
CREATE INDEX pages_status_draft_idx ON pages(status) WHERE status = 'draft';

-- Module-gated page lookups.
CREATE INDEX pages_content_module_idx
  ON pages(content_module_id)
  WHERE content_module_id IS NOT NULL;

-- Track page lookups.
CREATE INDEX pages_track_idx
  ON pages(track_id)
  WHERE track_id IS NOT NULL;


-- ──────────────────────────────────────────────────────────────
-- 9. Lessons
--    One row per et_pb_toggle from text-lesson and audio-lesson pages.
--    audio_url nullable: null = text only. Adding audio is one UPDATE.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE lessons (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id        bigint      NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position       smallint    NOT NULL,
  title          text        NOT NULL,
  body_html      text        NOT NULL,
  audio_url      text,                    -- Bunny CDN URL; null = text only
  audio_added_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, position)
);

CREATE INDEX lessons_page_id_idx ON lessons(page_id);


-- ──────────────────────────────────────────────────────────────
-- 10. Quiz questions (H5P QuestionSet / MultiChoice)
--     All sampled H5P content (209 items, library_id = 15) is QuestionSet.
--     answers JSONB shape: [{text: html, correct: bool, feedback: text}]
-- ──────────────────────────────────────────────────────────────

CREATE TABLE quiz_questions (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id    bigint      NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position   smallint    NOT NULL,             -- 1-based order within the quiz
  h5p_sub_id uuid,                             -- H5P subContentId; for re-import tracing
  question   text        NOT NULL,             -- HTML (includes exam source ref in <h3>)
  answers    jsonb       NOT NULL,             -- [{text, correct, feedback}]
  media_url  text,                             -- question image/video if present
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, position)
);

CREATE INDEX quiz_questions_page_id_idx ON quiz_questions(page_id);
CREATE INDEX quiz_questions_h5p_sub_idx ON quiz_questions(h5p_sub_id)
  WHERE h5p_sub_id IS NOT NULL;


-- ──────────────────────────────────────────────────────────────
-- 11. Flashcard items (H5P CoursePresentation + Dialogcards)
--     For h5p-quiz pages where library_id=35 (H5P.CoursePresentation) and
--     each slide contains H5P.Dialogcards elements.
--     Affects: all *-flashcards pages (cardiologia-flashcards, etc.).
--
--     CoursePresentation → slides → Dialogcards → dialogs[{text, answer, tips}]
--       text:   prompt/front side (matches H5P JSON key exactly)
--       answer: answer/back side  (matches H5P JSON key exactly)
--       group_position: slide index within the CoursePresentation (1-based)
--       group_label:    slide title from CoursePresentation metadata, if present
--       position:       card index within the slide (1-based)
--     UNIQUE (page_id, group_position, position): one card per slide-slot.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE flashcard_items (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id        bigint      NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  group_position smallint    NOT NULL,             -- slide index within CoursePresentation
  group_label    text,                             -- slide title if present
  position       smallint    NOT NULL,             -- card index within the slide
  h5p_sub_id     uuid,
  text           text        NOT NULL,             -- front/prompt (H5P dialogs[].text)
  answer         text        NOT NULL,             -- back/answer  (H5P dialogs[].answer)
  image_url      text,
  tip            text,                             -- H5P dialogs[].tips
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, group_position, position)
);

CREATE INDEX flashcard_items_page_id_idx ON flashcard_items(page_id);


-- ──────────────────────────────────────────────────────────────
-- 12. Presentation slides (H5P CoursePresentation — non-Dialogcards)
--     For h5p-quiz pages where library_id=35 and slides contain
--     H5P.AdvancedText + H5P.Image elements instead of Dialogcards.
--     Affects: all *-memorecards pages inside the medhelp-60d module.
--
--     layout values:
--       'text'            — slide has only AdvancedText content
--       'image'           — slide has only an image
--       'text_with_image' — slide has both text and image
-- ──────────────────────────────────────────────────────────────

CREATE TABLE presentation_slides (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id      bigint      NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position     int         NOT NULL,               -- slide index within presentation (1-based)
  layout       text        NOT NULL
                 CHECK (layout IN ('text', 'image', 'text_with_image')),
  content_html text,                               -- AdvancedText HTML; null for image-only
  image_url    text,                               -- null for text-only
  caption      text,                               -- image caption if present
  notes        text,                               -- speaker notes / hints
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, position)
);

CREATE INDEX presentation_slides_page_id_idx ON presentation_slides(page_id);


-- ──────────────────────────────────────────────────────────────
-- 13. Nav items
--     One row per blurb card (blurb-nav-hub) or link (navigation-toggle).
--     target_page_id = NULL marks the 14 incomplete OB/GYN + Pediatrics
--     hubs where blurb links were never set; migrated as drafts.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE nav_items (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_page_id bigint      NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  target_page_id bigint      REFERENCES pages(id),   -- null = incomplete link
  position       smallint    NOT NULL,
  label          text        NOT NULL,
  icon           text,
  group_label    text,                               -- section divider within hub
  layout         text        NOT NULL DEFAULT 'cards'
                   CHECK (layout IN ('cards', 'list')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_page_id, position)
);

CREATE INDEX nav_items_source_idx ON nav_items(source_page_id);
CREATE INDEX nav_items_target_idx ON nav_items(target_page_id)
  WHERE target_page_id IS NOT NULL;


-- ──────────────────────────────────────────────────────────────
-- 14. Row-level security
-- ──────────────────────────────────────────────────────────────

-- Content tables (member-read policies defined below).
ALTER TABLE pages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentation_slides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_items            ENABLE ROW LEVEL SECURITY;

-- User/auth tables.
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;

-- Reference tables (read by any authenticated user; write by admins).
ALTER TABLE specialties             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_modules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_module_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cohort_memberships ENABLE ROW LEVEL SECURITY;

-- Returns true if auth.uid() has an active cohort membership right now.
CREATE OR REPLACE FUNCTION user_has_active_membership()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_cohort_memberships ucm
    JOIN cohorts c ON c.id = ucm.cohort_id
    WHERE ucm.user_id = auth.uid()
      AND now() BETWEEN c.membership_starts_at AND c.membership_ends_at
  )
$$;

-- Returns true if auth.uid() has an active membership in a cohort that has
-- already unlocked the given content module (unlock_date <= today).
CREATE OR REPLACE FUNCTION user_has_module_access(mod_id smallint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_cohort_memberships ucm
    JOIN cohorts c              ON c.id  = ucm.cohort_id
    JOIN cohort_module_access a ON a.cohort_id = c.id
                               AND a.content_module_id = mod_id
    WHERE ucm.user_id = auth.uid()
      AND now()          BETWEEN c.membership_starts_at AND c.membership_ends_at
      AND a.unlock_date <= current_date
  )
$$;

-- Returns the calling user's role as text (NULL if no profile exists).
-- SECURITY DEFINER + SET search_path bypasses RLS on profiles,
-- avoiding circular dependency when this function is used inside
-- profiles RLS policies.
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid()
$$;

-- Auto-create a profiles row when a new auth.users row is inserted.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, COALESCE(NEW.email, ''));
  RETURN NEW;
END;
$$;

-- ── Profiles RLS ──────────────────────────────────────────────────

-- Every user reads their own row.
CREATE POLICY profiles_read_own ON profiles FOR SELECT
  USING (id = auth.uid());

-- Any admin role can read all profiles (member management UI).
CREATE POLICY profiles_read_admin ON profiles FOR SELECT
  USING (
    current_user_role() IN
    ('super_admin', 'content_admin', 'support_admin', 'billing_admin')
  );

-- Users update their own row but cannot escalate their own role.
-- WITH CHECK evaluates against the NEW (post-update) row: if the
-- role column changed, current_user_role() still returns the OLD
-- stored role, so the comparison fails and the update is rejected.
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

-- ── Reference table SELECT policies ──────────────────────────────
-- Any authenticated user can read these (not sensitive; needed
-- client-side for specialty grids, cohort labels, unlock dates).

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

-- ── Content table member read policies ───────────────────────────
-- Pages: published + (no module → any active member) | (has module → active + unlocked).
CREATE POLICY pages_read ON pages FOR SELECT USING (
  status = 'publish'
  AND CASE
    WHEN content_module_id IS NULL THEN user_has_active_membership()
    ELSE                                user_has_module_access(content_module_id)
  END
);

-- Child tables delegate the access check to pages via EXISTS.
-- One subquery pattern used consistently across all four tables.
CREATE POLICY lessons_read ON lessons FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pages p WHERE p.id = lessons.page_id AND p.status = 'publish'
    AND CASE WHEN p.content_module_id IS NULL
          THEN user_has_active_membership()
          ELSE user_has_module_access(p.content_module_id) END
  )
);

CREATE POLICY quiz_questions_read ON quiz_questions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pages p WHERE p.id = quiz_questions.page_id AND p.status = 'publish'
    AND CASE WHEN p.content_module_id IS NULL
          THEN user_has_active_membership()
          ELSE user_has_module_access(p.content_module_id) END
  )
);

CREATE POLICY flashcard_items_read ON flashcard_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pages p WHERE p.id = flashcard_items.page_id AND p.status = 'publish'
    AND CASE WHEN p.content_module_id IS NULL
          THEN user_has_active_membership()
          ELSE user_has_module_access(p.content_module_id) END
  )
);

CREATE POLICY presentation_slides_read ON presentation_slides FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pages p WHERE p.id = presentation_slides.page_id AND p.status = 'publish'
    AND CASE WHEN p.content_module_id IS NULL
          THEN user_has_active_membership()
          ELSE user_has_module_access(p.content_module_id) END
  )
);

CREATE POLICY nav_items_read ON nav_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pages p WHERE p.id = nav_items.source_page_id AND p.status = 'publish'
    AND CASE WHEN p.content_module_id IS NULL
          THEN user_has_active_membership()
          ELSE user_has_module_access(p.content_module_id) END
  )
);

-- ── Admin write policies on content tables ────────────────────────
-- FOR ALL stacks on top of the member read policies above; admins
-- also bypass the status='publish' filter, so they can read drafts.

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

-- ── Admin write policies on cohort / module / membership tables ───
-- Restricted to super_admin + billing_admin; content_admin excluded.

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

CREATE POLICY specialties_admin_all ON specialties
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

CREATE POLICY tracks_admin_all ON tracks
  FOR ALL
  USING  (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));


-- ──────────────────────────────────────────────────────────────
-- 15. Triggers
-- ──────────────────────────────────────────────────────────────

-- Keep updated_at current on mutable tables.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pages_updated_at   BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER lessons_updated_at BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create a profiles row whenever Supabase Auth creates a new user.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Recompute cohort_module_access.unlock_date when test_date changes.
-- Without this, admins updating test_date must remember to also update access rows.
CREATE OR REPLACE FUNCTION sync_module_unlock_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.test_date IS DISTINCT FROM OLD.test_date THEN
    UPDATE cohort_module_access a
    SET    unlock_date = NEW.test_date - m.unlock_offset_days
    FROM   content_modules m
    WHERE  a.content_module_id = m.id
      AND  a.cohort_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cohorts_sync_unlock_dates
  AFTER UPDATE OF test_date ON cohorts
  FOR EACH ROW EXECUTE FUNCTION sync_module_unlock_dates();

-- Also recompute when a module's offset changes (e.g. 60d → 45d).
CREATE OR REPLACE FUNCTION sync_module_offset_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.unlock_offset_days IS DISTINCT FROM OLD.unlock_offset_days THEN
    UPDATE cohort_module_access a
    SET    unlock_date = c.test_date - NEW.unlock_offset_days
    FROM   cohorts c
    WHERE  a.cohort_id = c.id
      AND  a.content_module_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER content_modules_sync_dates
  AFTER UPDATE OF unlock_offset_days ON content_modules
  FOR EACH ROW EXECUTE FUNCTION sync_module_offset_dates();
