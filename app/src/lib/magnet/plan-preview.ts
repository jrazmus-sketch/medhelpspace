import {
  derivePlan,
  defaultPrefs,
  type SpecialtyRow,
  type PageRow,
  type Signals,
} from "@/lib/study-plan/derive";
import { createAdminClient } from "@/lib/supabase/admin";

// Builds a PERSONALIZED study-plan preview from the magnet quiz result, reusing
// the exact same pure engine the member dashboard uses (lib/study-plan/derive).
// No auth, no DB writes — we synthesize "today's" quiz signals from the answers
// and pin the lead's weak specialties as focus. FREE-FUNNEL-BUILD-SPEC.md §4.

// Exam dates per cohort — drive daysToExam + the foundation/intensification phase.
export const COHORT_EXAM_DATE: Record<string, string> = {
  "revalida-2026-2": "2026-09-13",
  "revalida-2027-1": "2027-01-15",
};
export const COHORT_EXAM_LABEL: Record<string, string> = {
  "revalida-2026-2": "13 de setembro",
  "revalida-2027-1": "janeiro de 2027",
};
export const DEFAULT_TARGET_COHORT = "revalida-2026-2";

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

export async function buildPlanPreview(
  answers: MagnetAnswer[],
  cohort?: string,
): Promise<PlanPreview> {
  const examDate =
    COHORT_EXAM_DATE[cohort ?? DEFAULT_TARGET_COHORT] ??
    COHORT_EXAM_DATE[DEFAULT_TARGET_COHORT];
  const admin = createAdminClient();
  const [{ data: specialties }, { data: pages }] = await Promise.all([
    admin.from("specialties").select("id, name, slug"),
    admin
      .from("pages")
      .select("id, slug, title, type, specialty_id, track_id, content_module_id, view"),
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
    pages: (pages ?? []) as PageRow[],
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
