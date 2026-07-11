import {
  derivePlan,
  defaultPrefs,
  type SpecialtyRow,
  type PageRow,
  type TopicRow,
  type TopicContentRow,
  type Signals,
} from "@/lib/study-plan/derive";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSpecialtyPages } from "@/lib/study-plan/fetch";

// Builds a PERSONALIZED study-plan preview from the magnet quiz result, reusing
// the exact same pure engine the member dashboard uses (lib/study-plan/derive).
// No auth, no DB writes — we synthesize "today's" quiz signals from the answers
// and pin the lead's weak specialties as focus. FREE-FUNNEL-BUILD-SPEC.md §4.

// Exam dates per cohort — drive daysToExam + the foundation/intensification phase.
// Dates mirror cohorts.test_date in prod; 2026-2 stays for legacy leads' durable
// result links (turma went off sale 2026-07-11).
export const COHORT_EXAM_DATE: Record<string, string> = {
  "revalida-2026-2": "2026-09-13",
  "revalida-2027-1": "2027-01-15",
  "revalida-20272": "2027-09-15",
};
export const COHORT_EXAM_LABEL: Record<string, string> = {
  "revalida-2026-2": "13 de setembro",
  "revalida-2027-1": "janeiro de 2027",
  "revalida-20272": "setembro de 2027",
};
export const DEFAULT_TARGET_COHORT = "revalida-2027-1";

export type MagnetAnswer = {
  questionId: number;
  specialtyId: number | null;
  isCorrect: boolean;
  pageId: number;
};

export type PlanPreview = {
  daysToExam: number | null;
  weakSpecialties: { id: number; name: string }[];
  visibleItems: { title: string; subtitle: string; kind: string }[];
  lockedCount: number;
  totalItems: number;
};

// The FREE summary shown after Q15, before verification (raw score + missed topics
// + days). The plan CONTENT (items) + flashcards are the gated reward. Lives here
// (a plain module) rather than in the "use server" actions file, which must export
// only async functions. FREE-FUNNEL-V2-SCOPE.md item 6.
export type FreeResultSummary = {
  score: number;
  weakSpecialties: { id: number; name: string }[];
  daysToExam: number | null;
  planItemCount: number;
};

export async function buildPlanPreview(
  answers: MagnetAnswer[],
  cohort?: string,
): Promise<PlanPreview> {
  const examDate =
    COHORT_EXAM_DATE[cohort ?? DEFAULT_TARGET_COHORT] ??
    COHORT_EXAM_DATE[DEFAULT_TARGET_COHORT];
  const admin = createAdminClient();
  const [{ data: specialties }, pages, { data: topics }, { data: topicContent }] =
    await Promise.all([
      admin.from("specialties").select("id, name, slug"),
      // Same paginated, published+specialty page universe the member plan uses —
      // NOT a bare .from("pages") (that truncates at PostgREST's 1000-row cap; the
      // table has ~1337 rows, so the preview would silently drop content).
      fetchAllSpecialtyPages(admin),
      admin
        .from("topics")
        .select("id, name, slug, specialty_id, source_page_id, incidence_count, priority_tier, is_pinned"),
      admin
        .from("topic_content")
        .select("topic_id, resource_type, page_id, question_filter"),
    ]);

  // Weak specialties = the ones the lead got wrong; pinned as plan focus so the
  // preview leads with exactly the topics the simulado just exposed.
  const wrongSpecIds = [
    ...new Set(
      answers
        .filter((a) => !a.isCorrect && a.specialtyId != null)
        .map((a) => a.specialtyId as number),
    ),
  ];

  const nowIso = new Date().toISOString();
  const signals: Signals = {
    quizAttempts: answers
      .filter((a) => a.specialtyId != null)
      .map((a) => ({
        specialty_id: a.specialtyId,
        is_correct: a.isCorrect,
        created_at: nowIso,
        page_id: a.pageId,
      })),
    lessonCompletions: [],
    reviewDueToday: 0,
    lessonsByPageId: new Map<number, number>(),
    pauses: [],
  };

  const plan = derivePlan({
    prefs: { ...defaultPrefs(), focus_specialty_ids: wrongSpecIds, include_60d: false },
    cohort: { test_date: examDate },
    specialties: (specialties ?? []) as SpecialtyRow[],
    pages: (pages ?? []) as unknown as PageRow[],
    topics: (topics ?? []) as TopicRow[],
    topicContent: (topicContent ?? []) as TopicContentRow[],
    signals,
  });

  const visibleItems = plan.items.slice(0, 3).map((it) => ({
    title: it.title,
    subtitle: it.subtitle,
    kind: it.kind,
  }));

  return {
    daysToExam: plan.daysToExam,
    weakSpecialties: plan.weakestSpecialties
      .slice(0, 3)
      .map((w) => ({ id: w.id, name: w.name })),
    visibleItems,
    lockedCount: Math.max(0, plan.items.length - visibleItems.length),
    totalItems: plan.items.length,
  };
}
