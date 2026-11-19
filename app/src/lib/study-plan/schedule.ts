/**
 * Meu Plano — the schedule (Karina 2026-11-17).
 *
 * PURE module. Given the ordered work still to do and the student's calendar, it
 * fills every study day from TODAY to the eve of the exam by MINUTES:
 *
 *   day's time  →  Revisão first  →  the mini simulado
 *               →  new content, in priority order, until the day is full
 *
 * Mini simulados (Karina 2026-11-17, second round). A session is 25 questions; the
 * week's sessions are spread over its study days, and one that does not fit a day
 * is CONTINUED on the next study days (the player reopens on the first unanswered
 * question). A mini simulado already begun is always finished first, and one begun
 * in an earlier week takes the place of the new week's first session — so it is
 * never lost and never programmed twice.
 *
 * Third round (Karina 2026-11-17, 23h06):
 *   - the regular mini simulados are scheduled through the WHOLE preparation, not
 *     only in the last 60 days — that window belongs to the MedHelp 60D;
 *   - a NEW session is only opened when it can be finished in the study time left
 *     before the exam (a session begun on the eve was left half-way in the tests).
 *     The time goes to activities that fit; the student stays free in the library.
 *     A session already begun is always continued;
 *   - a mini simulado left for more than 7 days is still offered ("continuar ou
 *     escolher outro"): that day opens no second session next to it.
 *
 * The MedHelp 60D materials (Fórmula MedHelp, MemoreCards, Simulados 100Q) are NOT
 * scheduled here: they will have their own schedule on the 60D page (Karina
 * 2026-11-17), so that two programmings never compete for the same day.
 *
 * The same loop produces both things the student sees:
 *   - today's list (day 0, with the REAL review queue and what was already done today);
 *   - the forecast: which topics are expected before the exam and which are not
 *     (future days hold back a share of the time for reviews that do not exist yet).
 *
 * Nothing here is stored. The schedule is re-derived on every load from what the
 * student actually did, so a missed day, a changed availability or a new exam date
 * simply produces a new forecast — progress is never lost because it never lived here.
 *
 * Invariant (tested): the minutes placed on a day never exceed that day's time.
 */

import { addDaysKey, dayOfWeekForKey, diffDaysKey } from "@/lib/br-date";
import type { PlanSettings } from "./settings";

export type Phase = "foundation" | "intensification" | "taper";
export type WorkKind = "quiz" | "revalida_up" | "flashcards" | "audio";

/** One material of one topic that is not finished yet. */
export type WorkActivity = {
  kind: WorkKind;
  topicId: number;
  /** Units still to do (questions, cards, 1 Revalida Up page, minutes of audio). */
  unitsRemaining: number;
  minutesPerUnit: number;
  /**
   * true  → may be cut anywhere (questions, cards): a day takes as many units as fit.
   * false → better done in one sitting (a Revalida Up page, an audio): it waits for
   *         the next day unless it is the first thing of the day.
   */
  divisible: boolean;
  /**
   * An audio that is the ONLY material its topic has in the plan. When the schedule leaves it out (MedVoice is
   * placed only in the foundation phase), the topic is NOT concluded: it stays "não previsto até a prova".
   */
  soleMaterial?: boolean;
  /** Smallest piece (in units) worth putting on a day. */
  minChunkUnits: number;
};

export type ScheduledChunk = {
  /** Index into the `queue` passed in. */
  index: number;
  units: number;
  minutes: number;
  /** The activity ends with this chunk. */
  completes: boolean;
};

export type DayCalendar = {
  /** Bitmask bit0=Sun..bit6=Sat of the days the student studies (recurring off-days already removed). */
  studyDayMask: number;
  pauses: { pause_from: string; pause_until: string }[];
  /** Minutes available on a given study day (temp intensity may change it for a range). */
  minutesForDay: (dayKey: string) => number;
};

export type ScheduleInput = {
  todayKey: string;
  /** YYYY-MM-DD of the exam, or null (no forecast: only today is scheduled). */
  examKey: string | null;
  calendar: DayCalendar;
  settings: PlanSettings;
  intensificationStartDays: number;
  queue: WorkActivity[];
  today: {
    /** Items due in the Revisão right now. */
    reviewDue: number;
    /** Student's own daily cap on review items, if any. */
    reviewItemCap: number | null;
    /** Minutes of study already done today (estimated from today's answers). */
    doneMinutes: number;
    /** Extra minutes the student asked for ("adiantar"). */
    extraMinutes: number;
    /**
     * The latest EARLIER day of this week on which the student studied without
     * answering any simulado (null = none). Sessions that fell up to that day and
     * were not begun are dropped: a student who studied and skipped a session is
     * not chased with it day after day. A session stays owed when its day was
     * missed altogether, or when the plan itself postponed it (the day went to
     * finishing the mini simulado in progress — that day has simulado answers).
     */
    simuladoSkippedThrough: string | null;
    /**
     * One entry per simulado the student answered this week (today included): the
     * day of its first answer this week, and whether that sitting was begun in an
     * EARLIER week. Each one takes up a session of the week, so it is not asked again.
     */
    simuladoTouches: { dayKey: string; carried: boolean }[];
    /** Minutes left of the mini simulado the student is in the middle of (0 = none). */
    simuladoResumeMinutes: number;
    /** That mini simulado was begun in an EARLIER week: it stands in for this week's first session. */
    simuladoResumeCarried: boolean;
    /**
     * It was left for more than 7 days: the plan offers "continue it or pick
     * another", so no NEW session is opened next to it today (never two at once).
     */
    simuladoResumeStale?: boolean;
  };
  simuladoEnabled: boolean;
  /**
   * Days on which no NEW mini simulado session is opened: the MedHelp 60D weeks that hold a Simulado 100Q
   * (Karina 2026-11-17: never two simulados in the same week). One already begun is still continued.
   */
  noNewSimuladoOn?: (dayKey: string) => boolean;
  /** One mini simulado in minutes (its questions × the student's time per question). */
  simuladoMinutes: number;
  /** Sessions in a simulado week: the student's choice, or the settings' value in the automatic mode. */
  simuladoSessionsPerWeek: number;
  /** A simulado week every N weeks (1 = every week), counted back from the exam week. */
  simuladoEveryWeeks: number;
  /**
   * Share of every FUTURE day held back for reviews. derive.ts passes the larger
   * of the settings' minimum and the student's review load of today (capped at
   * the daily review limit) — the same rule the day itself follows.
   */
  futureReviewShare: number;
};

export type TodaySchedule = {
  isStudyDay: boolean;
  phase: Phase;
  /** The day's time, and how much of it is already used by what was done today. */
  budgetMinutes: number;
  doneMinutes: number;
  reviewItems: number;
  reviewMinutes: number;
  /** Simulado minutes placed on today (resume + new). Always whole questions. */
  simuladoMinutes: number;
  /** Of those, the part that continues the mini simulado already in progress. */
  simuladoResumeMinutes: number;
  /** Simulado still owed after today's part (it continues on the next study day). */
  simuladoPartial: boolean;
  chunks: ScheduledChunk[];
  /** Everything placed on today, in minutes. Never above budget − done (+ extra). */
  plannedMinutes: number;
};

export type ScheduleResult = {
  today: TodaySchedule;
  /** topicId → day (YYYY-MM-DD) on which its last scheduled material ends. Absent = not expected before the exam. */
  topicFinishDay: Map<number, string>;
  /** Topics whose audio was left out because MedVoice is only scheduled more than N days before the exam. */
  audioLeftOut: Set<number>;
  studyDaysLeft: number;
  /** Minutes of new content that fit before the exam / still to do / actually placed. */
  capacityMinutes: number;
  pendingMinutes: number;
  scheduledMinutes: number;
  /** Topics with at least one activity placed before the exam (finished or not). */
  topicsTouched: Set<number>;
  /** Day the whole queue ends, when it does. */
  finishDay: string | null;
  /** Every study day from today on, with what was placed on it (minutes). For checks and reports. */
  days: ScheduledDay[];
};

export type ScheduledDay = {
  key: string;
  phase: Phase;
  /** Time available that day (today: what is left of it, plus any "adiantar"). */
  available: number;
  review: number;
  simulado: number;
  content: number;
};

const EPS = 0.01;
/** How far past the first unfinished activity a day may look for something that still fits. */
const LOOKAHEAD = 12;
/** A one-sitting item is only started (to be continued) when at least this much of the day is left. */
const MIN_START_MINUTES = 5;
/** On the day a mini simulado is finished, a NEW one is only begun when at least this many questions fit. */
const MIN_NEW_SIMULADO_QUESTIONS = 5;

export function phaseForDay(dayKey: string, examKey: string | null, intensificationStartDays: number): Phase {
  if (!examKey) return "foundation";
  const daysToExam = Math.max(0, diffDaysKey(dayKey, examKey));
  if (daysToExam <= 14) return "taper";
  if (daysToExam <= intensificationStartDays) return "intensification";
  return "foundation";
}

export function isStudyDay(dayKey: string, calendar: DayCalendar): boolean {
  if ((calendar.studyDayMask & (1 << dayOfWeekForKey(dayKey))) === 0) return false;
  return !calendar.pauses.some((p) => p.pause_from <= dayKey && p.pause_until >= dayKey);
}

/** Monday of the week `dayKey` falls in (the study week runs Monday → Sunday). */
function mondayOf(dayKey: string): string {
  const dow = dayOfWeekForKey(dayKey); // 0=Sun
  return addDaysKey(dayKey, dow === 0 ? -6 : 1 - dow);
}

/** With "every N weeks", the simulado weeks are counted back from the exam week (N = 1: every week). */
function isSimuladoWeek(dayKey: string, examKey: string | null, everyWeeks: number): boolean {
  if (everyWeeks <= 1 || !examKey) return true;
  const weeksToExam = Math.round(diffDaysKey(mondayOf(dayKey), mondayOf(examKey)) / 7);
  return weeksToExam >= 0 && weeksToExam % everyWeeks === 0;
}

function bitCount(mask: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) n++;
  return n;
}

export function simulateSchedule(input: ScheduleInput): ScheduleResult {
  const { todayKey, examKey, calendar, settings, queue } = input;
  const remaining = queue.map((a) => Math.max(0, a.unitsRemaining));
  const openPerTopic = new Map<number, number>();
  queue.forEach((a, i) => {
    if (remaining[i] > EPS) openPerTopic.set(a.topicId, (openPerTopic.get(a.topicId) ?? 0) + 1);
  });
  const pendingMinutes = queue.reduce((s, a, i) => s + remaining[i] * a.minutesPerUnit, 0);

  const topicFinishDay = new Map<number, string>();
  const topicsTouched = new Set<number>();
  let scheduledMinutes = 0;
  const audioLeftOut = new Set<number>();
  let idx = 0;
  while (idx < queue.length && remaining[idx] <= EPS) idx++;

  // The exam day itself is not a study day. Without an exam date only today is scheduled.
  // (An exam today or in the past still schedules today.)
  const eve = examKey ? addDaysKey(examKey, -1) : todayKey;
  const lastKey = eve < todayKey ? todayKey : eve;
  // Start on the Monday of this week: the week's sessions are spread over its
  // study days. A missed day does not lose a session (see
  // today.simuladoSkippedThrough) and one already taken up is not asked for again.
  const startKey = mondayOf(todayKey);

  // ── Mini simulado bookkeeping ────────────────────────────────────────────
  const sessions = Math.max(0, Math.floor(input.simuladoSessionsPerWeek));
  const studyDaysPerWeek = Math.max(1, bitCount(calendar.studyDayMask));
  // Study-day index (0-based, within the week) of each session: 1 → the first
  // study day; 2 → the first and the middle of the week; and so on.
  const sessionSlots = Array.from({ length: sessions }, (_, k) => Math.floor((k * studyDaysPerWeek) / sessions));
  const minutesPerSimQuestion =
    settings.simuladoQuestions > 0 ? input.simuladoMinutes / settings.simuladoQuestions : input.simuladoMinutes;
  // More sessions than study days in a week → more than one may share a day.
  const simPerDayCap = input.simuladoMinutes * Math.max(1, Math.ceil(sessions / studyDaysPerWeek));
  // Room for simulado questions from a day to the eve of the exam: what each study
  // day can hold after the Revisão (whole questions, at most the day's cap). A new
  // session is opened only when it fits in that room on top of what is already owed.
  const simRoomAfter = new Map<string, number>(); // day → room on the study days AFTER it
  {
    let acc = 0;
    for (let k = lastKey; k >= todayKey; k = addDaysKey(k, -1)) {
      simRoomAfter.set(k, acc);
      if (k > todayKey && isStudyDay(k, calendar)) {
        const b = Math.max(0, calendar.minutesForDay(k));
        const afterReview = b - Math.min(b, input.futureReviewShare * b);
        acc += Math.floor(Math.min(afterReview, simPerDayCap) / minutesPerSimQuestion + EPS) * minutesPerSimQuestion;
      }
    }
  }
  const simRoomOn = (availAfterReview: number) =>
    Math.floor(Math.min(Math.max(0, availAfterReview), simPerDayCap) / minutesPerSimQuestion + EPS) * minutesPerSimQuestion;
  let simCarry = 0;
  let studyDayIndex = 0;
  let accruedBefore = 0;
  /** The week's first session fell on a day that still counts (today or a kept earlier day). */
  let firstSlotKept = false;
  const skippedThrough = input.today.simuladoSkippedThrough;
  const keptDay = (dayKey: string) => skippedThrough == null || dayKey > skippedThrough;
  /** A session left unfinished at the end of a (future) week replaces the next week's first one. */
  let substituteNext = false;
  let studyDaysLeft = 0;
  let capacityMinutes = 0;
  let finishDay: string | null = null;
  const days: ScheduledDay[] = [];

  let today: TodaySchedule = {
    isStudyDay: false,
    phase: phaseForDay(todayKey, examKey, input.intensificationStartDays),
    budgetMinutes: 0, doneMinutes: input.today.doneMinutes,
    reviewItems: 0, reviewMinutes: 0, simuladoMinutes: 0, simuladoResumeMinutes: 0, simuladoPartial: false,
    chunks: [], plannedMinutes: 0,
  };

  const closeTopic = (i: number, dayKey: string) => {
    const t = queue[i].topicId;
    const left = (openPerTopic.get(t) ?? 1) - 1;
    openPerTopic.set(t, left);
    if (left <= 0) topicFinishDay.set(t, dayKey);
  };

  for (let dayKey = startKey; dayKey <= lastKey; dayKey = addDaysKey(dayKey, 1)) {
    const isToday = dayKey === todayKey;
    const past = dayKey < todayKey;
    if (dayOfWeekForKey(dayKey) === 1) {
      // New study week. A session still unfinished (it did not fit the days left)
      // is NOT dropped: it continues, in place of the new week's first session.
      studyDayIndex = 0;
      substituteNext = !past && !isToday && simCarry > EPS;
    }
    if (!isStudyDay(dayKey, calendar)) continue;

    const phase = phaseForDay(dayKey, examKey, input.intensificationStartDays);
    // Mini simulados run through the whole preparation (the last-60-days window is
    // the MedHelp 60D's). `simuladoActive`: one may be placed today; `simuladoWeek`:
    // this week opens new sessions.
    const simuladoActive = input.simuladoEnabled && sessions > 0;
    const simuladoWeek = simuladoActive && isSimuladoWeek(dayKey, examKey, input.simuladoEveryWeeks)
      && !(input.noNewSimuladoOn?.(dayKey) ?? false);
    const accruedToday = simuladoWeek ? sessionSlots.filter((slot) => slot === studyDayIndex).length : 0;
    const isFirstSlot = accruedToday > 0 && studyDayIndex === 0;
    studyDayIndex++;
    if (past) {
      // Earlier this week: only what is still owed matters. Sessions up to a day
      // the student studied without touching a simulado were skipped — dropped.
      if (keptDay(dayKey)) {
        accruedBefore += accruedToday;
        if (isFirstSlot) firstSlotKept = true;
      }
      continue;
    }
    let simResumeOwed = 0;
    let simOpenToday = 0; // today: sessions still owed this week (before the room check)
    let simNewToday = 0;  // a future day: sessions falling on it
    if (isToday) {
      // What the plan still asks for, from what the student REALLY did:
      //  - the week's sessions so far (earlier days still kept + today's)…
      //  - …minus every simulado begun this week since the last skipped day (each takes up one);
      //  - the mini simulado in progress is always finished, and one that comes from an
      //    earlier week stands in for this week's first session (also after it is finished).
      // A session the plan postponed (the day went to finishing the one in progress)
      // is therefore still owed on the next study day — never lost.
      const t = input.today;
      if (isFirstSlot) firstSlotKept = true;
      simResumeOwed = simuladoActive ? Math.max(0, t.simuladoResumeMinutes) : 0;
      const begun = t.simuladoTouches.filter((x) => !x.carried && keptDay(x.dayKey)).length;
      const carriedSitting =
        t.simuladoTouches.some((x) => x.carried) || (simResumeOwed > EPS && t.simuladoResumeCarried);
      simOpenToday = Math.max(0, accruedBefore + accruedToday - begun - (carriedSitting && firstSlotKept ? 1 : 0));
      // Left for more than 7 days: today offers "continue it or pick another" — one session, not two.
      if (simResumeOwed > EPS && t.simuladoResumeStale) simOpenToday = 0;
    } else {
      for (let k = 0; k < accruedToday; k++) {
        if (substituteNext) substituteNext = false;
        else simNewToday++;
      }
    }

    const budget = Math.max(0, calendar.minutesForDay(dayKey));
    let avail = isToday
      ? Math.max(0, budget - input.today.doneMinutes) + Math.max(0, input.today.extraMinutes)
      : budget;
    const availableAtStart = avail;
    studyDaysLeft++;

    // ── Revisão first ──────────────────────────────────────────────────────
    let reviewItems = 0;
    let reviewMinutes = 0;
    if (isToday) {
      const secs = settings.reviewSecondsPerItem;
      const capMinutes = phase === "taper" ? avail : Math.min(avail, settings.reviewMaxShare * budget);
      const fit = Math.floor((capMinutes * 60) / secs + EPS);
      reviewItems = Math.max(0, Math.min(input.today.reviewDue, fit, input.today.reviewItemCap ?? Infinity));
      reviewMinutes = (reviewItems * secs) / 60;
    } else {
      reviewMinutes = Math.min(avail, input.futureReviewShare * budget);
    }
    avail -= reviewMinutes;

    // ── Mini simulado ──────────────────────────────────────────────────────
    // New sessions are opened only when they can be finished before the exam: the
    // room is what today and the study days left can hold after the Revisão. What
    // is already begun is always owed (it is continued, never dropped).
    if (simuladoActive) {
      const room = examKey ? simRoomOn(avail) + (simRoomAfter.get(dayKey) ?? 0) : Infinity;
      if (isToday) {
        const fits = Math.max(0, Math.floor((room - simResumeOwed) / input.simuladoMinutes + EPS));
        simCarry = Math.min(simOpenToday, fits) * input.simuladoMinutes + simResumeOwed;
      } else {
        for (let k = 0; k < simNewToday; k++) {
          if (room - simCarry >= input.simuladoMinutes - EPS) simCarry += input.simuladoMinutes;
        }
      }
    }
    let simMinutes = 0;
    let simResumeMinutes = 0;
    let simPartial = false;
    if (simuladoActive && simCarry > EPS) {
      // A day shorter than one simulado takes the whole QUESTIONS that fit; the
      // rest stays owed and continues on the next study day.
      const want = Math.min(simCarry, simPerDayCap);
      let questions = Math.floor(Math.min(want, avail) / minutesPerSimQuestion + EPS);
      if (simResumeOwed > EPS) {
        // Today finishes the one in progress: a new simulado is not opened for a
        // couple of questions — it waits for the next study day.
        const resumeQuestions = Math.min(questions, Math.round(simResumeOwed / minutesPerSimQuestion));
        const newQuestions = questions - resumeQuestions;
        const newOwed = Math.round((simCarry - simResumeOwed) / minutesPerSimQuestion);
        if (newQuestions > 0 && newQuestions < Math.min(MIN_NEW_SIMULADO_QUESTIONS, newOwed)) questions = resumeQuestions;
      }
      simMinutes = Math.min(questions * minutesPerSimQuestion, avail);
      simResumeMinutes = Math.min(simMinutes, simResumeOwed);
      simCarry = Math.max(0, simCarry - simMinutes);
      // Today finished (or continued) the one in progress and opened nothing new: a
      // session still waiting must fit in the days that are left, or it is not asked for.
      if (isToday && examKey && simMinutes - simResumeMinutes <= EPS) {
        const resumeLeft = Math.max(0, simResumeOwed - simResumeMinutes);
        const roomAfter = (simRoomAfter.get(dayKey) ?? 0) - resumeLeft;
        while (simCarry - resumeLeft > EPS && simCarry - resumeLeft > roomAfter + EPS) {
          simCarry = Math.max(resumeLeft, simCarry - input.simuladoMinutes);
        }
      }
      simPartial = simCarry > EPS;
      avail -= simMinutes;
    }

    // ── New content, in order, until the day is full ───────────────────────
    const chunks: ScheduledChunk[] = [];
    capacityMinutes += Math.max(0, avail);
    // What a whole day can hold of new content: a one-sitting item bigger than
    // this can never fit, so it is the only kind that is started and continued.
    const fullDayContent = budget * (1 - input.futureReviewShare);
    for (let j = idx; avail > EPS && j < queue.length && j - idx <= LOOKAHEAD; j++) {
      const act = queue[j];
      if (remaining[j] <= EPS) continue;
      // MedVoice is a foundation-phase material: closer to the exam it is left out.
      if (act.kind === "audio" && phase !== "foundation") {
        audioLeftOut.add(act.topicId);
        remaining[j] = 0;
        // The topic's other materials decide its conclusion — unless this audio is all it has.
        if (!act.soleMaterial) closeTopic(j, dayKey);
        continue;
      }
      const need = remaining[j] * act.minutesPerUnit;
      if (need <= avail + EPS) {
        // Never a hair over the day's time, even by rounding.
        chunks.push({ index: j, units: remaining[j], minutes: Math.min(need, avail), completes: true });
        avail = Math.max(0, avail - need);
        remaining[j] = 0;
        closeTopic(j, dayKey);
        continue;
      }
      if (act.divisible) {
        const units = Math.floor(avail / act.minutesPerUnit + EPS);
        if (units < Math.min(act.minChunkUnits, remaining[j])) continue; // too little left for a piece of this one
        const minutes = Math.min(units * act.minutesPerUnit, avail);
        chunks.push({ index: j, units, minutes, completes: false });
        remaining[j] -= units;
        avail -= minutes;
        continue;
      }
      // Better in one sitting (a Revalida Up page, an audio). It waits for a day
      // it fits in, and the rest of today goes to what comes next — unless no day
      // could ever hold it, in which case it is started now and continued later.
      if (need > fullDayContent + EPS && chunks.length === 0 && avail >= MIN_START_MINUTES) {
        const units = avail / act.minutesPerUnit;
        chunks.push({ index: j, units, minutes: avail, completes: false });
        remaining[j] -= units;
        avail = 0;
      }
    }
    while (idx < queue.length && remaining[idx] <= EPS) idx++;
    if (finishDay == null && idx >= queue.length) finishDay = dayKey;
    const contentMinutes = chunks.reduce((s, c) => s + c.minutes, 0);
    scheduledMinutes += contentMinutes;
    for (const c of chunks) topicsTouched.add(queue[c.index].topicId);
    days.push({
      key: dayKey, phase, available: availableAtStart,
      review: reviewMinutes, simulado: simMinutes, content: contentMinutes,
    });

    if (isToday) {
      today = {
        isStudyDay: true, phase,
        budgetMinutes: budget, doneMinutes: input.today.doneMinutes,
        reviewItems, reviewMinutes,
        simuladoMinutes: simMinutes, simuladoResumeMinutes: simResumeMinutes, simuladoPartial: simPartial,
        chunks,
        plannedMinutes: reviewMinutes + simMinutes + contentMinutes,
      };
    }
  }

  return {
    today, topicFinishDay, audioLeftOut, studyDaysLeft, capacityMinutes, pendingMinutes,
    scheduledMinutes, topicsTouched,
    finishDay: idx >= queue.length ? finishDay : null,
    days,
  };
}
