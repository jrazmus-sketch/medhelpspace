/**
 * Meu Plano — the schedule (Karina 2026-11-17).
 *
 * PURE module. Given the ordered work still to do and the student's calendar, it
 * fills every study day from TODAY to the eve of the exam by MINUTES:
 *
 *   day's time  →  Revisão first  →  the week's mini simulado (last 60 days)
 *               →  new content, in priority order, until the day is full
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
    /** Minutes of simulado already done since Monday (so the week's simulado is not asked twice). */
    simuladoDoneThisWeekMinutes: number;
    /**
     * The student already studied on an earlier day of this week. A simulado not
     * done on its day is offered again later in the week ONLY when that day was
     * missed altogether — a student who studied and skipped it is not chased with
     * it day after day.
     */
    studiedEarlierThisWeek: boolean;
  };
  simuladoEnabled: boolean;
  /** One mini simulado in minutes (its questions × the student's time per question). */
  simuladoMinutes: number;
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
  simuladoMinutes: number;
  /** The simulado continues from / into another day (the day is shorter than one simulado). */
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
  // Start on the Monday of this week: the week's simulado belongs to the first
  // study day(s) of the week. A missed day does not lose it (see
  // today.studiedEarlierThisWeek) and one already done is not asked for again.
  const startKey = mondayOf(todayKey);

  let simCarry = 0;
  let simDaysThisWeek = 0;
  let studyDaysLeft = 0;
  let capacityMinutes = 0;
  let finishDay: string | null = null;
  const days: ScheduledDay[] = [];

  let today: TodaySchedule = {
    isStudyDay: false,
    phase: phaseForDay(todayKey, examKey, input.intensificationStartDays),
    budgetMinutes: 0, doneMinutes: input.today.doneMinutes,
    reviewItems: 0, reviewMinutes: 0, simuladoMinutes: 0, simuladoPartial: false,
    chunks: [], plannedMinutes: 0,
  };

  const closeTopic = (i: number, dayKey: string) => {
    const t = queue[i].topicId;
    const left = (openPerTopic.get(t) ?? 1) - 1;
    openPerTopic.set(t, left);
    if (left <= 0) topicFinishDay.set(t, dayKey);
  };

  for (let dayKey = startKey; dayKey <= lastKey; dayKey = addDaysKey(dayKey, 1)) {
    if (dayOfWeekForKey(dayKey) === 1) {
      // New study week: what was not done last week is not carried over.
      simCarry = 0;
      simDaysThisWeek = 0;
    }
    const isToday = dayKey === todayKey;
    const past = dayKey < todayKey;
    if (!isStudyDay(dayKey, calendar)) continue;

    const phase = phaseForDay(dayKey, examKey, input.intensificationStartDays);
    const simuladoPhase =
      input.simuladoEnabled && settings.simuladoDaysPerWeek > 0 && phase !== "foundation" &&
      isSimuladoWeek(dayKey, examKey, input.simuladoEveryWeeks);
    let accruedToday = 0;
    if (simuladoPhase && simDaysThisWeek < settings.simuladoDaysPerWeek) {
      simCarry += input.simuladoMinutes;
      accruedToday = input.simuladoMinutes;
      simDaysThisWeek++;
    }
    if (past) continue; // earlier this week: only what is owed matters
    if (isToday) {
      if (input.today.studiedEarlierThisWeek) simCarry = accruedToday;
      simCarry = Math.max(0, simCarry - Math.max(0, input.today.simuladoDoneThisWeekMinutes));
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

    // ── Simulado: the first N study days of each week, last 60 days ────────
    let simMinutes = 0;
    let simPartial = false;
    if (simuladoPhase && simCarry > EPS) {
      // At most one simulado a day; a day shorter than one takes what fits and
      // the rest stays owed for the next study day.
      const want = Math.min(simCarry, input.simuladoMinutes);
      simMinutes = Math.min(want, avail);
      simPartial = simMinutes + EPS < want;
      simCarry -= simMinutes;
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
        closeTopic(j, dayKey);
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
        simuladoMinutes: simMinutes, simuladoPartial: simPartial,
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
