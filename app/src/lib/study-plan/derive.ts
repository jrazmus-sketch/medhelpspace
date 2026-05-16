/**
 * Study Plan derivation engine.
 *
 * Pure function: given the user's preferences, their progress signals, and the
 * cohort + content universe, computes today's recommended plan as a list of
 * specific actionable items with deep-links to actual content pages.
 *
 * Called from:
 *  - The dashboard "Plano de hoje" card (server component)
 *  - The /app/plano route (server component)
 *  - The daily-plan email cron job
 *
 * Algorithm (V1):
 *  1. Determine phase from cohort.test_date and today's date:
 *       Foundation (>60 days out) | Intensification (T-60 to T-14) | Taper (T-14)
 *  2. Compute per-specialty accuracy from quiz_attempts
 *  3. Rank specialties: weakest first (1-accuracy), with floor of 0.5x for any specialty
 *  4. Apply user's intensity tier → daily minute budget + item counts
 *  5. For each priority specialty, find the next un-completed page of the right type
 *  6. Add flashcards due today as a separate item
 */

export type Intensity = "leve" | "padrao" | "intenso";
export type Phase = "foundation" | "intensification" | "taper";

export type IntensitySpec = {
  minutesPerDay: number;
  questionsTarget: number;
  lessonsTarget: number;
  specialtiesPerDay: number;
};

export const INTENSITY: Record<Intensity, IntensitySpec> = {
  leve:    { minutesPerDay: 30, questionsTarget: 10, lessonsTarget: 1, specialtiesPerDay: 2 },
  padrao:  { minutesPerDay: 60, questionsTarget: 20, lessonsTarget: 2, specialtiesPerDay: 3 },
  intenso: { minutesPerDay: 120, questionsTarget: 40, lessonsTarget: 3, specialtiesPerDay: 4 },
};

export type PlanItem = {
  kind: "quiz" | "lesson" | "audio" | "flashcards" | "memorecards";
  title: string;
  subtitle: string;     // e.g. "Cardiologia · ponto fraco"
  href: string;         // deep link to the content page
  estimatedMinutes: number;
  iconHint: "quiz" | "lesson" | "audio" | "flashcard" | "memorecards";
  reason: string;       // why this is suggested (shown in plan view, hidden on dashboard card)
  specialtyId?: number;
  pageId?: number;
};

export type DerivedPlan = {
  phase: Phase;
  daysToExam: number | null;
  intensity: Intensity;
  intensitySpec: IntensitySpec;
  items: PlanItem[];
  totalEstimatedMinutes: number;
  weakestSpecialties: { id: number; name: string; accuracy: number | null; attempts: number }[];
  paused: boolean;
  pausedUntil: string | null;
  // Progress against today's goals (from already-completed work today)
  progressToday: {
    questionsAnswered: number;
    lessonsCompleted: number;
    specialtiesTouched: number;
  };
};

// ── Inputs ────────────────────────────────────────────────────────────────────

export type StudyPlanPrefs = {
  intensity: Intensity;
  focus_specialty_id: number | null;
  paused_until: string | null;
};

export type SpecialtyRow = { id: number; name: string; slug: string };

export type PageRow = {
  id: number;
  slug: string;
  title: string;
  type: string;
  specialty_id: number | null;
  track_id: number | null;
  content_module_id: number | null;
  view: string | null;
};

export type CohortInfo = {
  test_date: string | null; // YYYY-MM-DD
};

export type Signals = {
  // All attempts ever for this user
  quizAttempts: { specialty_id: number | null; is_correct: boolean; created_at: string; page_id: number }[];
  // All lesson_completions for this user (lesson_id + page_id)
  lessonCompletions: { lesson_id: number; page_id: number; completed_at: string }[];
  // Flashcards due today or earlier
  flashcardsDueToday: number;
  // Lessons-per-page map (for completion-percentage logic)
  lessonsByPageId: Map<number, number>;
};

// ── Main derivation function ─────────────────────────────────────────────────

const MEDHELP_60D_MODULE_ID = 1;
const FLASHCARDS_TRACK_ID = 3;
const MEDVOICE_TRACK_ID = 1;
const AUDIOCARDS_TRACK_ID = 2;

export function derivePlan(args: {
  prefs: StudyPlanPrefs;
  cohort: CohortInfo | null;
  specialties: SpecialtyRow[];
  pages: PageRow[];     // ALL published pages with type+specialty+track+module
  signals: Signals;
}): DerivedPlan {
  const { prefs, cohort, specialties, pages, signals } = args;

  // ── Phase
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().split("T")[0];

  let daysToExam: number | null = null;
  let phase: Phase = "foundation";
  if (cohort?.test_date) {
    const exam = new Date(cohort.test_date + "T00:00:00");
    daysToExam = Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / 86_400_000));
    if (daysToExam <= 14) phase = "taper";
    else if (daysToExam <= 60) phase = "intensification";
    else phase = "foundation";
  }

  // ── Paused
  const paused = prefs.paused_until ? prefs.paused_until >= todayKey : false;

  // ── Intensity
  const intensity = prefs.intensity ?? "padrao";
  const spec = INTENSITY[intensity];

  // ── Per-specialty accuracy
  const accuracyBySpec = new Map<number, { total: number; correct: number }>();
  for (const a of signals.quizAttempts) {
    if (a.specialty_id == null) continue;
    const b = accuracyBySpec.get(a.specialty_id) ?? { total: 0, correct: 0 };
    b.total++;
    if (a.is_correct) b.correct++;
    accuracyBySpec.set(a.specialty_id, b);
  }

  // ── Rank specialties: weakest first, with floor of 0.5x
  type SpecRank = { id: number; name: string; accuracy: number | null; attempts: number; weight: number };
  const ranked: SpecRank[] = specialties.map((s) => {
    const b = accuracyBySpec.get(s.id);
    const accuracy = b && b.total > 0 ? b.correct / b.total : null;
    // If no attempts yet, treat as "needs attention" (weight 1.0)
    const weight = accuracy == null ? 1.0 : Math.max(0.5, 1.0 - accuracy);
    return { id: s.id, name: s.name, accuracy, attempts: b?.total ?? 0, weight };
  });

  // Focus override: bump that specialty to the front
  if (prefs.focus_specialty_id) {
    const focusIdx = ranked.findIndex((r) => r.id === prefs.focus_specialty_id);
    if (focusIdx > 0) {
      const focus = ranked.splice(focusIdx, 1)[0];
      focus.weight = 1.5; // explicit user request gets priority
      ranked.unshift(focus);
    }
  } else {
    // Sort by weight descending (weakest first)
    ranked.sort((a, b) => b.weight - a.weight);
  }

  // ── Already-completed pages (to skip)
  const completedQuizPages = new Set<number>();
  // A quiz page is "completed" if user has attempted at least one question from it
  // (in V1; later we could require all questions attempted)
  for (const a of signals.quizAttempts) {
    completedQuizPages.add(a.page_id);
  }
  // A lesson page is "fully completed" if completion count >= total lesson count
  const completionsByPage = new Map<number, number>();
  for (const c of signals.lessonCompletions) {
    completionsByPage.set(c.page_id, (completionsByPage.get(c.page_id) ?? 0) + 1);
  }
  const fullyCompletedLessonPages = new Set<number>();
  for (const [pageId, completed] of completionsByPage) {
    const total = signals.lessonsByPageId.get(pageId) ?? 0;
    if (total > 0 && completed >= total) fullyCompletedLessonPages.add(pageId);
  }

  // ── Progress today (used by dashboard card to show completion state)
  const todayAttempts = signals.quizAttempts.filter((a) => a.created_at.startsWith(todayKey));
  const todayCompletions = signals.lessonCompletions.filter((c) => c.completed_at.startsWith(todayKey));
  const progressToday = {
    questionsAnswered: todayAttempts.length,
    lessonsCompleted: todayCompletions.length,
    specialtiesTouched: new Set(
      todayAttempts.map((a) => a.specialty_id).filter((s): s is number => s != null),
    ).size,
  };

  // ── Build today's plan items
  const items: PlanItem[] = [];
  const specialtyById = new Map(specialties.map((s) => [s.id, s]));

  // Group pages by (specialty, type) for fast lookup
  function findNextPage(specialtyId: number, predicate: (p: PageRow) => boolean, exclude: Set<number>): PageRow | null {
    return pages.find((p) =>
      p.specialty_id === specialtyId &&
      predicate(p) &&
      !exclude.has(p.id),
    ) ?? null;
  }

  // Helper: in taper phase, only quiz pages. In intensification, mostly quiz + memorecards.
  function isQuizPage(p: PageRow): boolean {
    return p.type === "h5p-quiz"
      && p.track_id !== FLASHCARDS_TRACK_ID
      && p.content_module_id !== MEDHELP_60D_MODULE_ID;
  }
  function isLessonPage(p: PageRow): boolean {
    return (p.type === "text-lesson" || p.type === "audio-lesson")
      && p.track_id !== MEDVOICE_TRACK_ID && p.track_id !== AUDIOCARDS_TRACK_ID;
  }
  function isAudioPage(p: PageRow): boolean {
    return p.track_id === MEDVOICE_TRACK_ID;
  }
  function isMemorecardsPage(p: PageRow): boolean {
    return p.type === "h5p-quiz" && p.content_module_id === MEDHELP_60D_MODULE_ID;
  }

  // Phase-tuned mix per specialty
  const phaseMix = (() => {
    switch (phase) {
      case "foundation":      return { quizPerSpec: 1, lessonPerSpec: 1, audioPerSpec: 0 };
      case "intensification": return { quizPerSpec: 2, lessonPerSpec: 0, audioPerSpec: 0 };
      case "taper":           return { quizPerSpec: 1, lessonPerSpec: 0, audioPerSpec: 0 };
    }
  })();

  // Take the top N specialties for today
  const todaysSpecialties = ranked.slice(0, spec.specialtiesPerDay);

  for (const s of todaysSpecialties) {
    const spec = specialtyById.get(s.id);
    if (!spec) continue;
    const reasonBase = s.accuracy != null
      ? `${spec.name} · ${Math.round(s.accuracy * 100)}% acerto`
      : `${spec.name} · sem questões ainda`;

    // QUIZ
    for (let i = 0; i < phaseMix.quizPerSpec; i++) {
      const next = findNextPage(s.id, isQuizPage, completedQuizPages);
      if (next) {
        items.push({
          kind: "quiz",
          title: next.title,
          subtitle: reasonBase,
          href: `/app/${spec.slug}/${next.slug}`,
          estimatedMinutes: 15,
          iconHint: "quiz",
          reason: s.accuracy != null && s.accuracy < 0.7
            ? "Ponto fraco identificado pelas suas respostas"
            : "Próxima questão sequencial",
          specialtyId: s.id,
          pageId: next.id,
        });
        completedQuizPages.add(next.id); // prevent duplicate in same plan
      }
    }

    // LESSON (resumos / formula)
    for (let i = 0; i < phaseMix.lessonPerSpec; i++) {
      const next = findNextPage(s.id, isLessonPage, fullyCompletedLessonPages);
      if (next) {
        items.push({
          kind: "lesson",
          title: next.title,
          subtitle: reasonBase,
          href: `/app/${spec.slug}/${next.slug}`,
          estimatedMinutes: 10,
          iconHint: "lesson",
          reason: "Conteúdo narrativo para reforço conceitual",
          specialtyId: s.id,
          pageId: next.id,
        });
        fullyCompletedLessonPages.add(next.id);
      }
    }

    // AUDIO (medvoice) — only in foundation phase
    if (phaseMix.audioPerSpec > 0) {
      const next = findNextPage(s.id, isAudioPage, fullyCompletedLessonPages);
      if (next) {
        items.push({
          kind: "audio",
          title: next.title,
          subtitle: `${spec.name} · áudio`,
          href: `/app/${spec.slug}/${next.slug}`,
          estimatedMinutes: 12,
          iconHint: "audio",
          reason: "Áudio para revisão passiva (commute, exaustão)",
          specialtyId: s.id,
          pageId: next.id,
        });
      }
    }
  }

  // Flashcards due today (if any)
  if (signals.flashcardsDueToday > 0) {
    items.push({
      kind: "flashcards",
      title: `${signals.flashcardsDueToday} flashcards para revisar`,
      subtitle: "Spaced repetition · SM-2",
      href: "/app/flashcards",
      estimatedMinutes: Math.min(20, Math.ceil(signals.flashcardsDueToday * 0.5)),
      iconHint: "flashcard",
      reason: "Cartas devidas hoje pelo algoritmo SM-2",
    });
  }

  // In intensification phase, add memorecards (60D)
  if (phase === "intensification") {
    const memoPage = pages.find((p) => isMemorecardsPage(p));
    if (memoPage) {
      items.push({
        kind: "memorecards",
        title: "Memorecards de hoje",
        subtitle: "MedHelp 60D · revisão intensiva",
        href: memoPage.specialty_id
          ? `/app/${specialtyById.get(memoPage.specialty_id)?.slug ?? "medhelp-60d"}/${memoPage.slug}`
          : `/app/${memoPage.slug}`,
        estimatedMinutes: 10,
        iconHint: "memorecards",
        reason: "Reta final — memorização de alto rendimento",
        pageId: memoPage.id,
      });
    }
  }

  const totalEstimatedMinutes = items.reduce((sum, it) => sum + it.estimatedMinutes, 0);

  return {
    phase,
    daysToExam,
    intensity,
    intensitySpec: spec,
    items,
    totalEstimatedMinutes,
    weakestSpecialties: ranked.slice(0, 5).map((r) => ({
      id: r.id, name: r.name, accuracy: r.accuracy, attempts: r.attempts,
    })),
    paused,
    pausedUntil: prefs.paused_until,
    progressToday,
  };
}
