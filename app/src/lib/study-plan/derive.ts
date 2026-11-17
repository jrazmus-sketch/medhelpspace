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
 * V3 (Karina 2026-11-17 — a schedule, not a list of suggestions):
 *  - the day is filled by MINUTES, never above the student's time: Revisão first,
 *    then the week's simulado and MemoreCards (last 60 days), then new content
 *    (lib/study-plan/schedule.ts);
 *  - each material of a topic finishes on its own evidence and the topic leaves
 *    only when every selected one is done;
 *  - time estimates come from study_plan_settings (/admin/plano) and from the
 *    student's own pace (lib/study-plan/pace.ts);
 *  - the same schedule, run to the eve of the exam, is the FORECAST: what is
 *    expected before the exam, what is not, and what would widen the coverage;
 *  - nothing is stored: the plan is re-derived from real progress on every load.
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
import { DEFAULT_PLAN_SETTINGS, type PlanSettings } from "./settings";
import { withReviewOutcomes, questionsInReview, type QuestionReviewRow } from "./review-outcomes";
import {
  medianGapSeconds, resolvePace, QUESTION_GAP_MIN_S, QUESTION_GAP_MAX_S,
  type PaceMode, type ResolvedPace,
} from "./pace";
import {
  simulateSchedule,
  type DayCalendar, type ScheduleInput, type ScheduleResult, type ScheduledDay, type WorkActivity,
} from "./schedule";

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
  /** The topic this item belongs to, and how many of its units (questions, cards) are on today. */
  topicId?: number;
  units?: number;
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
  /** The day's time (minutes) and how much of it today's answers already used. */
  todayBudgetMinutes: number;
  todayDoneMinutes: number;
  /** Today's time is used up while work remains (≠ "nothing left to study"). */
  dayComplete: boolean;
  /** The time estimates in force for this student (lib/study-plan/pace.ts). */
  pace: ResolvedPace;
  /** What is expected before the exam. null when the exam date is unknown. */
  forecast: PlanForecast | null;
  /** Every study day from today to the exam with the minutes placed on it (checks/reports; not rendered). */
  scheduleDays: ScheduledDay[];
};

export type ForecastTopic = { id: number; name: string; specialtyName: string; tier: string | null };

export type ForecastHint =
  | { kind: "minutes"; extraMinutesPerDay: number; expectedTopics: number; coversAll: boolean }
  | { kind: "day"; dayName: string; expectedTopics: number; coversAll: boolean };

export type PlanForecast = {
  /** Topics with something still to do in the selected materials (Y) / expected before the exam (X). */
  pendingTopics: number;
  expectedTopics: number;
  /** In priority order — the ones the schedule does not reach before the exam. */
  notExpected: ForecastTopic[];
  /** Topics whose selected materials are all done. */
  completedTopics: number;
  /**
   * Topics the schedule reaches before the exam WITHOUT finishing — so "0 expected"
   * (no topic concluded in full) is never read as "nothing will be studied".
   */
  partialTopics: number;
  /**
   * Topics with nothing left to schedule but not concluded: every question
   * answered, accuracy still below 70%, the wrong ones coming back in the Revisão.
   */
  inReviewTopics: number;
  studyDaysLeft: number;
  minutesPerStudyDay: number;
  /** Minutes still to study / of new content that fit before the exam / actually placed on days. */
  pendingMinutes: number;
  capacityMinutes: number;
  scheduledMinutes: number;
  /** Day the last expected topic ends, when everything fits. */
  finishDay: string | null;
  /** What would widen the coverage. */
  hints: ForecastHint[];
  scope: {
    /** The materials counted, in plan order. */
    countedTypes: ContentType[];
    /** Topics whose MedVoice was left out (it is scheduled only before the last-60-days phase). */
    audioLeftOutTopics: number;
    excludedSpecialties: number;
  };
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
  pace_mode: PaceMode;                // "Ritmo de estudo" (default auto)
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
  /**
   * Sizes of each material (views study_plan_*). Absent (funnel preview, patch
   * not applied) → a material has no "done" signal of its own and follows the
   * questions instead, so it can never stall the plan.
   */
  catalog?: {
    /** flashcard_groups.id → cards in the group */
    flashcardGroupSizes: Map<number, number>;
    /** Revalida Up page → its one lesson and its number of insights */
    revalidaUpPages: Map<number, { lessonId: number; insights: number }>;
    /** MedVoice lesson → measured audio length (null = not measured) */
    medvoiceLessons: Map<number, { durationSeconds: number | null }>;
  } | null;
  /** The student's Flashcards facts (function study_plan_flashcard_facts). */
  flashcards?: {
    /** group → distinct cards answered at least once */
    seenByGroup: Map<number, number>;
    paceSeconds: number | null;
    paceSamples: number;
    attemptsToday: number;
  } | null;
  /** MedVoice lesson → seconds already heard (lesson_progress). */
  audioPositions?: Map<number, number>;
  /** Ids of the simulado pages (pages.view = 'simulados'), to know the week's simulado was done. */
  simuladoPageIds?: Set<number>;
  /**
   * The student's questions in the Revisão (review_schedule). Absent → the plan
   * knows nothing about the Revisão and asks again itself for questions answered
   * below 70% (the behaviour before 2026-11-17).
   */
  questionReview?: QuestionReviewRow[] | null;
  /** Review items graded today (a Revisão session writes no attempt row). */
  reviewedToday?: number;
};

// ── Constants ────────────────────────────────────────────────────────────────


/** Sizes assumed when the catalog is unavailable (funnel preview). */
const FALLBACK_REVALIDA_UP_INSIGHTS = 4;
const FALLBACK_FLASHCARDS = 16;
/** "With N more minutes a day…" — the steps tried for the coverage hint. */
const EXTRA_MINUTES_LADDER = [15, 30, 45, 60, 90, 120];
/** The materials the forecast counts, in plan order (Resumos are never scheduled). */
const FORECAST_TYPES: ContentType[] = ["quiz", "revalida_up", "flashcards", "audio"];

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
    pace_mode: "auto",
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
  /** Time estimates (study_plan_settings). Omitted → the code defaults. */
  settings?: PlanSettings;
  /** The student's "Ritmo de estudo". Omitted → auto. */
  paceMode?: PaceMode;
  /** "Adiantar": extra minutes the student asked for today. */
  extraMinutesToday?: number;
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

  // ── The student's calendar and daily time ────────────────────────────────
  // (No early return when today is paused: the forecast below is still wanted.)
  const settings = args.settings ?? DEFAULT_PLAN_SETTINGS;
  const studyDayMask = prefs.available_days & ~prefs.recurring_off_days;
  const daysAvailable = countBits(studyDayMask);
  const minutesForDay = (dayKey: string): number => {
    if (prefs.weekly_hours != null && daysAvailable > 0) {
      return Math.round((prefs.weekly_hours * 60) / daysAvailable);
    }
    const temp =
      prefs.temp_intensity != null &&
      prefs.temp_intensity_until != null &&
      prefs.temp_intensity_until >= dayKey;
    return INTENSITY[temp ? prefs.temp_intensity! : prefs.intensity].minutesPerDay;
  };
  const dailyMinutes = minutesForDay(todayKey);

  // ── The student's pace (lib/study-plan/pace.ts) ──────────────────────────
  const pace = resolvePace({
    mode: args.paceMode ?? prefs.pace_mode ?? "auto",
    settings,
    question: medianGapSeconds(
      signals.quizAttempts.map((a) => a.created_at),
      QUESTION_GAP_MIN_S,
      QUESTION_GAP_MAX_S,
    ),
    flashcard: {
      medianSeconds: signals.flashcards?.paceSeconds ?? null,
      samples: signals.flashcards?.paceSamples ?? 0,
    },
  });

  const effectiveSpec: IntensitySpec = {
    minutesPerDay: dailyMinutes,
    questionsTarget: Math.round(dailyMinutes / pace.minutesPerQuestion),
    lessonsTarget: spec.lessonsTarget,
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
  // Mastery sees what the Revisão knows: a question answered right later, in a
  // review session, counts as right (review-outcomes.ts). Everything else below
  // (today's counts, pace, specialty accuracy) keeps the real attempts.
  const masteryAttempts = withReviewOutcomes(signals.quizAttempts, signals.questionReview);
  const inReview = questionsInReview(signals.questionReview);
  const pageProgress = buildPageProgress(masteryAttempts);
  const questionCounts = signals.questionCountsByPageId ?? new Map<number, number>();
  // Pages already emitted in THIS run — three topics can share one quiz page
  // (e.g. the 7 urology sub-topics on page 90242), and the plan must not list
  // the same link three times.
  const emittedQuizPages = new Set<number>();
  const topicIndex = signals.topicIndex ?? null;
  const topicProgress = topicIndex ? buildTopicProgress(masteryAttempts, topicIndex) : new Map();
  // Latest verdict per question record, and the records of each original — to
  // find WHICH questions of a topic are currently wrong.
  const latestVerdict = new Map<number, { correct: boolean; at: string; pageId: number }>();
  for (const a of masteryAttempts) {
    if (a.question_id == null) continue;
    const prev = latestVerdict.get(a.question_id);
    if (!prev || a.created_at > prev.at || (a.created_at === prev.at && prev.correct && !a.is_correct)) {
      latestVerdict.set(a.question_id, { correct: a.is_correct, at: a.created_at, pageId: a.page_id });
    }
  }
  const recordsOfOrigin = new Map<number, number[]>();
  for (const [questionId, origin] of topicIndex?.originOfQuestion ?? []) {
    const list = recordsOfOrigin.get(origin);
    if (list) list.push(questionId);
    else recordsOfOrigin.set(origin, [questionId]);
  }
  /** The question records of a topic (or of a section) whose latest answer is wrong. */
  const wrongQuestions = (origins: Set<number> | undefined, sectionPageId: number | null): number[] => {
    const out: number[] = [];
    if (origins) {
      for (const origin of origins) {
        // One original may have two records: the most recently answered one speaks for it.
        let best: { id: number; at: string; correct: boolean } | null = null;
        for (const id of recordsOfOrigin.get(origin) ?? []) {
          const v = latestVerdict.get(id);
          if (v && (!best || v.at > best.at)) best = { id, at: v.at, correct: v.correct };
        }
        if (best && !best.correct) out.push(best.id);
      }
    } else if (sectionPageId != null) {
      for (const [id, v] of latestVerdict) if (v.pageId === sectionPageId && !v.correct) out.push(id);
    }
    return out;
  };

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

  // ── The work still to do, in priority order ──────────────────────────────
  // Every topic contributes ONE activity per material the student selected and
  // has not finished. Each material finishes on its own evidence (Karina
  // 2026-11-17) — nothing is ever marked done on the student's behalf:
  //   Questões     every question answered, currently ≥70% right
  //   Revalida Up  the page concluded (its lesson is in lesson_completions)
  //   Flashcards   every card of the topic's group answered at least once
  //   MedVoice     the lesson concluded
  // A topic leaves the plan only when all of them are done. Generic narrative
  // "lesson" items are intentionally absent — Resumos stay out of the schedule.
  const contentPageFor = (t: TopicRow, kind: "quiz" | "medvoice" | "revalida_up"): PageRow | null => {
    const tc = (contentByTopic.get(t.id) ?? []).find((c) => c.resource_type === kind);
    const pid = tc?.page_id ?? (kind === "quiz" ? t.source_page_id : null);
    return pid != null ? pageById.get(pid) ?? null : null;
  };

  const catalog = signals.catalog ?? null;
  const completedLessons = new Set(signals.lessonCompletions.map((c) => c.lesson_id));
  const seenByGroup = signals.flashcards?.seenByGroup ?? new Map<number, number>();

  type QueueMeta = {
    topic: TopicRow;
    specName: string;
    weakness: number;
    gapWeight: number;
    href: string;
    pageId: number;
    /** Size of the whole material (questions / cards / insights), for the subtitle. */
    unitsTotal: number;
    progress?: PageProgress;
    /** Questões: everything answered but below the bar → only the wrong ones are redone. */
    redo?: boolean;
  };
  // Collected per topic first: a topic the student has STARTED stays ahead of the
  // ones not started yet, so what was begun is finished before something new
  // opens (the ranking shifts a little every day with the student's accuracy).
  type TopicWork = { topic: TopicRow; started: boolean; acts: WorkActivity[]; metas: QueueMeta[] };
  const work: TopicWork[] = [];
  const seenFlashcardDecks = new Set<string>();
  // One Revalida Up page once, even when two topics share it (Patologias da Coluna Vertebral + Trauma
  // Raquimedular → the Neurologia page; the Outros areas): Karina 2026-11-15, no duplicated tasks.
  const seenRevalidaUpPages = new Set<number>();
  /** Topics that have at least one material of the selected types / still have work. */
  let topicsInScope = 0;
  const pendingTopics: TopicRow[] = [];
  /** Nothing left to schedule, not concluded: below 70% with the wrong questions in the Revisão. */
  let inReviewTopics = 0;

  for (const { topic, weakness, gapWeight } of rankedTopics) {
    const specInfo = specialtyById.get(topic.specialty_id as number);
    if (!specInfo) continue;
    const topicRows = contentByTopic.get(topic.id) ?? [];
    const queue: WorkActivity[] = [];
    const meta: QueueMeta[] = [];
    let hasMaterial = false;
    // Any material of the topic already touched (or finished).
    let started = false;
    // Its questions are all answered, below 70%, and the Revisão is bringing the wrong ones back.
    let questionsInRevisao = false;
    const base = { topic, specName: specInfo.name, weakness, gapWeight };

    // QUESTÕES — R1: the topic's own originals, when the index knows them;
    // otherwise its section (shared by several topics → listed once).
    const topicOrigins = topicIndex?.originsOfTopic.get(topic.id);
    const topicLink =
      topicIndex && topicOrigins && topicOrigins.size > 0
        ? topicQuizHref(topicIndex, topic, pageById, specialtySlugById, specInfo.slug)
        : null;
    const quizPage = topicLink ? null : contentPageFor(topic, "quiz");
    const quizProgress = topicLink ? topicProgress.get(topic.id) : quizPage ? pageProgress.get(quizPage.id) : undefined;
    // The page's real question count, falling back to the topic's incidence
    // (equal for 199 of 211 topics) when the view is unavailable or returns
    // something unusable. A total of 0 means the page has nothing to answer:
    // scheduling it would pin an item that can never be completed.
    const viewCount = quizPage ? questionCounts.get(quizPage.id) : undefined;
    const quizTotal = topicLink && topicOrigins
      ? topicOrigins.size
      : typeof viewCount === "number" && Number.isFinite(viewCount) && viewCount > 0
        ? viewCount
        : topic.incidence_count;
    const hasQuiz = Boolean(topicLink || (quizPage && quizTotal > 0));
    const quizMastered = hasQuiz && isPageMastered(quizProgress, quizTotal);

    if (allowedTypes.has("quiz") && hasQuiz && !(quizPage && emittedQuizPages.has(quizPage.id))) {
      hasMaterial = true;
      if (quizPage) emittedQuizPages.add(quizPage.id);
      if ((quizProgress?.answered ?? 0) > 0) started = true;
      if (!quizMastered) {
        const answered = Math.min(quizProgress?.answered ?? 0, quizTotal);
        const answeredAll = answered >= quizTotal;
        // Every question answered, still below 70% (Karina 2026-11-17): the wrong
        // ones are ALREADY scheduled in the Revisão, which has its own time in the
        // day — asking for them here too would be the same work twice. The plan
        // only asks again for a wrong question the Revisão is NOT bringing back
        // (suspended there, or never enrolled), so there is always a next activity
        // with real minutes, never a zero-length item, and the topic never blocks
        // the ones after it.
        let units = quizTotal - answered;
        if (answeredAll) {
          const wrong = wrongQuestions(topicLink ? topicOrigins : undefined, quizPage?.id ?? null);
          const notInReview = inReview ? wrong.filter((id) => !inReview.has(id)) : wrong;
          // Without per-question evidence (legacy attempts) fall back to the tally.
          units = wrong.length > 0
            ? notInReview.length
            : Math.max(1, Math.min(quizTotal, (quizProgress?.answered ?? 0) - (quizProgress?.correct ?? 0)));
          if (units === 0) questionsInRevisao = true;
        }
        if (units > 0) {
          queue.push({
            kind: "quiz",
            topicId: topic.id,
            unitsRemaining: units,
            minutesPerUnit: pace.minutesPerQuestion,
            divisible: true,
            minChunkUnits: 1,
          });
          meta.push({
            ...base,
            href: topicLink ? topicLink.href : pageHref(quizPage!, specInfo.slug),
            pageId: topicLink ? topicLink.pageId : quizPage!.id,
            unitsTotal: quizTotal,
            progress: quizProgress,
            redo: answeredAll,
          });
        }
      }
    }

    // REVALIDA UP — the topic's exam patterns, between Questões and Flashcards
    // (Karina's order). The link uses the PAGE's specialty, because a Revalida Up
    // page can sit under another specialty than its topic.
    if (allowedTypes.has("revalida_up")) {
      const ruPage = contentPageFor(topic, "revalida_up");
      if (ruPage && ruPage.view === "revalida-up" && !seenRevalidaUpPages.has(ruPage.id)) {
        seenRevalidaUpPages.add(ruPage.id);
        hasMaterial = true;
        const info = catalog?.revalidaUpPages.get(ruPage.id);
        // Without the catalog (funnel preview) there is no "concluded" signal: the
        // material then follows the questions, so it can never stall the plan.
        const done = info ? completedLessons.has(info.lessonId) : quizMastered;
        if (done && info) started = true;
        if (!done) {
          const insights = info?.insights ?? FALLBACK_REVALIDA_UP_INSIGHTS;
          const ruSpec =
            (ruPage.specialty_id != null ? specialtyById.get(ruPage.specialty_id) : null) ?? specInfo;
          queue.push({
            kind: "revalida_up",
            topicId: topic.id,
            unitsRemaining: 1,
            minutesPerUnit: insights * pace.minutesPerRevalidaUpInsight,
            divisible: false,
            minChunkUnits: 1,
          });
          meta.push({ ...base, href: `/app/${ruSpec.slug}/${ruPage.slug}`, pageId: ruPage.id, unitsTotal: insights });
        }
      }
    }

    // FLASHCARDS — the topic's own group (deduped per deck + group).
    if (allowedTypes.has("flashcards")) {
      const fc = topicRows.find((c) => c.resource_type === "flashcards");
      // R1: the topic's own group (?grupo=) when the link names one, so the deck
      // opens on this topic instead of the whole specialty grid.
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
      const deck = fc?.page_id != null ? pageById.get(fc.page_id) : undefined;
      if (deck && fcKey && !seenFlashcardDecks.has(fcKey)) {
        seenFlashcardDecks.add(fcKey);
        hasMaterial = true;
        const size = groupId != null ? catalog?.flashcardGroupSizes.get(Number(groupId)) : undefined;
        const known = typeof size === "number" && size > 0;
        const seen = known ? Math.min(size, seenByGroup.get(Number(groupId)) ?? 0) : 0;
        const cardsLeft = known ? size - seen : FALLBACK_FLASHCARDS;
        const done = known ? cardsLeft <= 0 : quizMastered;
        if (seen > 0) started = true;
        if (!done) {
          const deckHref = pageHref(deck, specInfo.slug);
          queue.push({
            kind: "flashcards",
            topicId: topic.id,
            unitsRemaining: cardsLeft,
            minutesPerUnit: pace.secondsPerFlashcard / 60,
            divisible: true,
            minChunkUnits: 5,
          });
          meta.push({
            ...base,
            href: withGroup ? `${deckHref}?grupo=${encodeURIComponent(groupParam)}` : deckHref,
            pageId: deck.id,
            unitsTotal: known ? size : FALLBACK_FLASHCARDS,
          });
        }
      }
    }

    // MEDVOICE — its real length; scheduled only in the foundation phase (the
    // schedule leaves it out on days closer to the exam).
    // Once today is past that phase it will never be scheduled again, so it is
    // not counted as pending either.
    if (phase === "foundation" && allowedTypes.has("audio")) {
      const mv = topicRows.find((c) => c.resource_type === "medvoice");
      const audioPage = mv?.page_id != null ? pageById.get(mv.page_id) ?? null : null;
      if (audioPage) {
        hasMaterial = true;
        const lessonId = lessonIdOfLink(mv?.question_filter);
        const info = lessonId != null ? catalog?.medvoiceLessons.get(lessonId) : undefined;
        const done = info ? completedLessons.has(lessonId as number) : quizMastered;
        const heard = lessonId != null ? (signals.audioPositions?.get(lessonId) ?? 0) / 60 : 0;
        if ((done && info) || heard > 0) started = true;
        if (!done) {
          const total = info?.durationSeconds ? info.durationSeconds / 60 : settings.medvoiceFallbackMinutes;
          queue.push({
            kind: "audio",
            topicId: topic.id,
            // What is left to hear (the player saves the position), never less than a minute.
            unitsRemaining: Math.max(1, total - Math.min(heard, total)),
            minutesPerUnit: 1,
            divisible: false,
            minChunkUnits: 1,
          });
          const pageLink = pageHref(audioPage, specInfo.slug);
          meta.push({
            ...base,
            href: info && lessonId != null ? `${pageLink}#section-${lessonId}` : pageLink,
            pageId: audioPage.id,
            unitsTotal: Math.round(total),
          });
        }
      }
    }

    if (hasMaterial) {
      topicsInScope++;
      if (queue.length > 0) work.push({ topic, started, acts: queue, metas: meta });
      else if (questionsInRevisao) inReviewTopics++;
    }
  }
  const ordered = [...work.filter((w) => w.started), ...work.filter((w) => !w.started)];
  const queue: WorkActivity[] = ordered.flatMap((w) => w.acts);
  const meta: QueueMeta[] = ordered.flatMap((w) => w.metas);
  for (const w of ordered) pendingTopics.push(w.topic);

  // ── Minutes already studied today (estimated from today's answers) ───────
  const revalidaUpLessonInsights = new Map<number, number>();
  for (const r of catalog?.revalidaUpPages.values() ?? []) revalidaUpLessonInsights.set(r.lessonId, r.insights);
  let doneMinutes =
    todayAttempts.length * pace.minutesPerQuestion +
    ((signals.flashcards?.attemptsToday ?? 0) * pace.secondsPerFlashcard) / 60;
  for (const c of todayCompletions) {
    const insights = revalidaUpLessonInsights.get(c.lesson_id);
    const mv = catalog?.medvoiceLessons.get(c.lesson_id);
    if (insights != null) doneMinutes += insights * pace.minutesPerRevalidaUpInsight;
    else if (mv) doneMinutes += mv.durationSeconds ? mv.durationSeconds / 60 : settings.medvoiceFallbackMinutes;
  }
  // Time spent in the Revisão today. A review session writes no attempt row, so it
  // is read from the schedule (items graded today) minus the items answered today
  // in the players, which grade the schedule too and are already counted above.
  const answeredTodayItems =
    new Set(todayAttempts.map((a) => a.question_id).filter((q) => q != null)).size +
    (signals.flashcards?.attemptsToday ?? 0);
  const reviewOnlyToday = Math.max(0, (signals.reviewedToday ?? 0) - answeredTodayItems);
  doneMinutes += (reviewOnlyToday * settings.reviewSecondsPerItem) / 60;

  // Simulado questions answered since Monday (the study week runs Mon → Sun).
  const weekStartKey = addDaysKey(todayKey, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const simuladoPages = signals.simuladoPageIds;
  const simuladoAnswersThisWeek = simuladoPages
    ? signals.quizAttempts.filter((a) => simuladoPages.has(a.page_id) && toDateKeyBR(a.created_at) >= weekStartKey).length
    : 0;

  const inEarlierDaysOfWeek = (iso: string) => {
    const k = toDateKeyBR(iso);
    return k >= weekStartKey && k < todayKey;
  };
  const studiedEarlierThisWeek =
    signals.quizAttempts.some((a) => inEarlierDaysOfWeek(a.created_at)) ||
    signals.lessonCompletions.some((c) => inEarlierDaysOfWeek(c.completed_at));

  // A regular mini simulado: its questions at the student's own time per question.
  // It may take at most a share of the week's study time; a student with little
  // time gets one every 2, 3… weeks instead of every week.
  const simuladoMinutes = settings.simuladoQuestions * pace.minutesPerQuestion;
  const weeklyStudyMinutes = dailyMinutes * daysAvailable;
  const simuladoEveryWeeks = weeklyStudyMinutes > 0
    ? Math.max(1, Math.ceil(
        (simuladoMinutes * settings.simuladoDaysPerWeek) / (settings.simuladoMaxWeeklyShare * weeklyStudyMinutes)))
    : 1;

  // ── Schedule: today + every study day until the exam ─────────────────────
  // Only an exam still AHEAD is planned towards. A turma whose exam date has
  // passed (or is today) keeps its daily list, but a forecast "until the exam"
  // would count down to a day that is gone.
  const examDateKey = cohort?.test_date ? cohort.test_date.slice(0, 10) : null;
  const examKey = examDateKey && examDateKey > todayKey ? examDateKey : null;
  // The forecast holds back, on every future day, the share of the day the
  // Revisão takes TODAY (never less than the settings' minimum, never more than
  // the daily review limit) — the same rule the day itself follows, so forecast
  // and execution are computed alike.
  const todayReviewShare = dailyMinutes > 0
    ? (signals.reviewDueToday * settings.reviewSecondsPerItem) / 60 / dailyMinutes
    : 0;
  const futureReviewShare = Math.min(
    Math.max(settings.reviewReserveShare, settings.reviewMaxShare),
    Math.max(settings.reviewReserveShare, todayReviewShare),
  );
  const calendar: DayCalendar = { studyDayMask, pauses: signals.pauses, minutesForDay };
  const scheduleInput: ScheduleInput = {
    todayKey,
    examKey,
    calendar,
    settings,
    intensificationStartDays: prefs.intensification_start_days,
    queue,
    today: {
      reviewDue: signals.reviewDueToday,
      reviewItemCap: prefs.flashcard_daily_cap,
      doneMinutes,
      extraMinutes: Math.max(0, args.extraMinutesToday ?? 0),
      simuladoDoneThisWeekMinutes: simuladoAnswersThisWeek * pace.minutesPerQuestion,
      studiedEarlierThisWeek,
    },
    simuladoEnabled: allowedTypes.has("simulado"),
    simuladoMinutes,
    simuladoEveryWeeks,
    futureReviewShare,
  };
  const sched = simulateSchedule(scheduleInput);
  const today = sched.today;

  // ── Today's list ─────────────────────────────────────────────────────────
  // Each item carries its exact minutes while the list is built; they are turned
  // into whole minutes at the end so the list still adds up to the day's total.
  const minutesOf = (m: number) => m;
  const items: PlanItem[] = [];

  // Revisão first: it is what the day's time is spent on first (and in the
  // final stretch it outranks everything). Not gated by the content types —
  // review keeps already-studied content fresh.
  if (today.reviewItems > 0) {
    const due = signals.reviewDueToday;
    const cap = prefs.flashcard_daily_cap;
    items.push({
      kind: "flashcards",
      title: `${today.reviewItems} ${today.reviewItems === 1 ? "item" : "itens"} para revisar`,
      subtitle: today.reviewItems >= due
        ? "Repetição espaçada · SM-2"
        : cap != null && cap <= today.reviewItems
          ? `${due} devidos · limite diário: ${cap}`
          : `${due} devidos · ${today.reviewItems} cabem no tempo de hoje`,
      href: "/app/revisao",
      estimatedMinutes: minutesOf(today.reviewMinutes),
      iconHint: "flashcards",
      reason: phase === "taper"
        ? "Reta final — revisão é prioridade"
        : "Itens devidos hoje pelo algoritmo SM-2",
    });
  }

  for (const chunk of today.chunks) {
    const act = queue[chunk.index];
    const m = meta[chunk.index];
    const topic = m.topic;
    const common = {
      title: topic.name,
      href: m.href,
      estimatedMinutes: minutesOf(chunk.minutes),
      specialtyId: topic.specialty_id as number,
      pageId: m.pageId,
      topicId: topic.id,
      units: chunk.units,
    };
    if (act.kind === "quiz") {
      const units = Math.round(chunk.units);
      const total = m.unitsTotal;
      const answered = Math.min(m.progress?.answered ?? 0, total);
      const inProgress = answered > 0;
      const accuracyPct = inProgress ? Math.round(((m.progress?.correct ?? 0) / (m.progress?.answered ?? 1)) * 100) : 0;
      const tierLabel = topic.priority_tier ? `prioridade ${topic.priority_tier}` : "tema";
      // Only part of what is left fits today → say how many.
      const todayNote = chunk.completes ? "" : ` · ${units} hoje`;
      items.push({
        ...common,
        kind: "quiz",
        iconHint: "quiz",
        subtitle: m.redo
          ? `${m.specName} · ${accuracyPct}% de acerto · revise os erros${todayNote}`
          : inProgress
            ? `${m.specName} · ${answered} de ${total} questões${todayNote}`
            : chunk.completes
              ? `${m.specName} · ${tierLabel} · ${topic.incidence_count} no exame`
              : `${m.specName} · ${units} de ${total} questões hoje`,
        reason: m.redo
          ? `Você respondeu tudo, mas ainda está em ${accuracyPct}% — refaça para fixar`
          : inProgress
            ? "Retome de onde parou neste tema"
            : m.gapWeight >= 0.5
              ? "Você tem errado por conteúdo aqui — reforce este tema"
              : m.weakness > 0.5
                ? "Ponto fraco + alta incidência no Revalida"
                : topic.priority_tier === "A"
                  ? "Tema de altíssima incidência no Revalida"
                  : "Próximo tema por incidência no exame",
      });
    } else if (act.kind === "revalida_up") {
      items.push({
        ...common,
        kind: "revalida_up",
        iconHint: "revalida_up",
        subtitle: `${m.specName} · Revalida Up${chunk.completes ? "" : " · comece hoje"}`,
        reason: "Veja como o tema cai na prova",
      });
    } else if (act.kind === "flashcards") {
      const units = Math.round(chunk.units);
      items.push({
        ...common,
        kind: "flashcards",
        iconHint: "flashcards",
        subtitle: `${m.specName} · flashcards · ${units} ${units === 1 ? "cartão" : "cartões"}${chunk.completes ? "" : " hoje"}`,
        reason: "Memorize os pontos-chave do tema",
      });
    } else {
      items.push({
        ...common,
        kind: "audio",
        iconHint: "audio",
        subtitle: `${m.specName} · áudio${chunk.completes ? "" : " · comece hoje"}`,
        reason: "Reforço em áudio para o tema de hoje",
      });
    }
  }

  // Mini simulado — the regular 25-question ones under Questões › Simulados
  // (never a MedHelp 60D Simulado 100Q), inside the day's time. Answers already
  // enroll into SM-2 via /api/quiz-attempt.
  if (today.simuladoMinutes >= 1) {
    const weekly = settings.simuladoDaysPerWeek < 7;
    items.push({
      kind: "simulado",
      title: weekly || simuladoEveryWeeks > 1 ? "Mini simulado da semana" : "Mini simulado do dia",
      subtitle: today.simuladoPartial
        ? `${settings.simuladoQuestions} questões · continue no próximo dia de estudo`
        : `${settings.simuladoQuestions} questões · escolha um mini simulado`,
      href: "/app/estudo-por-questoes?tab=simulados",
      estimatedMinutes: minutesOf(today.simuladoMinutes),
      iconHint: "simulado",
      reason: phase === "taper"
        ? "Reta final — simule as condições da prova"
        : "Ganhe volume e ritmo de prova",
    });
  }

  // The MedHelp 60D materials (Fórmula MedHelp, MemoreCards, Simulados 100Q) are
  // deliberately NOT scheduled here: they will have their own schedule on the 60D
  // page (Karina 2026-11-17), so two programmings never compete for the same day.

  wholeMinutes(items);

  // ── Forecast: what is expected before the exam ───────────────────────────
  let forecast: PlanForecast | null = null;
  if (examKey) {
    const expectedCount = (r: ScheduleResult) =>
      pendingTopics.reduce((n, t) => n + (r.topicFinishDay.has(t.id) ? 1 : 0), 0);
    const expected = expectedCount(sched);
    const hints: ForecastHint[] = [];
    if (expected < pendingTopics.length) {
      // What would widen the coverage: the SAME schedule, re-run with more time.
      const variant = (cal: DayCalendar) =>
        simulateSchedule({ ...scheduleInput, calendar: cal, today: { ...scheduleInput.today, extraMinutes: 0 } });
      const steps: Extract<ForecastHint, { kind: "minutes" }>[] = [];
      for (const extra of EXTRA_MINUTES_LADDER) {
        const n = expectedCount(variant({ ...calendar, minutesForDay: (d) => minutesForDay(d) + extra }));
        if (n <= expected) continue;
        const coversAll = n >= pendingTopics.length;
        steps.push({ kind: "minutes", extraMinutesPerDay: extra, expectedTopics: n, coversAll });
        if (coversAll) break;
      }
      // The smallest step that covers everything; failing that, a realistic one (+30 min).
      const minutesHint =
        steps.find((h) => h.coversAll) ?? steps.find((h) => h.extraMinutesPerDay === 30) ?? steps[steps.length - 1];
      if (minutesHint) hints.push(minutesHint);
      // One more study day a week (Saturday first, then Sunday, then the first free weekday).
      const freeDay = [6, 0, 1, 2, 3, 4, 5].find(
        (d) => (studyDayMask & (1 << d)) === 0 && (prefs.recurring_off_days & (1 << d)) === 0,
      );
      if (freeDay != null) {
        const n = expectedCount(variant({ ...calendar, studyDayMask: studyDayMask | (1 << freeDay) }));
        if (n > expected) {
          hints.push({ kind: "day", dayName: DAY_NAMES_PT[freeDay], expectedTopics: n, coversAll: n >= pendingTopics.length });
        }
      }
    }
    forecast = {
      pendingTopics: pendingTopics.length,
      expectedTopics: expected,
      notExpected: pendingTopics
        .filter((t) => !sched.topicFinishDay.has(t.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          specialtyName: specialtyById.get(t.specialty_id as number)?.name ?? "",
          tier: t.priority_tier,
        })),
      completedTopics: topicsInScope - pendingTopics.length - inReviewTopics,
      partialTopics: pendingTopics.reduce(
        (n, t) => n + (sched.topicsTouched.has(t.id) && !sched.topicFinishDay.has(t.id) ? 1 : 0), 0),
      inReviewTopics,
      studyDaysLeft: sched.studyDaysLeft,
      minutesPerStudyDay: dailyMinutes,
      pendingMinutes: Math.round(sched.pendingMinutes),
      capacityMinutes: Math.round(sched.capacityMinutes),
      scheduledMinutes: Math.round(sched.scheduledMinutes),
      finishDay: sched.finishDay,
      hints,
      scope: {
        countedTypes: FORECAST_TYPES.filter((t) => allowedTypes.has(t)),
        audioLeftOutTopics: sched.audioLeftOut.size,
        excludedSpecialties: prefs.excluded_specialty_ids.length,
      },
    };
  }

  const weakestSpecialties = (paused
    ? allRanked.slice().sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    : ranked
  ).slice(0, 5).map((r) => ({ id: r.id, name: r.name, accuracy: r.accuracy, attempts: r.attempts }));

  return {
    phase,
    daysToExam,
    intensity: effectiveIntensity,
    baseIntensity: prefs.intensity,
    intensitySpec: paused ? spec : effectiveSpec,
    items: paused ? [] : items,
    totalEstimatedMinutes: paused ? 0 : items.reduce((sum, it) => sum + it.estimatedMinutes, 0),
    weakestSpecialties,
    paused,
    pauseReason,
    nextAvailableDate,
    progressToday,
    coverageWarning,
    todayBudgetMinutes: paused ? 0 : Math.round(today.budgetMinutes),
    todayDoneMinutes: Math.round(doneMinutes),
    // The day's time is used up while work remains — as opposed to "nothing left to study".
    dayComplete: !paused && today.isStudyDay && items.length === 0 && (queue.length > 0 || signals.reviewDueToday > 0),
    pace,
    forecast,
    scheduleDays: sched.days,
  };
}

/**
 * Exact minutes → whole minutes, in place, keeping the SUM equal to the rounded
 * total (largest remainder). Rounding each item on its own drifts: twelve items
 * of 2.5 min would show 36 min on a 30-minute day. No item shows less than 1.
 */
function wholeMinutes(items: PlanItem[]): void {
  const exact = items.map((it) => it.estimatedMinutes);
  const target = Math.round(exact.reduce((s, m) => s + m, 0));
  const floors = exact.map((m) => Math.floor(m));
  let missing = target - floors.reduce((s, m) => s + m, 0);
  const byRemainder = exact
    .map((m, i) => ({ i, r: m - Math.floor(m) }))
    .sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    floors[i]++;
    missing--;
  }
  items.forEach((it, i) => { it.estimatedMinutes = Math.max(1, floors[i]); });
}

/** topic_content.question_filter of a MedVoice link → the lesson it points at. */
function lessonIdOfLink(filter: unknown): number | null {
  if (!filter || typeof filter !== "object") return null;
  const n = Number((filter as { lesson_id?: unknown }).lesson_id);
  return Number.isFinite(n) && n > 0 ? n : null;
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
