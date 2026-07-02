import { createAdminClient } from "@/lib/supabase/admin";
import {
  derivePlan,
  defaultPrefs,
  type DerivedPlan,
  type StudyPlanPrefs,
  type Signals,
  type ContentType,
  type Intensity,
  type WeaknessSensitivity,
} from "./derive";

/**
 * Server-side helper: fetches all V2 signals + preferences for a user, derives today's plan.
 */
export async function getDerivedPlanForUser(userId: string): Promise<DerivedPlan | null> {
  const admin = createAdminClient();

  const todayKey = new Date().toISOString().split("T")[0];

  const [
    prefsRes,
    pausesRes,
    focusRes,
    excludedRes,
    membershipRes,
    specialtiesRes,
    pagesRes,
    quizAttemptsRes,
    completionsRes,
    topicsRes,
    topicContentRes,
  ] = await Promise.all([
    admin
      .from("study_plans")
      .select(`
        intensity, available_days, recurring_off_days, weekly_hours,
        temp_intensity, temp_intensity_until, weakness_sensitivity, include_60d,
        flashcard_daily_cap, preferred_content_types, content_type_weights,
        intensification_start_days
      `)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("study_plan_pauses")
      .select("pause_from, pause_until, reason")
      .eq("user_id", userId)
      .gte("pause_until", todayKey)
      .order("pause_from"),
    admin
      .from("study_plan_focus_specialties")
      .select("specialty_id, priority")
      .eq("user_id", userId)
      .order("priority"),
    admin
      .from("study_plan_excluded_specialties")
      .select("specialty_id")
      .eq("user_id", userId),
    admin
      .from("user_cohort_memberships")
      .select("cohort:cohorts(test_date)")
      .eq("user_id", userId),
    admin.from("specialties").select("id, name, slug").order("display_order"),
    admin
      .from("pages")
      .select("id, slug, title, type, specialty_id, track_id, content_module_id, view")
      .eq("status", "publish")
      .not("specialty_id", "is", null)
      .order("id"),
    admin
      .from("quiz_attempts")
      .select("specialty_id, is_correct, created_at, page_id, error_category")
      .eq("user_id", userId),
    admin
      .from("lesson_completions")
      .select("lesson_id, page_id, completed_at")
      .eq("user_id", userId),
    admin
      .from("topics")
      .select("id, name, slug, specialty_id, source_page_id, incidence_count, priority_tier, is_pinned"),
    admin
      .from("topic_content")
      .select("topic_id, resource_type, page_id, question_filter"),
  ]);

  // Build prefs object, applying defaults for missing fields
  const defaults = defaultPrefs();
  const focusIds = (focusRes.data ?? []).map((r) => r.specialty_id as number);
  const excludedIds = (excludedRes.data ?? []).map((r) => r.specialty_id as number);

  const raw = prefsRes.data;
  const prefs: StudyPlanPrefs = {
    intensity: (raw?.intensity as Intensity) ?? defaults.intensity,
    available_days: raw?.available_days ?? defaults.available_days,
    recurring_off_days: raw?.recurring_off_days ?? defaults.recurring_off_days,
    weekly_hours: raw?.weekly_hours ?? null,
    temp_intensity: (raw?.temp_intensity as Intensity | null) ?? null,
    temp_intensity_until: raw?.temp_intensity_until ?? null,
    weakness_sensitivity: (raw?.weakness_sensitivity as WeaknessSensitivity) ?? defaults.weakness_sensitivity,
    include_60d: raw?.include_60d ?? defaults.include_60d,
    flashcard_daily_cap: raw?.flashcard_daily_cap ?? null,
    preferred_content_types:
      (raw?.preferred_content_types as ContentType[]) ?? defaults.preferred_content_types,
    content_type_weights:
      (raw?.content_type_weights as Record<ContentType, number>) ?? defaults.content_type_weights,
    intensification_start_days: raw?.intensification_start_days ?? defaults.intensification_start_days,
    focus_specialty_ids: focusIds,
    excluded_specialty_ids: excludedIds,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = (membershipRes.data ?? [])[0] as any;
  const cohort = membership?.cohort
    ? { test_date: membership.cohort.test_date as string | null }
    : null;

  // Review items due today — ALL types from the unified review_schedule
  // (flashcards + quiz questions + memorecards). Drives the plan's review item.
  const { count: reviewDueToday } = await admin
    .from("review_schedule")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("suspended", false)
    .lte("due_date", todayKey);

  // Lessons per page (for "fully completed" detection)
  const pageIds = (completionsRes.data ?? []).map((c) => c.page_id);
  const uniquePageIds = [...new Set(pageIds)];
  const lessonsByPageId = new Map<number, number>();
  if (uniquePageIds.length > 0) {
    const { data: lessonsCount } = await admin
      .from("lessons")
      .select("page_id")
      .in("page_id", uniquePageIds);
    for (const l of lessonsCount ?? []) {
      lessonsByPageId.set(l.page_id as number, (lessonsByPageId.get(l.page_id as number) ?? 0) + 1);
    }
  }

  const signals: Signals = {
    quizAttempts: (quizAttemptsRes.data ?? []) as Signals["quizAttempts"],
    lessonCompletions: (completionsRes.data ?? []) as Signals["lessonCompletions"],
    reviewDueToday: reviewDueToday ?? 0,
    lessonsByPageId,
    pauses: (pausesRes.data ?? []) as Signals["pauses"],
  };

  return derivePlan({
    prefs,
    cohort,
    specialties: (specialtiesRes.data ?? []) as { id: number; name: string; slug: string }[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pages: (pagesRes.data ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: (topicsRes.data ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topicContent: (topicContentRes.data ?? []) as any,
    signals,
  });
}

/**
 * Lightweight: just fetch raw prefs (for editing UI). Skips deriving the plan.
 */
export async function getStudyPlanPrefs(userId: string): Promise<{
  prefs: StudyPlanPrefs;
  welcomedAt: string | null;
}> {
  const admin = createAdminClient();
  const [planRes, focusRes, excludedRes] = await Promise.all([
    admin
      .from("study_plans")
      .select(`
        intensity, available_days, recurring_off_days, weekly_hours,
        temp_intensity, temp_intensity_until, weakness_sensitivity, include_60d,
        flashcard_daily_cap, preferred_content_types, content_type_weights,
        intensification_start_days, welcomed_at
      `)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("study_plan_focus_specialties")
      .select("specialty_id, priority")
      .eq("user_id", userId)
      .order("priority"),
    admin
      .from("study_plan_excluded_specialties")
      .select("specialty_id")
      .eq("user_id", userId),
  ]);

  const defaults = defaultPrefs();
  const focusIds = (focusRes.data ?? []).map((r) => r.specialty_id as number);
  const excludedIds = (excludedRes.data ?? []).map((r) => r.specialty_id as number);
  const raw = planRes.data;

  return {
    prefs: {
      intensity: (raw?.intensity as Intensity) ?? defaults.intensity,
      available_days: raw?.available_days ?? defaults.available_days,
      recurring_off_days: raw?.recurring_off_days ?? defaults.recurring_off_days,
      weekly_hours: raw?.weekly_hours ?? null,
      temp_intensity: (raw?.temp_intensity as Intensity | null) ?? null,
      temp_intensity_until: raw?.temp_intensity_until ?? null,
      weakness_sensitivity: (raw?.weakness_sensitivity as WeaknessSensitivity) ?? defaults.weakness_sensitivity,
      include_60d: raw?.include_60d ?? defaults.include_60d,
      flashcard_daily_cap: raw?.flashcard_daily_cap ?? null,
      preferred_content_types:
        (raw?.preferred_content_types as ContentType[]) ?? defaults.preferred_content_types,
      content_type_weights:
        (raw?.content_type_weights as Record<ContentType, number>) ?? defaults.content_type_weights,
      intensification_start_days: raw?.intensification_start_days ?? defaults.intensification_start_days,
      focus_specialty_ids: focusIds,
      excluded_specialty_ids: excludedIds,
    },
    welcomedAt: (raw?.welcomed_at as string | null) ?? null,
  };
}

/**
 * Get also the pauses (for the pause editor) and active pauses count.
 */
export async function getStudyPlanPauses(userId: string): Promise<{
  pause_from: string;
  pause_until: string;
  reason: string | null;
  id: number;
}[]> {
  const admin = createAdminClient();
  const todayKey = new Date().toISOString().split("T")[0];
  const { data } = await admin
    .from("study_plan_pauses")
    .select("id, pause_from, pause_until, reason")
    .eq("user_id", userId)
    .gte("pause_until", todayKey)
    .order("pause_from");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any;
}
