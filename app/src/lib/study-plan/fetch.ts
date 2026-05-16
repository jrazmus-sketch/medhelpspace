import { createAdminClient } from "@/lib/supabase/admin";
import { derivePlan, type DerivedPlan, type StudyPlanPrefs, type Signals } from "./derive";

/**
 * Server-side helper: fetches all signals + preferences for a user, derives today's plan.
 * Returns null if user has no cohort (rare edge case — they shouldn't be here).
 */
export async function getDerivedPlanForUser(userId: string): Promise<DerivedPlan | null> {
  const admin = createAdminClient();

  // Parallel data fetch
  const [
    prefsRes,
    membershipRes,
    specialtiesRes,
    pagesRes,
    quizAttemptsRes,
    completionsRes,
  ] = await Promise.all([
    admin
      .from("study_plans")
      .select("intensity, focus_specialty_id, paused_until")
      .eq("user_id", userId)
      .maybeSingle(),
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
      .order("id"), // stable for "next sequential" semantics
    admin
      .from("quiz_attempts")
      .select("specialty_id, is_correct, created_at, page_id")
      .eq("user_id", userId),
    admin
      .from("lesson_completions")
      .select("lesson_id, page_id, completed_at")
      .eq("user_id", userId),
  ]);

  // Default prefs if user has no row yet (zero-question onboarding)
  const prefs: StudyPlanPrefs = prefsRes.data
    ? {
        intensity: prefsRes.data.intensity as StudyPlanPrefs["intensity"],
        focus_specialty_id: prefsRes.data.focus_specialty_id ?? null,
        paused_until: prefsRes.data.paused_until ?? null,
      }
    : { intensity: "padrao", focus_specialty_id: null, paused_until: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = (membershipRes.data ?? [])[0] as any;
  const cohort = membership?.cohort ? { test_date: membership.cohort.test_date as string | null } : null;

  // Count flashcards due today (or earlier)
  const todayKey = new Date().toISOString().split("T")[0];
  const { count: flashcardsDueToday } = await admin
    .from("flashcard_progress")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due_date", todayKey);

  // Pre-compute lessons-per-page (for "fully completed" detection)
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
    flashcardsDueToday: flashcardsDueToday ?? 0,
    lessonsByPageId,
  };

  return derivePlan({
    prefs,
    cohort,
    specialties: (specialtiesRes.data ?? []) as { id: number; name: string; slug: string }[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pages: (pagesRes.data ?? []) as any,
    signals,
  });
}
