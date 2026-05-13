/**
 * TypeScript interfaces matching the MedHelpSpace Supabase schema.
 * Replace with `supabase gen types typescript` output once the project is created.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export type UserRole =
  | "super_admin"
  | "content_admin"
  | "support_admin"
  | "billing_admin"
  | "member";

export type AdminLocale = "pt-BR" | "en";

export type ThemePreference = "light" | "dark" | "system";

export type PageType =
  | "plain-content"
  | "text-lesson"
  | "audio-lesson"
  | "h5p-quiz"
  | "blurb-nav-hub"
  | "navigation-toggle";

export type PageStatus = "publish" | "draft";

export type PageView =
  | "hub"
  | "resumos"
  | "formula"
  | "simulados"
  | "flashcards"
  | "audiocards"
  | "memorecards";

export type NavLayout = "cards" | "list";

// ── Core tables ──────────────────────────────────────────────────────────────

export interface Cohort {
  id: number;
  slug: string;                  // e.g. "revalida-2027-1"
  name: string;                  // e.g. "Revalida 2027.1" — display name
  test_date: string;             // ISO date "YYYY-MM-DD"
  membership_starts_at: string;  // ISO timestamptz
  membership_ends_at: string;    // ISO timestamptz
}

export interface UserCohortMembership {
  user_id: string;               // auth.users.id (UUID)
  cohort_id: number;
  joined_at: string;             // ISO timestamptz
}

export interface ContentModule {
  id: number;
  slug: string;                  // e.g. "medhelp-60d"
  name: string;                  // e.g. "MedHelp 60D" — display name
  description: string | null;
  unlock_offset_days: number;    // days before test_date to unlock
}

export interface CohortModuleAccess {
  cohort_id: number;
  content_module_id: number;
  unlock_date: string;           // ISO date "YYYY-MM-DD"; trigger-maintained
}

export interface Specialty {
  id: number;
  slug: string;                  // e.g. "cardiologia"
  name: string;                  // e.g. "Cardiologia"
  emoji: string;                 // e.g. "🫀"
  display_order: number;
}

export interface Track {
  id: number;
  slug: string;                  // "medvoice" | "audiocards" | "flashcards"
  name: string;
}

// ── Content tables ───────────────────────────────────────────────────────────

export interface Page {
  id: number;                    // same as WP post_id
  slug: string;
  title: string;
  type: PageType;
  status: PageStatus;
  parent_id: number | null;
  specialty_id: number | null;
  view: PageView | null;
  track_id: number | null;
  content_module_id: number | null;
  notes: string | null;
  wp_created_at: string;
  wp_modified_at: string;
}

export interface Lesson {
  id: number;
  page_id: number;
  position: number;
  title: string;
  body_html: string | null;
  audio_url: string | null;
  created_at: string;
}

export interface QuizQuestion {
  id: number;
  page_id: number;
  position: number;
  question: string;              // HTML — includes exam source ref in <h3>
  answers: QuizAnswer[];         // JSONB
  media_url: string | null;
  created_at: string;
}

export interface QuizAnswer {
  text: string;
  correct: boolean;
  feedback: string | null;
}

export interface FlashcardItem {
  id: number;
  page_id: number;
  group_position: number;        // slide index within CoursePresentation
  group_label: string | null;
  position: number;              // card index within the slide
  h5p_sub_id: string | null;
  text: string;                  // front / prompt
  answer: string;                // back / answer
  image_url: string | null;
  tip: string | null;
  created_at: string;
}

export interface PresentationSlide {
  id: number;
  page_id: number;
  position: number;
  layout: "text" | "image" | "text_with_image";
  content_html: string | null;
  image_url: string | null;
  caption: string | null;
  notes: string | null;
  created_at: string;
}

export interface NavItem {
  id: number;
  source_page_id: number;
  target_page_id: number | null;
  position: number;
  label: string;
  icon: string | null;
  group_label: string | null;
  layout: NavLayout;
}

export interface NavItemWithSlug extends NavItem {
  target_slug: string | null;
  target_view: PageView | null;
  target_track_id: number | null;
}

// ── User / auth ──────────────────────────────────────────────────────────────

export interface User {
  id: string;                    // auth.users.id (UUID); mirrors profiles.id
  email: string;
  display_name: string | null;   // profiles.display_name (was full_name)
  role: UserRole;
  theme_preference: ThemePreference;
  admin_locale: AdminLocale;
  created_at: string;
  updated_at: string;
}

/** Alias: User and Profile refer to the same profiles table row. */
export type Profile = User;

// ── Composite / view types used in the frontend ─────────────────────────────

export interface PageWithSpecialty extends Page {
  specialty: Specialty | null;
  track: Track | null;
}

export interface CohortWithModule extends Cohort {
  module_access: CohortModuleAccess[];
}

export interface UserWithCohort extends User {
  cohorts: Cohort[];
  active_cohort: Cohort | null;
}

/** Alias for UserWithCohort */
export type ProfileWithCohort = UserWithCohort;

export interface DashboardData {
  user: UserWithCohort;
  specialties: Specialty[];
  module_access: CohortModuleAccess[];
  study_days: number;
}
