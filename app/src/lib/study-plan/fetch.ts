import { createAdminClient } from "@/lib/supabase/admin";
import { todayKeyBR, startOfDayBRIso } from "@/lib/br-date";
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
import { loadTopicQuestionIndex } from "./topic-questions-server";
import { fetchTopicContent } from "./topic-content";
import { loadPlanSettings } from "./settings-server";
import { isPaceMode } from "./pace";
import { fetchAllForUser, loadQuestionReviewRows } from "./user-rows";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Sizes of each material (views from schema-patch-plano-cobertura.sql). Returns
 * null when any of them is unavailable: the plan then runs without per-material
 * completion (each material follows the questions) instead of on half a catalog.
 */
async function loadPlanCatalog(admin: Admin): Promise<NonNullable<Signals["catalog"]> | null> {
  const [groups, ru, mv] = await Promise.all([
    admin.from("study_plan_flashcard_groups").select("group_id, cards"),
    admin.from("study_plan_revalida_up_pages").select("page_id, lesson_id, insights"),
    admin.from("study_plan_medvoice_lessons").select("lesson_id, duration_seconds"),
  ]);
  if (groups.error || ru.error || mv.error) return null;
  return {
    flashcardGroupSizes: new Map((groups.data ?? []).map((r) => [Number(r.group_id), Number(r.cards)])),
    revalidaUpPages: new Map(
      (ru.data ?? []).map((r) => [Number(r.page_id), { lessonId: Number(r.lesson_id), insights: Number(r.insights) }]),
    ),
    medvoiceLessons: new Map(
      (mv.data ?? []).map((r) => [
        Number(r.lesson_id),
        { durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds) },
      ]),
    ),
  };
}

/** The student's Flashcards facts in one call (null when the function is unavailable). */
async function loadFlashcardFacts(
  admin: Admin,
  userId: string,
  todayStartIso: string,
): Promise<NonNullable<Signals["flashcards"]> | null> {
  const { data, error } = await admin.rpc("study_plan_flashcard_facts", {
    p_user: userId,
    p_today_start: todayStartIso,
  });
  if (error || !data) return null;
  const d = data as { seen?: Record<string, number>; pace_seconds?: number | null; pace_samples?: number; today?: number };
  return {
    seenByGroup: new Map(Object.entries(d.seen ?? {}).map(([k, v]) => [Number(k), Number(v)])),
    paceSeconds: d.pace_seconds == null ? null : Number(d.pace_seconds),
    paceSamples: Number(d.pace_samples ?? 0),
    attemptsToday: Number(d.today ?? 0),
  };
}

/**
 * Fetch ALL published pages that carry a specialty, paginating past PostgREST's
 * 1000-row default cap. There are already > 1000 (~1052 and growing); a single
 * `.order("id")` query silently drops the highest-id rows (the newest content), so
 * `pageById` would be incomplete and any topic whose content lives on a dropped
 * page would vanish from the plan. Paging keeps the universe complete.
 */
export async function fetchAllSpecialtyPages(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Record<string, unknown>[]> {
  const SIZE = 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await admin
      .from("pages")
      .select("id, slug, title, type, specialty_id, track_id, content_module_id, view")
      .eq("status", "publish")
      .not("specialty_id", "is", null)
      .order("id")
      .range(from, from + SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < SIZE) break;
  }
  return out;
}

/**
 * Server-side helper: fetches all V2 signals + preferences for a user, derives today's plan.
 */
export async function getDerivedPlanForUser(
  userId: string,
  opts: { extraMinutesToday?: number } = {},
): Promise<DerivedPlan | null> {
  const admin = createAdminClient();

  // The student's day in Brazil — NOT the server's UTC day (see lib/br-date.ts).
  const todayKey = todayKeyBR();

  const [
    prefsRes,
    pausesRes,
    focusRes,
    excludedRes,
    membershipRes,
    specialtiesRes,
    pagesArr,
    quizAttempts,
    completions,
    topicsRes,
    topicContentRes,
    questionCountsRes,
    topicIndex,
    settings,
    paceRes,
    catalog,
    flashcardFacts,
    audioRes,
    simuladoPagesRes,
    questionReview,
    reviewedTodayRes,
  ] = await Promise.all([
    admin
      .from("study_plans")
      .select(`
        intensity, available_days, recurring_off_days, weekly_hours,
        temp_intensity, temp_intensity_until, weakness_sensitivity, include_60d,
        flashcard_daily_cap, preferred_content_types, content_type_weights,
        intensification_start_days, email_weekly_summary, email_daily_plan
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
    fetchAllSpecialtyPages(admin),
    // question_id drives the mastery check (distinct questions answered, latest
    // attempt each) — without it a page can never be judged complete. The
    // explicit order makes "latest attempt wins" deterministic when two
    // attempts on one question share a timestamp.
    fetchAllForUser<Signals["quizAttempts"][number]>(
      admin, "quiz_attempts",
      "specialty_id, is_correct, created_at, page_id, question_id, error_category",
      userId, ["created_at", "id"],
    ),
    fetchAllForUser<Signals["lessonCompletions"][number]>(
      admin, "lesson_completions", "lesson_id, page_id, completed_at", userId, ["lesson_id"],
    ),
    admin
      .from("topics")
      .select("id, name, slug, specialty_id, source_page_id, incidence_count, priority_tier, is_pinned"),
    // R4b: includes the stable Flashcards group id; paginated (see topic-content.ts).
    fetchTopicContent(admin),
    // How many questions each quiz page holds — the denominator of the mastery
    // check. One row per quiz page (~200), comfortably under PostgREST's
    // 1000-row cap. If the view is missing (patch not applied yet) this simply
    // returns an error and every topic falls back to its own incidence_count.
    admin.from("quiz_page_question_counts").select("page_id, question_count"),
    // R1: topic → its own original questions (null → section-based fallback).
    loadTopicQuestionIndex(admin),
    // Time estimates Karina edits at /admin/plano (defaults when the row is missing).
    loadPlanSettings(admin),
    // Read apart from the big select above: a missing column there would null
    // EVERY preference; here it only means "auto".
    admin.from("study_plans").select("pace_mode").eq("user_id", userId).maybeSingle(),
    loadPlanCatalog(admin),
    loadFlashcardFacts(admin, userId, startOfDayBRIso(todayKey)),
    // Where each MedVoice audio was left (the player saves it).
    admin.from("lesson_progress").select("lesson_id, position_seconds").eq("user_id", userId),
    // Simulado pages (~165), to know whether this week's simulado was done.
    admin.from("pages").select("id").eq("view", "simulados").eq("status", "publish"),
    // What the Revisão knows about each answered question (review-outcomes.ts).
    loadQuestionReviewRows(admin, userId),
    // Items graded today — a Revisão session writes no attempt row, so this is
    // the only trace of the time spent reviewing today.
    admin
      .from("review_schedule")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("item_type", ["flashcard", "quiz_question", "memorecard"])
      .gte("last_reviewed_at", startOfDayBRIso(todayKey)),
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
    email_weekly_summary: raw?.email_weekly_summary ?? defaults.email_weekly_summary,
    email_daily_plan: raw?.email_daily_plan ?? defaults.email_daily_plan,
    pace_mode: isPaceMode(paceRes.data?.pace_mode) ? paceRes.data.pace_mode : defaults.pace_mode,
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
    // Revalida types only — ClinAct cases have their own queue.
    .in("item_type", ["flashcard", "quiz_question", "memorecard"])
    .eq("suspended", false)
    .lte("due_date", todayKey);

  // Lessons per page (for "fully completed" detection)
  const pageIds = completions.map((c) => c.page_id);
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

  const questionCountsByPageId = new Map<number, number>();
  for (const r of questionCountsRes.data ?? []) {
    questionCountsByPageId.set(Number(r.page_id), Number(r.question_count));
  }

  const signals: Signals = {
    quizAttempts,
    lessonCompletions: completions,
    reviewDueToday: reviewDueToday ?? 0,
    lessonsByPageId,
    pauses: (pausesRes.data ?? []) as Signals["pauses"],
    questionCountsByPageId,
    topicIndex,
    catalog,
    flashcards: flashcardFacts,
    audioPositions: new Map(
      (audioRes.data ?? []).map((r) => [Number(r.lesson_id), Number(r.position_seconds ?? 0)]),
    ),
    simuladoPageIds: new Set((simuladoPagesRes.data ?? []).map((r) => Number(r.id))),
    questionReview,
    reviewedToday: reviewedTodayRes.count ?? 0,
  };

  return derivePlan({
    prefs,
    cohort,
    specialties: (specialtiesRes.data ?? []) as { id: number; name: string; slug: string }[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pages: pagesArr as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: (topicsRes.data ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topicContent: (topicContentRes.data ?? []) as any,
    signals,
    settings,
    extraMinutesToday: opts.extraMinutesToday,
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
  const [planRes, focusRes, excludedRes, paceRes] = await Promise.all([
    admin
      .from("study_plans")
      .select(`
        intensity, available_days, recurring_off_days, weekly_hours,
        temp_intensity, temp_intensity_until, weakness_sensitivity, include_60d,
        flashcard_daily_cap, preferred_content_types, content_type_weights,
        intensification_start_days, email_weekly_summary, email_daily_plan, welcomed_at
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
    admin.from("study_plans").select("pace_mode").eq("user_id", userId).maybeSingle(),
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
      email_weekly_summary: raw?.email_weekly_summary ?? defaults.email_weekly_summary,
      email_daily_plan: raw?.email_daily_plan ?? defaults.email_daily_plan,
      pace_mode: isPaceMode(paceRes.data?.pace_mode) ? paceRes.data.pace_mode : defaults.pace_mode,
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
  const todayKey = todayKeyBR();
  const { data } = await admin
    .from("study_plan_pauses")
    .select("id, pause_from, pause_until, reason")
    .eq("user_id", userId)
    .gte("pause_until", todayKey)
    .order("pause_from");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any;
}
