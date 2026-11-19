import { createAdminClient } from "@/lib/supabase/admin";
import { todayKeyBR, startOfDayBRIso, diffDaysKey } from "@/lib/br-date";
import {
  derivePlan,
  defaultPrefs,
  type DerivedPlan,
  type StudyPlanPrefs,
  type Signals,
  type ContentType,
  type WeaknessSensitivity,
} from "./derive";
import { loadTopicQuestionIndex } from "./topic-questions-server";
import { fetchTopicContent } from "./topic-content";
import { loadPlanSettings } from "./settings-server";
import { isPaceMode } from "./pace";
import { countDays, isValidDailyMinutes, legacyDailyMinutes } from "./availability";
import { fetchAllForUser, loadQuestionReviewRows } from "./user-rows";
import { frequencyFromColumn, type SimuladoCatalog, type SimuladoPage } from "./simulado";

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
    admin.from("study_plan_medvoice_lessons").select("lesson_id, duration_seconds, has_audio"),
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
        { durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds), hasAudio: r.has_audio !== false },
      ]),
    ),
  };
}

/**
 * The simulado pages with their questions (view study_plan_simulado_pages, ~170
 * rows) and where the student's current run of each begins (quiz_runs). Null
 * when the view is unavailable: the plan then never asks to continue a simulado.
 */
export async function loadSimuladoCatalog(admin: Admin, userId: string): Promise<SimuladoCatalog | null> {
  const [pagesRes, runsRes] = await Promise.all([
    admin.from("study_plan_simulado_pages").select("page_id, slug, title, specialty_slug, is_mini, question_ids"),
    admin.from("quiz_runs").select("page_id, started_at").eq("user_id", userId),
  ]);
  if (pagesRes.error) return null;
  const pages = new Map<number, SimuladoPage>();
  for (const r of pagesRes.data ?? []) {
    pages.set(Number(r.page_id), {
      pageId: Number(r.page_id),
      slug: String(r.slug),
      title: String(r.title),
      specialtySlug: String(r.specialty_slug ?? "geral"),
      isMini: r.is_mini === true,
      questionIds: ((r.question_ids as unknown[] | null) ?? []).map(Number),
    });
  }
  const runStarts = new Map<number, string>();
  for (const r of runsRes.data ?? []) runStarts.set(Number(r.page_id), String(r.started_at));
  return { pages, runStarts };
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
    simulados,
    simuladoFreqRes,
    questionReview,
    reviewedTodayRes,
    dailyRes,
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
    // Simulado pages with their questions + the student's current runs.
    loadSimuladoCatalog(admin, userId),
    // Read apart, like pace_mode: a missing column must only mean "auto".
    admin.from("study_plans").select("simulados_per_week").eq("user_id", userId).maybeSingle(),
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
    // Time per study day — read apart, like pace_mode (a missing column must
    // only mean "use what the row said before the daily field existed").
    admin.from("study_plans").select(DAILY_COLUMNS).eq("user_id", userId).maybeSingle(),
  ]);

  // Build prefs object, applying defaults for missing fields
  const defaults = defaultPrefs();
  const focusIds = (focusRes.data ?? []).map((r) => r.specialty_id as number);
  const excludedIds = (excludedRes.data ?? []).map((r) => r.specialty_id as number);

  const raw = prefsRes.data;
  const prefs: StudyPlanPrefs = {
    available_days: raw?.available_days ?? defaults.available_days,
    recurring_off_days: raw?.recurring_off_days ?? defaults.recurring_off_days,
    ...dailyTimePrefs(raw, dailyRes.data),
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
    simulado_frequency: frequencyFromColumn(simuladoFreqRes.data?.simulados_per_week),
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
    simulados,
    questionReview,
    reviewedToday: reviewedTodayRes.count ?? 0,
  };

  // MedHelp 60D: inside the 60 days before the exam, the plan's day is the 60D schedule's and nothing else.
  // Loaded only then (a dynamic import: that module reads the prefs through this one).
  const examKey = cohort?.test_date ? cohort.test_date.slice(0, 10) : null;
  const daysLeft = examKey ? diffDaysKey(todayKey, examKey) : null;
  if (daysLeft != null && daysLeft > 0 && daysLeft <= 60) {
    try {
      const { loadD60 } = await import("@/lib/medhelp60/cronograma-server");
      const d60 = await loadD60(userId, admin);
      if (d60 && !d60.preview) {
        const ticked = new Set(d60.checked);
        const allItems = d60.cronograma.weeks.flatMap((w) => w.items);
        const availableItems = allItems.filter((i) => !i.pending);
        signals.sixtyD = {
          record: {
            done: availableItems.filter((i) => ticked.has(i.key)).length,
            available: availableItems.length,
            notDelivered: allItems.length - availableItems.length,
          },
          weeks: d60.cronograma.weeks.filter((w) => w.endKey >= todayKey).map((w) => {
            const open = w.items.filter((i) => !i.pending && !ticked.has(i.key));
            return {
              n: w.n, startKey: w.startKey, endKey: w.endKey, hasSimulado: w.hasSimulado,
              pendingItems: open.length, pendingMinutes: open.reduce((s, i) => s + i.minutes, 0),
            };
          }),
        };
      }
    } catch {
      // The 60D schedule is an addition: if it cannot be read, the plan still runs on its own.
    }
  }

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
  const [planRes, focusRes, excludedRes, paceRes, simuladoFreqRes, dailyRes] = await Promise.all([
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
    admin.from("study_plans").select("simulados_per_week").eq("user_id", userId).maybeSingle(),
    admin.from("study_plans").select(DAILY_COLUMNS).eq("user_id", userId).maybeSingle(),
  ]);

  const defaults = defaultPrefs();
  const focusIds = (focusRes.data ?? []).map((r) => r.specialty_id as number);
  const excludedIds = (excludedRes.data ?? []).map((r) => r.specialty_id as number);
  const raw = planRes.data;

  return {
    prefs: {
      available_days: raw?.available_days ?? defaults.available_days,
      recurring_off_days: raw?.recurring_off_days ?? defaults.recurring_off_days,
      ...dailyTimePrefs(raw, dailyRes.data),
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
      simulado_frequency: frequencyFromColumn(simuladoFreqRes.data?.simulados_per_week),
    },
    welcomedAt: (raw?.welcomed_at as string | null) ?? null,
  };
}

const DAILY_COLUMNS = "daily_minutes, temp_daily_minutes, temp_daily_until";

/**
 * The student's time per study day (Karina 2026-11-18). A row that predates the
 * daily field — or a database where the patch is not applied yet — keeps the
 * load it had: the old weekly hours spread over its study days, else the old
 * Leve/Padrão/Intenso minutes (lib/study-plan/availability.ts).
 */
function dailyTimePrefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  legacy: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  daily: any,
): Pick<StudyPlanPrefs, "daily_minutes" | "temp_daily_minutes" | "temp_daily_until"> {
  const defaults = defaultPrefs();
  const mask =
    (legacy?.available_days ?? defaults.available_days) & ~(legacy?.recurring_off_days ?? defaults.recurring_off_days);
  const daily_minutes = isValidDailyMinutes(daily?.daily_minutes)
    ? daily.daily_minutes
    : legacy
      ? legacyDailyMinutes({ weekly_hours: legacy.weekly_hours, intensity: legacy.intensity, studyDays: countDays(mask) })
      : defaults.daily_minutes;
  const temp = isValidDailyMinutes(daily?.temp_daily_minutes) && typeof daily?.temp_daily_until === "string";
  return {
    daily_minutes,
    temp_daily_minutes: temp ? daily.temp_daily_minutes : null,
    temp_daily_until: temp ? daily.temp_daily_until : null,
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
