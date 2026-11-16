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
 *  - error-classification tilt: specialties with knowledge-gap errors surface sooner
 *
 * V2.1 (planner audit fixes):
 *  - every "today" is the STUDENT's day in America/São_Paulo, never the server's
 *    UTC day (see lib/br-date.ts). Vercel runs UTC, so the old code rolled over
 *    to tomorrow at 21:00 BRT.
 *  - a topic's quiz is retired from the plan by MASTERY, not by a single answered
 *    question. See isPageMastered below.
 */

import { GAP_ERROR_CATEGORIES, type QuizErrorCategory } from "@/lib/quiz-errors";
import { todayKeyBR, toDateKeyBR, dayOfWeekForKey, addDaysKey, diffDaysKey } from "@/lib/br-date";
import { flashcardGroupSlug } from "@/lib/flashcard-group-slug";
import { buildTopicProgress, topicQuizHref, type TopicQuestionIndex } from "./topic-questions";

export type Intensity = "leve" | "padrao" | "intenso";
export type Phase = "foundation" | "intensification" | "taper";
export type ContentType =
  | "quiz" | "simulado" | "lesson" | "audio" | "flashcards" | "memorecards" | "revalida_up";
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
  email_weekly_summary: boolean;      // Monday recap email (default on)
  email_daily_plan: boolean;          // opt-in daily plan email (default off)
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

export type TopicRow = {
  id: number;
  name: string;
  slug: string;
  specialty_id: number | null;
  source_page_id: number | null;
  incidence_count: number;
  priority_tier: string | null;   // 'A' | 'B' | 'C' | 'D' | null
  is_pinned: boolean;
};

export type TopicContentRow = {
  topic_id: number;
  resource_type: string;          // quiz | simulado | flashcards | medvoice | revalida_up
  page_id: number | null;
  question_filter: unknown | null;
  /** R4b: the Flashcards group this link opens, by stable id. Absent before schema-patch-r4b. */
  flashcard_group_id?: number | null;
};

export type CohortInfo = {
  test_date: string | null;
};

export type Signals = {
  quizAttempts: { specialty_id: number | null; is_correct: boolean; created_at: string; page_id: number; question_id?: number | null; error_category?: string | null }[];
  lessonCompletions: { lesson_id: number; page_id: number; completed_at: string }[];
  reviewDueToday: number;
  lessonsByPageId: Map<number, number>;
  pauses: { pause_from: string; pause_until: string; reason: string | null }[];
  /**
   * page_id → how many quiz questions that page actually holds (from the
   * `quiz_page_question_counts` view). Drives the mastery check below. An empty
   * map is safe: each topic falls back to its own `incidence_count`, which
   * equals the question count for 199 of 211 topics.
   */
  questionCountsByPageId?: Map<number, number>;
  /**
   * R1: which ORIGINAL questions belong to each topic (topic_question_links). When a
   * topic has originals here, its quiz item opens ONLY them (`?tema=` on its main
   * section) and its progress/mastery is computed over them. Absent/null (view not
   * applied, funnel preview) → the section-based behaviour below, unchanged.
   */
  topicIndex?: TopicQuestionIndex | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MEDHELP_60D_MODULE_ID = 1;

const DAY_NAMES_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * Share of a page's questions a student must currently be getting right before
 * the topic stops being scheduled. Mirrors the Roteiro's "dominado" threshold
 * (lib/study-plan/roadmap.ts) so the two surfaces never disagree.
 */
const MASTERY_ACCURACY = 0.7;

type PageProgress = { answered: number; correct: number };

/**
 * Per-page progress from the raw attempt log, counted by DISTINCT question using
 * each question's LATEST attempt.
 *
 * Counting raw attempts would let a student "finish" a 30-question page by
 * answering the same question 30 times, and would permanently hold accuracy down
 * after a retry session (the wrong first attempt keeps counting). Latest-attempt
 * semantics match what the student believes: "I get these right now."
 */
export function buildPageProgress(
  attempts: Signals["quizAttempts"],
): Map<number, PageProgress> {
  // page_id → question_id → { correct, at }
  const latest = new Map<number, Map<number, { correct: boolean; at: string }>>();
  for (const a of attempts) {
    // An attempt with no question_id proves nothing about coverage — it could be
    // the same question answered ten times. quiz_attempts.question_id is NOT
    // NULL, so this only guards synthesized signals (e.g. the funnel preview).
    if (a.question_id == null) continue;
    const qid = a.question_id;
    let byQuestion = latest.get(a.page_id);
    if (!byQuestion) {
      byQuestion = new Map();
      latest.set(a.page_id, byQuestion);
    }
    const prev = byQuestion.get(qid);
    if (!prev || a.created_at > prev.at) {
      byQuestion.set(qid, { correct: a.is_correct, at: a.created_at });
    } else if (a.created_at === prev.at && prev.correct && !a.is_correct) {
      // Exact tie on the same question: resolve toward the WRONG answer, so the
      // verdict does not depend on row order. Ambiguous data must never be the
      // thing that promotes a topic to "mastered" and drops it from the plan.
      byQuestion.set(qid, { correct: false, at: a.created_at });
    }
  }
  const out = new Map<number, PageProgress>();
  for (const [pageId, byQuestion] of latest) {
    let correct = 0;
    for (const v of byQuestion.values()) if (v.correct) correct++;
    out.set(pageId, { answered: byQuestion.size, correct });
  }
  return out;
}

/**
 * A quiz page leaves the daily plan only once the student has answered every
 * question on it AND is currently at or above the mastery threshold.
 *
 * The previous rule retired a page after ONE answered question, so a topic could
 * disappear from the plan forever after a single tap — the plan drained itself
 * and then claimed "você já cobriu o material" while the Roteiro still showed the
 * topic as em andamento.
 */
export function isPageMastered(
  progress: PageProgress | undefined,
  totalQuestions: number,
): boolean {
  if (!progress || progress.answered === 0) return false;
  // An unknown/absurd total means "we cannot prove this page is finished" — so
  // never retire it. NaN must be caught explicitly: every comparison against it
  // is false, so a bare `totalQuestions <= 0` check would let it through.
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return false;
  if (progress.answered < totalQuestions) return false;
  return progress.correct / progress.answered >= MASTERY_ACCURACY;
}

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
    preferred_content_types: ["quiz", "simulado", "revalida_up", "flashcards", "audio", "memorecards"],
    // Read but not used to size anything (see schema-patch-planner-content-types-default.sql).
    content_type_weights: { quiz: 30, simulado: 20, lesson: 10, audio: 15, flashcards: 20, memorecards: 5, revalida_up: 0 },
    intensification_start_days: 60,
    focus_specialty_ids: [],
    excluded_specialty_ids: [],
    email_weekly_summary: true,
    email_daily_plan: false,
  };
}

// ── Main derivation ──────────────────────────────────────────────────────────

export function derivePlan(args: {
  prefs: StudyPlanPrefs;
  cohort: CohortInfo | null;
  specialties: SpecialtyRow[];
  pages: PageRow[];
  topics: TopicRow[];
  topicContent: TopicContentRow[];
  signals: Signals;
}): DerivedPlan {
  const { prefs, cohort, specialties, pages, topics, topicContent, signals } = args;

  // ── Date setup ────────────────────────────────────────────────────────────
  // Everything below is anchored to the STUDENT's calendar day in Brazil. The
  // server runs UTC, so deriving "today" from the server clock moved the plan a
  // day forward every night at 21:00 BRT.
  const todayKey = todayKeyBR();
  const dayOfWeek = dayOfWeekForKey(todayKey); // 0=Sun..6=Sat
  const dayBit = 1 << dayOfWeek;

  // ── Phase detection ──────────────────────────────────────────────────────
  let daysToExam: number | null = null;
  let phase: Phase = "foundation";
  if (cohort?.test_date) {
    // test_date is a DATE column ("2027-01-15"); tolerate a full timestamp too.
    const examKey = cohort.test_date.slice(0, 10);
    daysToExam = Math.max(0, diffDaysKey(todayKey, examKey));
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
  // created_at/completed_at are UTC timestamps — compare on the Brazilian
  // calendar day they fall on, not on their UTC date prefix.
  const todayAttempts = signals.quizAttempts.filter((a) => toDateKeyBR(a.created_at) === todayKey);
  const todayCompletions = signals.lessonCompletions.filter((c) => toDateKeyBR(c.completed_at) === todayKey);
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
    nextAvailableDate = nextDayMatchingMask(todayKey, prefs.available_days & ~prefs.recurring_off_days, signals.pauses);
  } else if ((prefs.available_days & dayBit) === 0) {
    paused = true;
    pauseReason = { type: "weekly_off", dayName: DAY_NAMES_PT[dayOfWeek] };
    nextAvailableDate = nextDayMatchingMask(todayKey, prefs.available_days & ~prefs.recurring_off_days, signals.pauses);
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

  // ── Content type prefs + per-page quiz progress ──────────────────────────
  const allowedTypes = new Set(prefs.preferred_content_types);
  const pageProgress = buildPageProgress(signals.quizAttempts);
  const questionCounts = signals.questionCountsByPageId ?? new Map<number, number>();
  // Pages already emitted in THIS run — three topics can share one quiz page
  // (e.g. the 7 urology sub-topics on page 90242), and the plan must not list
  // the same link three times.
  const emittedQuizPages = new Set<number>();
  const topicIndex = signals.topicIndex ?? null;
  const topicProgress = topicIndex ? buildTopicProgress(signals.quizAttempts, topicIndex) : new Map();

  // ── Topic → content pointers (from topic_content) ────────────────────────
  const contentByTopic = new Map<number, TopicContentRow[]>();
  for (const tc of topicContent) {
    const arr = contentByTopic.get(tc.topic_id);
    if (arr) arr.push(tc);
    else contentByTopic.set(tc.topic_id, [tc]);
  }
  const pageById = new Map(pages.map((p) => [p.id, p]));

  // ── Topic ranking: incidence primary, weakness tilts ─────────────────────
  // Score = incidence + (specialty weakness × TILT) + focus + pin. TILT is
  // capped small so incidence stays dominant — weakness only reorders topics
  // of comparable frequency, never leapfrogs a much-higher-yield one.
  const TILT_STRENGTH = 3;
  const ERROR_TILT = 2;
  const FOCUS_BONUS = 2;
  const PIN_BONUS = 1;
  const weaknessBySpecId = new Map(
    allRanked.map((r) => [r.id, r.weight] as [number, number]),
  );
  const focusSetTopics = new Set(prefs.focus_specialty_ids);

  // Error-classification tilt (Phase 4): specialties where the student's TAGGED
  // wrong answers are knowledge gaps (conteudo/conduta/memorizacao) get a small,
  // bounded boost so their topics surface sooner — because those errors mean
  // "study this topic more". Test-taking errors (interpretacao/distracao) are
  // excluded: they don't implicate the topic, so they only inform the report's
  // insight text, never the ranking. Normalized by the worst specialty, so the
  // signal is relative and self-scaling; empty (no tags) → zero tilt for everyone.
  const gapErrorBySpec = new Map<number, number>();
  for (const a of signals.quizAttempts) {
    if (a.specialty_id == null || a.is_correct) continue;
    if (excludedSet.has(a.specialty_id)) continue;
    if (a.error_category && GAP_ERROR_CATEGORIES.has(a.error_category as QuizErrorCategory)) {
      gapErrorBySpec.set(a.specialty_id, (gapErrorBySpec.get(a.specialty_id) ?? 0) + 1);
    }
  }
  const maxGapErrors = gapErrorBySpec.size > 0 ? Math.max(...gapErrorBySpec.values()) : 0;
  const gapWeightForSpec = (specId: number): number =>
    maxGapErrors > 0 ? (gapErrorBySpec.get(specId) ?? 0) / maxGapErrors : 0;

  const specialtyById = new Map(specialties.map((s) => [s.id, s]));
  const specialtySlugById = new Map(specialties.map((s) => [s.id, s.slug]));
  // A content page lives under ITS OWN specialty — a topic that moved specialty
  // (Artrite Infecciosa → Outros) must not open its Reumatologia flashcard deck
  // under Outros breadcrumbs.
  const pageHref = (p: PageRow, fallbackSpecSlug: string): string => {
    const own = p.specialty_id != null ? specialtySlugById.get(p.specialty_id) : undefined;
    return `/app/${own ?? fallbackSpecSlug}/${p.slug}`;
  };
  const isMemorecardsPage = (p: PageRow): boolean =>
    p.type === "h5p-quiz" && p.content_module_id === MEDHELP_60D_MODULE_ID;

  const rankedTopics = topics
    .filter(
      (t) =>
        t.specialty_id != null &&
        !excludedSet.has(t.specialty_id),
    )
    .map((t) => {
      const specId = t.specialty_id as number;
      const weakness = weaknessBySpecId.get(specId) ?? 1.0;
      const gapWeight = gapWeightForSpec(specId);
      const score =
        t.incidence_count +
        weakness * TILT_STRENGTH +
        gapWeight * ERROR_TILT +
        (focusSetTopics.has(specId) ? FOCUS_BONUS : 0) +
        (t.is_pinned ? PIN_BONUS : 0);
      return { topic: t, weakness, gapWeight, score };
    })
    .sort((a, b) => b.score - a.score);

  // ── Build items: walk ranked topics, surface each topic's content ────────
  // Generic narrative "lesson" items are intentionally dropped — Karina's plan
  // keeps narrative summaries out of the schedule.
  const topicsToday = Math.max(1, Math.round((spec.specialtiesPerDay + 1) * minutesScale));
  const contentPageFor = (t: TopicRow, kind: "quiz" | "medvoice" | "revalida_up"): PageRow | null => {
    const tc = (contentByTopic.get(t.id) ?? []).find((c) => c.resource_type === kind);
    const pid = tc?.page_id ?? (kind === "quiz" ? t.source_page_id : null);
    return pid != null ? pageById.get(pid) ?? null : null;
  };

  // One quiz item, section-based or topic-based (R1) alike.
  const quizItem = (
    topic: TopicRow,
    specName: string,
    progress: { answered: number; correct: number } | undefined,
    totalQuestions: number,
    href: string,
    pageId: number,
    weakness: number,
    gapWeight: number,
  ): PlanItem => {
    const tierLabel = topic.priority_tier ? `prioridade ${topic.priority_tier}` : "tema";
    const answered = progress?.answered ?? 0;
    const inProgress = answered > 0;
    // Clamp: a question deleted after being answered would otherwise read
    // "18 de 15 questões".
    const shownAnswered = Math.min(answered, totalQuestions);
    // Fully answered but still under the 70% bar — say so, because
    // "retome de onde parou" on a 20-de-20 item reads as a bug.
    const accuracyPct = inProgress ? Math.round((progress!.correct / answered) * 100) : 0;
    const needsAccuracy = inProgress && answered >= totalQuestions;
    return {
      kind: "quiz",
      title: topic.name,
      subtitle: needsAccuracy
        ? `${specName} · ${accuracyPct}% de acerto · revise os erros`
        : inProgress
          ? `${specName} · ${shownAnswered} de ${totalQuestions} questões`
          : `${specName} · ${tierLabel} · ${topic.incidence_count} no exame`,
      href,
      estimatedMinutes: Math.round(15 * minutesScale),
      iconHint: "quiz",
      reason: needsAccuracy
        ? `Você respondeu tudo, mas ainda está em ${accuracyPct}% — refaça para fixar`
        : inProgress
          ? "Retome de onde parou neste tema"
          : gapWeight >= 0.5
          ? "Você tem errado por conteúdo aqui — reforce este tema"
          : weakness > 0.5
            ? "Ponto fraco + alta incidência no Revalida"
            : topic.priority_tier === "A"
              ? "Tema de altíssima incidência no Revalida"
              : "Próximo tema por incidência no exame",
      specialtyId: topic.specialty_id as number,
      pageId,
    };
  };

  const items: PlanItem[] = [];
  const seenFlashcardDecks = new Set<string>();
  // One Revalida Up page per day, even when two topics share it (Patologias da Coluna Vertebral + Trauma
  // Raquimedular → the Neurologia page; the Outros areas): Karina 2026-11-15, no duplicated tasks.
  const seenRevalidaUpPages = new Set<number>();
  let surfaced = 0;
  for (const { topic, weakness, gapWeight } of rankedTopics) {
    if (surfaced >= topicsToday) break;
    const specInfo = specialtyById.get(topic.specialty_id as number);
    if (!specInfo) continue;
    const topicRows = contentByTopic.get(topic.id) ?? [];
    let emitted = false;

    // QUIZ — the primary driver. A topic stays in rotation until its quiz page
    // is MASTERED (every question answered, currently ≥70% right). Partially
    // answered pages come back with their progress shown, so an interrupted
    // topic is resumed instead of silently dropped.
    // R1: the topic's own originals, when the index knows them.
    const topicOrigins = topicIndex?.originsOfTopic.get(topic.id);
    const topicLink =
      topicIndex && topicOrigins && topicOrigins.size > 0
        ? topicQuizHref(topicIndex, topic, pageById, specialtySlugById, specInfo.slug)
        : null;
    if (allowedTypes.has("quiz") && topicLink && topicOrigins) {
      const totalQuestions = topicOrigins.size;
      const progress = topicProgress.get(topic.id);
      if (!isPageMastered(progress, totalQuestions)) {
        items.push(quizItem(topic, specInfo.name, progress, totalQuestions, topicLink.href, topicLink.pageId, weakness, gapWeight));
        emitted = true;
      }
    } else if (allowedTypes.has("quiz")) {
      const quizPage = contentPageFor(topic, "quiz");
      if (quizPage && !emittedQuizPages.has(quizPage.id)) {
        const progress = pageProgress.get(quizPage.id);
        // The page's real question count, falling back to the topic's incidence
        // (equal for 199 of 211 topics) when the view is unavailable or returns
        // something unusable. A total of 0 means the page has nothing to answer:
        // scheduling it would pin an item that can never be completed, so it is
        // skipped rather than shown forever.
        const viewCount = questionCounts.get(quizPage.id);
        const totalQuestions =
          typeof viewCount === "number" && Number.isFinite(viewCount) && viewCount > 0
            ? viewCount
            : topic.incidence_count;
        if (totalQuestions > 0 && !isPageMastered(progress, totalQuestions)) {
          items.push(quizItem(topic, specInfo.name, progress, totalQuestions, pageHref(quizPage, specInfo.slug), quizPage.id, weakness, gapWeight));
          emittedQuizPages.add(quizPage.id);
          emitted = true;
        }
      }
    }

    // REVALIDA UP — the topic's exam patterns, between Questões and Flashcards
    // (Karina's order: Questões → Revalida Up → Flashcards). Linked through
    // topic_content; the link uses the PAGE's specialty, because a Revalida Up
    // page can sit under another specialty than its topic (e.g. the GI topics
    // filed under Cirurgia Geral, the Outros areas).
    if (allowedTypes.has("revalida_up")) {
      const ruPage = contentPageFor(topic, "revalida_up");
      if (ruPage && ruPage.view === "revalida-up" && !seenRevalidaUpPages.has(ruPage.id)) {
        seenRevalidaUpPages.add(ruPage.id);
        const ruSpec =
          (ruPage.specialty_id != null ? specialtyById.get(ruPage.specialty_id) : null) ?? specInfo;
        items.push({
          kind: "revalida_up",
          title: topic.name,
          subtitle: `${specInfo.name} · Revalida Up`,
          href: `/app/${ruSpec.slug}/${ruPage.slug}`,
          estimatedMinutes: Math.round(6 * minutesScale),
          iconHint: "revalida_up",
          reason: "Veja como o tema cai na prova",
          specialtyId: topic.specialty_id as number,
          pageId: ruPage.id,
        });
        emitted = true;
      }
    }

    // FLASHCARDS — memorize the topic's key points (deduped per deck page).
    if (allowedTypes.has("flashcards")) {
      const fc = topicRows.find((c) => c.resource_type === "flashcards");
      // R1: the topic's own group (?grupo=) when the link names one, so the deck
      // opens on this topic instead of the whole specialty grid. Dedupe per
      // deck+group: two topics of one deck are two different items now.
      const groupLabel =
        fc?.question_filter && typeof fc.question_filter === "object"
          ? ((fc.question_filter as { group_label?: unknown }).group_label as string | undefined)
          : undefined;
      // A link that names no group falls back to the TOPIC's name as the group (Karina 2026-11-13: a topic
      // without a valid group never opens the whole deck; the deck says no Flashcards are linked instead).
      const effectiveGroup = groupLabel ?? (topicIndex ? topic.name : undefined);
      // R4b: a link that carries the group's stable id opens it by id — a renamed or moved group keeps its
      // link (the database keeps the link's deck page_id = the group's deck).
      const groupId = fc?.flashcard_group_id ?? null;
      const withGroup = Boolean(topicIndex && (groupId != null || effectiveGroup));
      const groupParam = groupId != null ? String(groupId) : effectiveGroup ? flashcardGroupSlug(effectiveGroup) : "";
      const fcKey = fc?.page_id != null ? `${fc.page_id}|${withGroup ? groupParam : ""}` : null;
      if (fc?.page_id != null && fcKey && !seenFlashcardDecks.has(fcKey)) {
        const deck = pageById.get(fc.page_id);
        if (deck) {
          const deckHref = pageHref(deck, specInfo.slug);
          items.push({
            kind: "flashcards",
            title: topic.name,
            subtitle: `${specInfo.name} · flashcards`,
            href: withGroup ? `${deckHref}?grupo=${encodeURIComponent(groupParam)}` : deckHref,
            estimatedMinutes: Math.round(8 * minutesScale),
            iconHint: "flashcards",
            reason: "Memorize os pontos-chave do tema",
            specialtyId: topic.specialty_id as number,
            pageId: deck.id,
          });
          seenFlashcardDecks.add(fcKey);
          emitted = true;
        }
      }
    }

    // AUDIO (MedVoice) — foundation only, opt-in, when the topic has it.
    if (phase === "foundation" && allowedTypes.has("audio")) {
      const audioPage = contentPageFor(topic, "medvoice");
      if (audioPage) {
        items.push({
          kind: "audio",
          title: topic.name,
          subtitle: `${specInfo.name} · áudio`,
          href: pageHref(audioPage, specInfo.slug),
          estimatedMinutes: Math.round(12 * minutesScale),
          iconHint: "audio",
          reason: "Reforço em áudio para o tema de hoje",
          specialtyId: topic.specialty_id as number,
          pageId: audioPage.id,
        });
        emitted = true;
      }
    }

    if (emitted) surfaced++;
  }

  // Simulado — a standalone timed mock (not topic-anchored). Surfaced in the
  // practice-heavy phases when the student opted into Simulados. Answers already
  // enroll into SM-2 via /api/quiz-attempt, so no extra review wiring is needed.
  if (allowedTypes.has("simulado") && (phase === "intensification" || phase === "taper")) {
    items.push({
      kind: "simulado",
      title: "Simulado do dia",
      subtitle: "Treino cronometrado · prova completa",
      href: "/app/estudo-por-questoes",
      estimatedMinutes: Math.round(40 * minutesScale),
      iconHint: "simulado",
      reason: phase === "taper"
        ? "Reta final — simule as condições da prova"
        : "Ganhe volume e ritmo de prova",
    });
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
  return addDaysKey(dateKey, 1);
}

function nextDayMatchingMask(
  fromKey: string,
  mask: number,
  pauses: { pause_from: string; pause_until: string }[],
): string | null {
  if (mask === 0) return null; // no days are available — no resume date
  for (let i = 1; i <= 30; i++) {
    const key = addDaysKey(fromKey, i);
    if ((mask & (1 << dayOfWeekForKey(key))) === 0) continue;
    const inPause = pauses.some((p) => p.pause_from <= key && p.pause_until >= key);
    if (inPause) continue;
    return key;
  }
  return null; // didn't find one in next 30 days
}
