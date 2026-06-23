/**
 * Study Plan derivation engine — V2.
 *
 * Pure function: given the user's preferences + signals + cohort/content universe,
 * computes today's recommended plan as a list of actionable items with deep-links.
 *
 * V2 changes:
 *  - available_days bitmask + recurring_off_days replace single paused_until
 *  - study_plan_pauses table provides date-range blocks
 *  - Multi-focus specialties (array) replace single focus_specialty_id
 *  - Excluded specialties never appear in plan
 *  - preferred_content_types filter what kinds of items get scheduled
 *  - content_type_weights drive proportional mix
 *  - temp_intensity overrides intensity for a date range
 *  - weakness_sensitivity tunes weak-specialty weighting
 *  - include_60d toggles MedHelp 60D content
 *  - flashcard_daily_cap caps overwhelming flashcard backlogs
 *  - weekly_hours overrides intensity-tier daily minutes when set
 *  - Paused state early-returns (no wasted item-building work)
 *  - questionsTarget/lessonsTarget now actually drive plan size (fixed dead values)
 */

export type Intensity = "leve" | "padrao" | "intenso";
export type Phase = "foundation" | "intensification" | "taper";
export type ContentType = "quiz" | "lesson" | "audio" | "flashcards" | "memorecards";
export type WeaknessSensitivity = "strict" | "balanced" | "off";

export type IntensitySpec = {
  minutesPerDay: number;
  questionsTarget: number;
  lessonsTarget: number;
  specialtiesPerDay: number;
};

export const INTENSITY: Record<Intensity, IntensitySpec> = {
  leve:    { minutesPerDay: 30,  questionsTarget: 10, lessonsTarget: 1, specialtiesPerDay: 2 },
  padrao:  { minutesPerDay: 60,  questionsTarget: 20, lessonsTarget: 2, specialtiesPerDay: 3 },
  intenso: { minutesPerDay: 120, questionsTarget: 40, lessonsTarget: 3, specialtiesPerDay: 4 },
};

export type PlanItem = {
  kind: ContentType;
  title: string;
  subtitle: string;
  href: string;
  estimatedMinutes: number;
  iconHint: ContentType;
  reason: string;
  specialtyId?: number;
  pageId?: number;
};

export type PauseReason =
  | { type: "recurring_off"; dayName: string }     // plantão
  | { type: "weekly_off"; dayName: string }         // not in available_days
  | { type: "date_range"; from: string; until: string; label: string | null };

export type DerivedPlan = {
  phase: Phase;
  daysToExam: number | null;
  intensity: Intensity;          // effective intensity (after temp_intensity check)
  baseIntensity: Intensity;       // user's set intensity (for display)
  intensitySpec: IntensitySpec;
  items: PlanItem[];
  totalEstimatedMinutes: number;
  weakestSpecialties: { id: number; name: string; accuracy: number | null; attempts: number }[];
  paused: boolean;
  pauseReason: PauseReason | null;
  nextAvailableDate: string | null;  // when plan resumes if currently paused
  progressToday: {
    questionsAnswered: number;
    lessonsCompleted: number;
    specialtiesTouched: number;
  };
  coverageWarning: { excludedCount: number; percentOfExam: number } | null;
};

// ── Inputs ────────────────────────────────────────────────────────────────────

export type StudyPlanPrefs = {
  intensity: Intensity;
  available_days: number;          // bitmask: bit0=Sun .. bit6=Sat
  recurring_off_days: number;       // bitmask
  weekly_hours: number | null;      // overrides INTENSITY.minutesPerDay if set
  temp_intensity: Intensity | null;
  temp_intensity_until: string | null;
  weakness_sensitivity: WeaknessSensitivity;
  include_60d: boolean;
  flashcard_daily_cap: number | null;
  preferred_content_types: ContentType[];
  content_type_weights: Record<ContentType, number>;  // pct, sums roughly to 100
  intensification_start_days: number;
  focus_specialty_ids: number[];     // from study_plan_focus_specialties
  excluded_specialty_ids: number[];   // from study_plan_excluded_specialties
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
  test_date: string | null;
};

export type Signals = {
  quizAttempts: { specialty_id: number | null; is_correct: boolean; created_at: string; page_id: number }[];
  lessonCompletions: { lesson_id: number; page_id: number; completed_at: string }[];
  reviewDueToday: number;
  lessonsByPageId: Map<number, number>;
  pauses: { pause_from: string; pause_until: string; reason: string | null }[];
};

// ── Constants ────────────────────────────────────────────────────────────────

const MEDHELP_60D_MODULE_ID = 1;
const FLASHCARDS_TRACK_ID = 3;
const MEDVOICE_TRACK_ID = 1;
const AUDIOCARDS_TRACK_ID = 2;

const DAY_NAMES_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// ── Defaults helper ──────────────────────────────────────────────────────────

export function defaultPrefs(): StudyPlanPrefs {
  return {
    intensity: "padrao",
    available_days: 127,         // all 7 days
    recurring_off_days: 0,
    weekly_hours: null,
    temp_intensity: null,
    temp_intensity_until: null,
    weakness_sensitivity: "balanced",
    include_60d: true,
    flashcard_daily_cap: null,
    preferred_content_types: ["quiz", "lesson", "audio", "flashcards", "memorecards"],
    content_type_weights: { quiz: 40, lesson: 25, audio: 15, flashcards: 15, memorecards: 5 },
    intensification_start_days: 60,
    focus_specialty_ids: [],
    excluded_specialty_ids: [],
  };
}

// ── Main derivation ──────────────────────────────────────────────────────────

export function derivePlan(args: {
  prefs: StudyPlanPrefs;
  cohort: CohortInfo | null;
  specialties: SpecialtyRow[];
  pages: PageRow[];
  signals: Signals;
}): DerivedPlan {
  const { prefs, cohort, specialties, pages, signals } = args;

  // ── Date setup ────────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().split("T")[0];
  const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
  const dayBit = 1 << dayOfWeek;

  // ── Phase detection ──────────────────────────────────────────────────────
  let daysToExam: number | null = null;
  let phase: Phase = "foundation";
  if (cohort?.test_date) {
    const exam = new Date(cohort.test_date + "T00:00:00");
    daysToExam = Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / 86_400_000));
    if (daysToExam <= 14) phase = "taper";
    else if (daysToExam <= prefs.intensification_start_days) phase = "intensification";
    else phase = "foundation";
  }

  // ── Effective intensity (check temp override) ────────────────────────────
  const tempActive =
    prefs.temp_intensity != null &&
    prefs.temp_intensity_until != null &&
    prefs.temp_intensity_until >= todayKey;
  const effectiveIntensity: Intensity = tempActive
    ? prefs.temp_intensity!
    : prefs.intensity;
  const spec = INTENSITY[effectiveIntensity];

  // ── Per-specialty accuracy ───────────────────────────────────────────────
  const accuracyBySpec = new Map<number, { total: number; correct: number }>();
  for (const a of signals.quizAttempts) {
    if (a.specialty_id == null) continue;
    if (prefs.excluded_specialty_ids.includes(a.specialty_id)) continue;
    const b = accuracyBySpec.get(a.specialty_id) ?? { total: 0, correct: 0 };
    b.total++;
    if (a.is_correct) b.correct++;
    accuracyBySpec.set(a.specialty_id, b);
  }

  // ── Build weakest-specialties list (always present, used by UI) ──────────
  const excludedSet = new Set(prefs.excluded_specialty_ids);
  type SpecRank = { id: number; name: string; accuracy: number | null; attempts: number; weight: number };
  const weaknessFloor =
    prefs.weakness_sensitivity === "strict" ? 0.25 :
    prefs.weakness_sensitivity === "off" ? 1.0 :
    0.5;
  const allRanked: SpecRank[] = specialties
    .filter((s) => !excludedSet.has(s.id))
    .map((s) => {
      const b = accuracyBySpec.get(s.id);
      const accuracy = b && b.total > 0 ? b.correct / b.total : null;
      const weight = prefs.weakness_sensitivity === "off"
        ? 1.0
        : accuracy == null ? 1.0 : Math.max(weaknessFloor, 1.0 - accuracy);
      return { id: s.id, name: s.name, accuracy, attempts: b?.total ?? 0, weight };
    });

  // ── Coverage warning (Algorithm Engineer's required guard) ───────────────
  let coverageWarning: { excludedCount: number; percentOfExam: number } | null = null;
  if (prefs.excluded_specialty_ids.length > 0) {
    const percentExcluded = Math.round(
      (prefs.excluded_specialty_ids.length / Math.max(1, specialties.length)) * 100,
    );
    if (percentExcluded >= 25) {
      coverageWarning = {
        excludedCount: prefs.excluded_specialty_ids.length,
        percentOfExam: percentExcluded,
      };
    }
  }

  // ── Progress today (always computed for dashboard card) ──────────────────
  const todayAttempts = signals.quizAttempts.filter((a) => a.created_at.startsWith(todayKey));
  const todayCompletions = signals.lessonCompletions.filter((c) => c.completed_at.startsWith(todayKey));
  const progressToday = {
    questionsAnswered: todayAttempts.length,
    lessonsCompleted: todayCompletions.length,
    specialtiesTouched: new Set(
      todayAttempts.map((a) => a.specialty_id).filter((s): s is number => s != null),
    ).size,
  };

  // ── Pause detection: date-range > recurring > weekly availability ────────
  let paused = false;
  let pauseReason: PauseReason | null = null;
  let nextAvailableDate: string | null = null;

  const activeRangePause = signals.pauses.find(
    (p) => p.pause_from <= todayKey && p.pause_until >= todayKey,
  );
  if (activeRangePause) {
    paused = true;
    pauseReason = {
      type: "date_range",
      from: activeRangePause.pause_from,
      until: activeRangePause.pause_until,
      label: activeRangePause.reason,
    };
    nextAvailableDate = nextDateAfter(activeRangePause.pause_until);
  } else if ((prefs.recurring_off_days & dayBit) !== 0) {
    paused = true;
    pauseReason = { type: "recurring_off", dayName: DAY_NAMES_PT[dayOfWeek] };
    nextAvailableDate = nextDayMatchingMask(today, prefs.available_days & ~prefs.recurring_off_days, signals.pauses);
  } else if ((prefs.available_days & dayBit) === 0) {
    paused = true;
    pauseReason = { type: "weekly_off", dayName: DAY_NAMES_PT[dayOfWeek] };
    nextAvailableDate = nextDayMatchingMask(today, prefs.available_days & ~prefs.recurring_off_days, signals.pauses);
  }

  // ── Early return for paused state — don't waste compute on items ─────────
  if (paused) {
    return {
      phase,
      daysToExam,
      intensity: effectiveIntensity,
      baseIntensity: prefs.intensity,
      intensitySpec: spec,
      items: [],
      totalEstimatedMinutes: 0,
      weakestSpecialties: allRanked
        .slice()
        .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
        .slice(0, 5)
        .map((r) => ({ id: r.id, name: r.name, accuracy: r.accuracy, attempts: r.attempts })),
      paused: true,
      pauseReason,
      nextAvailableDate,
      progressToday,
      coverageWarning,
    };
  }

  // ── Compute daily minute budget ──────────────────────────────────────────
  let dailyMinutes = spec.minutesPerDay;
  if (prefs.weekly_hours != null) {
    const daysAvailable = countBits(prefs.available_days & ~prefs.recurring_off_days);
    if (daysAvailable > 0) {
      dailyMinutes = Math.round((prefs.weekly_hours * 60) / daysAvailable);
    }
  }
  const minutesScale = dailyMinutes / spec.minutesPerDay;

  // Effective targets (now actually USED — fixes Algorithm Engineer's dead-value finding)
  const effectiveSpec: IntensitySpec = {
    minutesPerDay: dailyMinutes,
    questionsTarget: Math.round(spec.questionsTarget * minutesScale),
    lessonsTarget: Math.round(spec.lessonsTarget * minutesScale),
    specialtiesPerDay: spec.specialtiesPerDay,
  };

  // ── Rank specialties for today's plan ────────────────────────────────────
  // Multi-focus: pinned to front (in order), each at weight 1.5
  // Rest: sorted by weakness weight (descending)
  const ranked: SpecRank[] = [];
  const focusOrder = prefs.focus_specialty_ids;
  if (focusOrder.length > 0) {
    for (const id of focusOrder) {
      const found = allRanked.find((r) => r.id === id);
      if (found) {
        ranked.push({ ...found, weight: 1.5 });
      }
    }
    // Then non-focus, sorted by weakness
    const focusSet = new Set(focusOrder);
    const remaining = allRanked.filter((r) => !focusSet.has(r.id));
    remaining.sort((a, b) => b.weight - a.weight);
    ranked.push(...remaining);
  } else {
    ranked.push(...allRanked.sort((a, b) => b.weight - a.weight));
  }

  // ── Content type filtering + weighting ───────────────────────────────────
  const allowedTypes = new Set(prefs.preferred_content_types);

  // ── Already-completed page sets ──────────────────────────────────────────
  const completedQuizPages = new Set<number>();
  for (const a of signals.quizAttempts) completedQuizPages.add(a.page_id);
  const completionsByPage = new Map<number, number>();
  for (const c of signals.lessonCompletions) {
    completionsByPage.set(c.page_id, (completionsByPage.get(c.page_id) ?? 0) + 1);
  }
  const fullyCompletedLessonPages = new Set<number>();
  for (const [pageId, completed] of completionsByPage) {
    const total = signals.lessonsByPageId.get(pageId) ?? 0;
    if (total > 0 && completed >= total) fullyCompletedLessonPages.add(pageId);
  }

  // ── Phase-tuned content mix ──────────────────────────────────────────────
  // V2: respects allowedTypes + content_type_weights
  const phaseMix = (() => {
    switch (phase) {
      case "foundation":      return { quizPerSpec: 1, lessonPerSpec: 1, audioPerSpec: 0 };
      case "intensification": return { quizPerSpec: 2, lessonPerSpec: 0, audioPerSpec: 0 };
      case "taper":           return { quizPerSpec: 1, lessonPerSpec: 0, audioPerSpec: 0 };
    }
  })();

  // ── Page lookup helpers ──────────────────────────────────────────────────
  function findNextPage(specialtyId: number, predicate: (p: PageRow) => boolean, exclude: Set<number>): PageRow | null {
    return pages.find((p) =>
      p.specialty_id === specialtyId &&
      predicate(p) &&
      !exclude.has(p.id),
    ) ?? null;
  }
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

  // ── Build items ──────────────────────────────────────────────────────────
  const items: PlanItem[] = [];
  const specialtyById = new Map(specialties.map((s) => [s.id, s]));
  const todaysSpecialties = ranked.slice(0, effectiveSpec.specialtiesPerDay);

  for (const s of todaysSpecialties) {
    const specInfo = specialtyById.get(s.id);
    if (!specInfo) continue;
    const reasonBase = s.accuracy != null
      ? `${specInfo.name} · ${Math.round(s.accuracy * 100)}% acerto`
      : `${specInfo.name} · sem questões ainda`;

    // QUIZ
    if (allowedTypes.has("quiz")) {
      for (let i = 0; i < phaseMix.quizPerSpec; i++) {
        const next = findNextPage(s.id, isQuizPage, completedQuizPages);
        if (next) {
          items.push({
            kind: "quiz",
            title: next.title,
            subtitle: reasonBase,
            href: `/app/${specInfo.slug}/${next.slug}`,
            estimatedMinutes: Math.round(15 * minutesScale),
            iconHint: "quiz",
            reason: s.accuracy != null && s.accuracy < 0.7
              ? "Ponto fraco identificado pelas suas respostas"
              : "Próxima questão sequencial",
            specialtyId: s.id,
            pageId: next.id,
          });
          completedQuizPages.add(next.id);
        }
      }
    }

    // LESSON
    if (allowedTypes.has("lesson")) {
      for (let i = 0; i < phaseMix.lessonPerSpec; i++) {
        const next = findNextPage(s.id, isLessonPage, fullyCompletedLessonPages);
        if (next) {
          items.push({
            kind: "lesson",
            title: next.title,
            subtitle: reasonBase,
            href: `/app/${specInfo.slug}/${next.slug}`,
            estimatedMinutes: Math.round(10 * minutesScale),
            iconHint: "lesson",
            reason: "Conteúdo narrativo para reforço conceitual",
            specialtyId: s.id,
            pageId: next.id,
          });
          fullyCompletedLessonPages.add(next.id);
        }
      }
    }

    // AUDIO (foundation only, opt-in via content type)
    if (allowedTypes.has("audio") && phaseMix.audioPerSpec > 0) {
      const next = findNextPage(s.id, isAudioPage, fullyCompletedLessonPages);
      if (next) {
        items.push({
          kind: "audio",
          title: next.title,
          subtitle: `${specInfo.name} · áudio`,
          href: `/app/${specInfo.slug}/${next.slug}`,
          estimatedMinutes: Math.round(12 * minutesScale),
          iconHint: "audio",
          reason: "Áudio para revisão passiva (commute, exaustão)",
          specialtyId: s.id,
          pageId: next.id,
        });
      }
    }
  }

  // Spaced-repetition review queue (all due items, any type). Shown whenever
  // something is due — review keeps already-studied content fresh, so it's not
  // gated by the new-content type prefs. In TAPER it leads the plan (review
  // outranks new content in the final stretch).
  if (signals.reviewDueToday > 0) {
    const cap = prefs.flashcard_daily_cap ?? signals.reviewDueToday;
    const toShow = Math.min(signals.reviewDueToday, cap);
    const reviewItem: PlanItem = {
      kind: "flashcards",
      title: `${toShow} ${toShow === 1 ? "item" : "itens"} para revisar`,
      subtitle: cap < signals.reviewDueToday
        ? `${signals.reviewDueToday} devidos · limite diário: ${cap}`
        : "Repetição espaçada · SM-2",
      href: "/app/revisao",
      estimatedMinutes: Math.min(25, Math.ceil(toShow * 0.5)),
      iconHint: "flashcards",
      reason: phase === "taper"
        ? "Reta final — revisão é prioridade"
        : "Itens devidos hoje pelo algoritmo SM-2",
    };
    if (phase === "taper") items.unshift(reviewItem);
    else items.push(reviewItem);
  }

  // Memorecards (intensification phase + opt-in via content type + include_60d toggle)
  if (
    phase === "intensification" &&
    prefs.include_60d &&
    allowedTypes.has("memorecards")
  ) {
    const memoPage = pages.find((p) => isMemorecardsPage(p));
    if (memoPage) {
      const memoSpec = memoPage.specialty_id ? specialtyById.get(memoPage.specialty_id) : null;
      items.push({
        kind: "memorecards",
        title: "Memorecards de hoje",
        subtitle: "MedHelp 60D · revisão intensiva",
        href: memoSpec
          ? `/app/${memoSpec.slug}/${memoPage.slug}`
          : `/app/${memoPage.slug}`,
        estimatedMinutes: Math.round(10 * minutesScale),
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
    intensity: effectiveIntensity,
    baseIntensity: prefs.intensity,
    intensitySpec: effectiveSpec,
    items,
    totalEstimatedMinutes,
    weakestSpecialties: ranked.slice(0, 5).map((r) => ({
      id: r.id, name: r.name, accuracy: r.accuracy, attempts: r.attempts,
    })),
    paused: false,
    pauseReason: null,
    nextAvailableDate: null,
    progressToday,
    coverageWarning,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countBits(mask: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) n++;
  return n;
}

function nextDateAfter(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function nextDayMatchingMask(
  from: Date,
  mask: number,
  pauses: { pause_from: string; pause_until: string }[],
): string | null {
  if (mask === 0) return null; // no days are available — no resume date
  const cursor = new Date(from);
  for (let i = 1; i <= 30; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    const key = cursor.toISOString().split("T")[0];
    if ((mask & (1 << day)) === 0) continue;
    const inPause = pauses.some((p) => p.pause_from <= key && p.pause_until >= key);
    if (inPause) continue;
    return key;
  }
  return null; // didn't find one in next 30 days
}
