/**
 * Meu Plano as a time-budgeted schedule with a forecast to the exam (Karina 2026-11-17).
 * Rules under test — each one is hers:
 *   1. a day is filled by MINUTES and never holds more than the student's time;
 *   2. Revisão goes in first (≤ half the day; no limit in the last 14 days);
 *   3. each material finishes on its own evidence — nothing is marked done for the student;
 *   4. the weekly MINI simulado counts INSIDE the day; MedHelp 60D materials are never scheduled;
 *   5. the forecast says what is expected before the exam, what is not, and what would widen it;
 *   6. the plan is re-derived from real progress (nothing stored), so missed days never erase it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { withFrozenTime, MORNING_BRT } from "./helpers/freeze-time";
import {
  derivePlan, defaultPrefs,
  type StudyPlanPrefs, type Signals, type TopicRow, type PageRow, type TopicContentRow, type SpecialtyRow,
} from "@/lib/study-plan/derive";
import { DEFAULT_PLAN_SETTINGS, settingsFromRow, PLAN_SETTING_FIELDS } from "@/lib/study-plan/settings";
import { medianGapSeconds, resolvePace } from "@/lib/study-plan/pace";
import { simulateSchedule, type ScheduleInput, type WorkActivity } from "@/lib/study-plan/schedule";

const S = DEFAULT_PLAN_SETTINGS;
// MORNING_BRT is Tuesday 2026-07-28.
const TODAY = "2026-07-28";

// ── settings ─────────────────────────────────────────────────────────────────

test("settings: the code defaults are the numbers agreed on 2026-11-17", () => {
  assert.equal(S.minutesPerQuestion, 2.5);
  assert.equal(S.secondsPerFlashcard, 30);
  assert.equal(S.minutesPerRevalidaUpInsight, 1.5);
  assert.equal(S.reviewSecondsPerItem, 30);
  assert.equal(S.reviewMaxShare, 0.5);
  assert.equal(S.reviewReserveShare, 0.2);
  assert.equal(S.simuladoQuestions, 25);
  assert.equal(S.simuladoDaysPerWeek, 1);
  assert.equal(S.paceSlowFactor, 1.5);
  assert.equal(S.paceFastFactor, 0.7);
  assert.equal(S.adaptivePaceEnabled, true);
});

test("settings: a row value outside its range falls back to the default (never an absurd plan)", () => {
  const s = settingsFromRow({ minutes_per_question: 0, seconds_per_flashcard: "abc", simulado_questions: 30, adaptive_pace_enabled: false });
  assert.equal(s.minutesPerQuestion, 2.5);
  assert.equal(s.secondsPerFlashcard, 30);
  assert.equal(s.simuladoQuestions, 30);
  assert.equal(s.adaptivePaceEnabled, false);
  assert.deepEqual(settingsFromRow(null), S);
});

test("settings: the patch's column defaults match the code defaults", () => {
  const sql = readFileSync(path.join(process.cwd(), "..", "schema-patch-plano-cobertura.sql"), "utf8");
  for (const f of PLAN_SETTING_FIELDS) {
    const m = sql.match(new RegExp(`${f.column}\\s+\\S+\\s+NOT NULL DEFAULT ([0-9.]+)`));
    assert.ok(m, `column ${f.column} missing from the patch`);
    assert.equal(Number(m![1]), S[f.key], `${f.column} default`);
  }
  assert.match(sql, /adaptive_pace_enabled\s+boolean\s+NOT NULL DEFAULT true/);
});

// ── pace ─────────────────────────────────────────────────────────────────────

const stamps = (n: number, gapS: number) =>
  Array.from({ length: n + 1 }, (_, i) => new Date(Date.parse("2026-07-20T12:00:00Z") + i * gapS * 1000).toISOString());

test("pace: median of the gaps between answers; long pauses are ignored", () => {
  const ts = stamps(40, 60);
  ts.push(new Date(Date.parse(ts[ts.length - 1]) + 3 * 3600 * 1000).toISOString()); // walked away for 3 h
  const g = medianGapSeconds(ts, 10, 900);
  assert.equal(g.medianSeconds, 60);
  assert.equal(g.samples, 40);
});

test("pace: Automático uses the default until there are enough answers, then the student's own pace", () => {
  const few = resolvePace({ mode: "auto", settings: S, question: { medianSeconds: 60, samples: 10 }, flashcard: { medianSeconds: null, samples: 0 } });
  assert.equal(few.source, "default");
  assert.equal(few.minutesPerQuestion, 2.5);
  const enough = resolvePace({ mode: "auto", settings: S, question: { medianSeconds: 90, samples: 30 }, flashcard: { medianSeconds: 12, samples: 40 } });
  assert.equal(enough.source, "learned");
  assert.equal(enough.minutesPerQuestion, 1.5);
  assert.equal(enough.questionsPerHour, 40);
  assert.equal(enough.secondsPerFlashcard, 15, "12 s is below half the default → clamped to 15 s");
});

test("pace: the learned pace is clamped between half and double the default", () => {
  const fast = resolvePace({ mode: "auto", settings: S, question: { medianSeconds: 12, samples: 100 }, flashcard: { medianSeconds: null, samples: 0 } });
  assert.equal(fast.minutesPerQuestion, 1.25);
  const slow = resolvePace({ mode: "auto", settings: S, question: { medianSeconds: 800, samples: 100 }, flashcard: { medianSeconds: null, samples: 0 } });
  assert.equal(slow.minutesPerQuestion, 5);
});

test("pace: manual choices are fixed multiples; the master switch off turns Automático into Padrão", () => {
  const none = { medianSeconds: 60, samples: 100 };
  const slow = resolvePace({ mode: "slow", settings: S, question: none, flashcard: none });
  assert.equal(slow.minutesPerQuestion, 3.75);
  assert.equal(slow.secondsPerFlashcard, 45);
  const fast = resolvePace({ mode: "fast", settings: S, question: none, flashcard: none });
  assert.equal(fast.minutesPerQuestion, 1.75);
  const off = resolvePace({ mode: "auto", settings: { ...S, adaptivePaceEnabled: false }, question: none, flashcard: none });
  assert.equal(off.mode, "standard");
  assert.equal(off.minutesPerQuestion, 2.5);
});

// ── schedule ─────────────────────────────────────────────────────────────────

const quiz = (topicId: number, questions: number): WorkActivity =>
  ({ kind: "quiz", topicId, unitsRemaining: questions, minutesPerUnit: 2.5, divisible: true, minChunkUnits: 1 });
const ru = (topicId: number, minutes: number): WorkActivity =>
  ({ kind: "revalida_up", topicId, unitsRemaining: 1, minutesPerUnit: minutes, divisible: false, minChunkUnits: 1 });
const cards = (topicId: number, n: number): WorkActivity =>
  ({ kind: "flashcards", topicId, unitsRemaining: n, minutesPerUnit: 0.5, divisible: true, minChunkUnits: 5 });
const audio = (topicId: number, minutes: number): WorkActivity =>
  ({ kind: "audio", topicId, unitsRemaining: minutes, minutesPerUnit: 1, divisible: false, minChunkUnits: 1 });

function input(
  over: Omit<Partial<ScheduleInput>, "today"> & { today?: Partial<ScheduleInput["today"]>; minutes?: number; mask?: number },
): ScheduleInput {
  const minutes = over.minutes ?? 60;
  return {
    todayKey: TODAY,
    examKey: "2027-01-15",
    calendar: { studyDayMask: over.mask ?? 127, pauses: [], minutesForDay: () => minutes },
    settings: S,
    intensificationStartDays: 60,
    queue: [],
    simuladoEnabled: true,
    simuladoMinutes: 40,
    simuladoSessionsPerWeek: 1,
    simuladoEveryWeeks: 1,
    futureReviewShare: 0.2,
    ...over,
    today: {
      reviewDue: 0, reviewItemCap: null, doneMinutes: 0, extraMinutes: 0,
      simuladoSkippedThrough: null, simuladoTouches: [], simuladoResumeMinutes: 0, simuladoResumeCarried: false,
      ...(over.today ?? {}),
    },
  };
}

function assertNoDayOverBudget(r: ReturnType<typeof simulateSchedule>) {
  for (const d of r.days) {
    const used = d.review + d.simulado + d.content;
    assert.ok(used <= d.available + 1e-6, `${d.key}: ${used} min placed on a ${d.available}-min day`);
  }
}

test("schedule: no day ever holds more than the student's time (months of mixed work)", () => {
  const queue: WorkActivity[] = [];
  for (let t = 1; t <= 60; t++) queue.push(quiz(t, 3 + (t % 9)), ru(t, 4 + (t % 5)), cards(t, 10 + (t % 30)), audio(t, 5 + (t % 14)));
  for (const minutes of [20, 30, 45, 60, 120]) {
    for (const exam of ["2026-08-20", "2026-10-01", "2027-03-01"]) {
      const r = simulateSchedule(input({ queue, minutes, examKey: exam, today: { reviewDue: 400 } }));
      assertNoDayOverBudget(r);
    }
  }
});

test("schedule: Revisão goes in first and takes at most half the day", () => {
  const r = simulateSchedule(input({ queue: [quiz(1, 40)], today: { reviewDue: 500 }, simuladoEnabled: false }));
  assert.equal(r.today.reviewMinutes, 30, "half of 60 min");
  assert.equal(r.today.reviewItems, 60);
  assert.equal(r.today.chunks[0].minutes, 30, "the rest goes to new content");
});

test("schedule: in the last 14 days the Revisão has no limit", () => {
  const r = simulateSchedule(input({ queue: [quiz(1, 40)], examKey: "2026-08-05", today: { reviewDue: 500 }, simuladoEnabled: false }));
  assert.equal(r.today.phase, "taper");
  assert.equal(r.today.reviewMinutes, 60);
  assert.equal(r.today.chunks.length, 0);
});

test("schedule: the student's own daily review cap is respected", () => {
  const r = simulateSchedule(input({ queue: [quiz(1, 40)], today: { reviewDue: 500, reviewItemCap: 20 } }));
  assert.equal(r.today.reviewItems, 20);
});

test("schedule: every future day holds back the same share for reviews, the last 14 days included", () => {
  const r = simulateSchedule(input({ queue: [quiz(1, 4000)], examKey: "2026-10-30", simuladoEnabled: false }));
  const future = r.days.filter((d) => d.key > TODAY);
  assert.ok(future.some((d) => d.phase === "taper") && future.some((d) => d.phase === "foundation"));
  assert.ok(future.every((d) => d.review === 12), "20% of 60 min on every future day");
  const heavier = simulateSchedule(input({ queue: [quiz(1, 4000)], examKey: "2026-10-30", simuladoEnabled: false, futureReviewShare: 0.4 }));
  assert.ok(heavier.days.filter((d) => d.key > TODAY).every((d) => d.review === 24));
  assert.ok(heavier.capacityMinutes < r.capacityMinutes);
});

test("schedule: a topic bigger than a day continues on the next study day", () => {
  const r = simulateSchedule(input({ queue: [quiz(1, 40)], examKey: null, simuladoEnabled: false }));
  assert.equal(r.today.chunks.length, 1);
  assert.equal(r.today.chunks[0].units, 24, "60 min ÷ 2.5 min");
  assert.equal(r.today.chunks[0].completes, false);
});

test("schedule: a one-sitting item that does not fit waits; the day is filled with what comes next", () => {
  // 20 questions (50 min) leave 10 min: the 12-min Revalida Up waits, the flashcards fill the day.
  const r = simulateSchedule(input({ queue: [quiz(1, 20), ru(1, 12), cards(1, 30)], examKey: null, simuladoEnabled: false }));
  assert.deepEqual(r.today.chunks.map((c) => c.index), [0, 2]);
  assert.equal(r.today.chunks[1].units, 20);
});

test("schedule: a one-sitting item no day could hold is started and continued", () => {
  const r = simulateSchedule(input({ queue: [audio(1, 90)], minutes: 30, examKey: null, simuladoEnabled: false }));
  assert.equal(r.today.chunks.length, 1);
  assert.equal(r.today.chunks[0].minutes, 30);
  assert.equal(r.today.chunks[0].completes, false);
});

test("schedule: what was done today is taken off the day's time; 'adiantar' adds to it", () => {
  const half = simulateSchedule(input({ queue: [quiz(1, 40)], examKey: null, simuladoEnabled: false, today: { doneMinutes: 35 } }));
  assert.equal(half.today.chunks[0].units, 10, "25 min left");
  const done = simulateSchedule(input({ queue: [quiz(1, 40)], examKey: null, simuladoEnabled: false, today: { doneMinutes: 70 } }));
  assert.equal(done.today.chunks.length, 0);
  const extra = simulateSchedule(input({ queue: [quiz(1, 40)], examKey: null, simuladoEnabled: false, today: { doneMinutes: 70, extraMinutes: 30 } }));
  assert.equal(extra.today.chunks[0].units, 12);
});

test("schedule: the weekly mini simulado counts INSIDE the day (last 60 days)", () => {
  // 2026-09-01 exam → 35 days → intensification. Today is Tuesday; the week's simulado is still owed.
  const r = simulateSchedule(input({ queue: [quiz(1, 400)], examKey: "2026-09-01" }));
  assert.equal(r.today.phase, "intensification");
  assert.equal(r.today.simuladoMinutes, 40);
  assert.equal(r.today.chunks[0].minutes, 20);
  assert.ok(r.today.plannedMinutes <= 60 + 1e-6);
  assertNoDayOverBudget(r);
  // One simulado a week: the other days of this week have none.
  const thisWeek = r.days.filter((d) => d.key > TODAY && d.key <= "2026-08-02");
  assert.ok(thisWeek.every((d) => d.simulado === 0));
  assert.equal(r.days.find((d) => d.key === "2026-08-03")!.simulado, 40, "next Monday");
});

test("schedule: a simulado already taken up today is not asked for again", () => {
  const r = simulateSchedule(input({ queue: [quiz(1, 400)], examKey: "2026-09-01", today: { simuladoTouches: [{ dayKey: TODAY, carried: false }] } }));
  assert.equal(r.today.simuladoMinutes, 0);
});

test("schedule: a day shorter than a simulado takes the whole questions that fit and the rest stays owed", () => {
  // 40 min ÷ 25 questions = 1.6 min each. A 30-minute day holds 18 questions (28.8 min); 7 are left (11.2 min).
  const r = simulateSchedule(input({ queue: [], examKey: "2026-09-01", minutes: 30 }));
  assert.ok(Math.abs(r.today.simuladoMinutes - 28.8) < 0.01);
  assert.equal(r.today.simuladoPartial, true);
  assert.ok(Math.abs(r.days[1].simulado - 11.2) < 0.01, "continued on the next study day");
  assert.equal(r.days[2].simulado, 0);
});

test("schedule: the mini simulado is scheduled far from the exam too; never when the student unchecked it", () => {
  // Karina 2026-11-17, 23h06: the regular mini simulados run through the whole preparation
  // (the last-60-days window belongs to the MedHelp 60D). Exam on 2027-01-15, today 2026-07-27.
  const far = simulateSchedule(input({ queue: [quiz(1, 10)] }));
  assert.equal(far.today.phase, "foundation");
  assert.equal(far.today.simuladoMinutes, 40);
  assertNoDayOverBudget(far);
  assert.equal(simulateSchedule(input({ queue: [quiz(1, 10)], simuladoEnabled: false })).today.simuladoMinutes, 0);
  assert.equal(simulateSchedule(input({ queue: [quiz(1, 10)], examKey: "2026-09-01", simuladoEnabled: false })).today.simuladoMinutes, 0);
});

test("schedule: MedVoice is left out on days past the foundation phase, and the topic still closes", () => {
  const r = simulateSchedule(input({ queue: [audio(1, 10), quiz(1, 4)], examKey: "2026-09-01", simuladoEnabled: false }));
  assert.deepEqual(r.today.chunks.map((c) => c.index), [1]);
  assert.ok(r.audioLeftOut.has(1));
  assert.equal(r.topicFinishDay.get(1), TODAY);
});

test("schedule: the forecast marks which topics end before the exam", () => {
  // 3 study days of 60 min before the exam (today + 2); future days keep 48 min for content.
  const queue = [quiz(1, 20), quiz(2, 20), quiz(3, 20), quiz(4, 20), quiz(5, 20)]; // 50 min each
  const r = simulateSchedule(input({ queue, examKey: "2026-07-31", simuladoEnabled: false }));
  assert.equal(r.studyDaysLeft, 3);
  assert.deepEqual([...r.topicFinishDay.keys()], [1, 2, 3]);
  assert.equal(r.finishDay, null);
  // Topic 4 is reached but not finished: partial progress, not "nothing". Topic 5 is not reached.
  assert.deepEqual([...r.topicsTouched], [1, 2, 3, 4]);
  assert.equal(r.scheduledMinutes, 60 + 47.5 + 47.5);
});

test("schedule: non-study days and pauses are skipped", () => {
  const r = simulateSchedule(input({
    queue: [quiz(1, 4000)], examKey: "2026-08-11", mask: 0b0111110, // Mon–Fri
    calendar: { studyDayMask: 0b0111110, pauses: [{ pause_from: "2026-08-03", pause_until: "2026-08-07" }], minutesForDay: () => 60 },
  }));
  assert.ok(r.days.every((d) => d.key < "2026-08-01" || d.key > "2026-08-09" || d.key === "2026-08-10"));
  assert.equal(r.studyDaysLeft, 5, "Tue–Fri this week + Monday the 10th");
});

// ── derivePlan ───────────────────────────────────────────────────────────────

const SPECIALTIES: SpecialtyRow[] = [{ id: 1, name: "Cardiologia", slug: "cardiologia" }];
const N = 6;
const PAGES: PageRow[] = [];
const TOPICS: TopicRow[] = [];
const CONTENT: TopicContentRow[] = [];
for (let i = 1; i <= N; i++) {
  PAGES.push({ id: 100 + i, slug: `q${i}`, title: `Q${i}`, type: "h5p-quiz", specialty_id: 1, track_id: null, content_module_id: null, view: "quiz" });
  PAGES.push({ id: 300 + i, slug: `ru${i}`, title: `RU${i}`, type: "plain-content", specialty_id: 1, track_id: null, content_module_id: null, view: "revalida-up" });
  TOPICS.push({ id: i, name: `Tema${i}`, slug: `t${i}`, specialty_id: 1, source_page_id: 100 + i, incidence_count: 100 - i, priority_tier: "A", is_pinned: false });
  CONTENT.push({ topic_id: i, resource_type: "quiz", page_id: 100 + i, question_filter: null });
  CONTENT.push({ topic_id: i, resource_type: "revalida_up", page_id: 300 + i, question_filter: null });
  CONTENT.push({ topic_id: i, resource_type: "flashcards", page_id: 500, question_filter: { group_label: `Tema${i}` }, flashcard_group_id: 900 + i });
  CONTENT.push({ topic_id: i, resource_type: "medvoice", page_id: 600, question_filter: { lesson_id: String(700 + i) } });
}
PAGES.push({ id: 500, slug: "cardiologia-flashcards", title: "Flashcards", type: "h5p-quiz", specialty_id: 1, track_id: 3, content_module_id: null, view: "quiz" });
PAGES.push({ id: 600, slug: "cardiologia-medvoice", title: "MedVoice", type: "text-lesson", specialty_id: 1, track_id: 1, content_module_id: null, view: null });

const CATALOG: NonNullable<Signals["catalog"]> = {
  flashcardGroupSizes: new Map(Array.from({ length: N }, (_, i) => [901 + i, 20])),
  revalidaUpPages: new Map(Array.from({ length: N }, (_, i) => [301 + i, { lessonId: 801 + i, insights: 4 }])),
  medvoiceLessons: new Map(Array.from({ length: N }, (_, i) => [701 + i, { durationSeconds: 600 }])),
};
const answers = (topic: number, n: number, right = n) => Array.from({ length: n }, (_, q) => ({
  specialty_id: 1, is_correct: q < right, created_at: "2026-07-20T10:00:00Z", page_id: 100 + topic, question_id: topic * 100 + q,
}));

// These tests are not about mini simulados. Since 2026-11-17 (Karina, 23h06) the plan schedules them through the
// whole preparation, so the fixture says explicitly that the student did not select them.
const NO_SIMULADO = { preferred_content_types: defaultPrefs().preferred_content_types.filter((t) => t !== "simulado") };
const WITH_SIMULADO = { preferred_content_types: defaultPrefs().preferred_content_types };
function plan(over: {
  prefs?: Partial<StudyPlanPrefs>; signals?: Partial<Signals>; testDate?: string | null; extra?: number;
} = {}) {
  return withFrozenTime(MORNING_BRT, () => derivePlan({
    prefs: { ...defaultPrefs(), ...NO_SIMULADO, pace_mode: "standard", ...over.prefs },
    cohort: { test_date: over.testDate === undefined ? "2027-01-15" : over.testDate },
    specialties: SPECIALTIES, pages: PAGES, topics: TOPICS, topicContent: CONTENT,
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0, lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map(Array.from({ length: N }, (_, i) => [101 + i, 10])),
      catalog: CATALOG,
      flashcards: { seenByGroup: new Map(), paceSeconds: null, paceSamples: 0, attemptsToday: 0 },
      ...over.signals,
    },
    extraMinutesToday: over.extra,
  }));
}
const kindsOf = (p: ReturnType<typeof plan>, title: string) => p.items.filter((i) => i.title === title).map((i) => i.kind);

test("plan: today's list adds up to the day's time, with real minutes per material", () => {
  const p = plan();
  // Tema1: 10 questions (25) + Revalida Up 4 insights (6) + 20 cards (10) + audio (10) = 51; then Tema2's first 3 questions.
  assert.deepEqual(kindsOf(p, "Tema1"), ["quiz", "revalida_up", "flashcards", "audio"]);
  assert.deepEqual(p.items.filter((i) => i.title === "Tema1").map((i) => i.estimatedMinutes), [25, 6, 10, 10]);
  assert.ok(p.totalEstimatedMinutes <= p.todayBudgetMinutes);
  assert.equal(p.totalEstimatedMinutes, p.items.reduce((s, i) => s + i.estimatedMinutes, 0));
  assert.equal(p.todayBudgetMinutes, 60);
});

test("plan: mastering the questions does NOT finish the topic — unseen Flashcards and Revalida Up stay", () => {
  const p = plan({ signals: { quizAttempts: answers(1, 10) } });
  assert.deepEqual(kindsOf(p, "Tema1"), ["revalida_up", "flashcards", "audio"], "no question item, the rest still recommended");
});

test("plan: each material leaves on its own evidence; the topic leaves when all are done", () => {
  const done = {
    quizAttempts: answers(1, 10),
    lessonCompletions: [
      { lesson_id: 801, page_id: 301, completed_at: "2026-07-20T10:00:00Z" }, // Revalida Up page concluded
      { lesson_id: 701, page_id: 600, completed_at: "2026-07-20T10:00:00Z" }, // MedVoice lesson concluded
    ],
  };
  const almost = plan({ signals: { ...done, flashcards: { seenByGroup: new Map([[901, 12]]), paceSeconds: null, paceSamples: 0, attemptsToday: 0 } } });
  assert.deepEqual(kindsOf(almost, "Tema1"), ["flashcards"]);
  assert.match(almost.items.find((i) => i.title === "Tema1")!.subtitle, /8 cartões/, "only the 8 cards not seen yet");
  const all = plan({ signals: { ...done, flashcards: { seenByGroup: new Map([[901, 20]]), paceSeconds: null, paceSamples: 0, attemptsToday: 0 } } });
  assert.deepEqual(kindsOf(all, "Tema1"), []);
  assert.equal(all.forecast!.completedTopics, 1);
  assert.equal(all.forecast!.pendingTopics, N - 1);
});

test("plan: a material the student unchecked is neither scheduled nor required", () => {
  const p = plan({
    prefs: { preferred_content_types: ["quiz", "revalida_up"] },
    signals: { quizAttempts: answers(1, 10), lessonCompletions: [{ lesson_id: 801, page_id: 301, completed_at: "2026-07-20T10:00:00Z" }] },
  });
  assert.deepEqual(kindsOf(p, "Tema1"), []);
  assert.deepEqual(p.forecast!.scope.countedTypes, ["quiz", "revalida_up"]);
});

test("plan: a topic already started stays ahead of the ones not started", () => {
  // Tema4 has 3 answers; it must come before Tema1–3, which rank higher but are untouched.
  const p = plan({ signals: { quizAttempts: answers(4, 3) } });
  assert.equal(p.items[0].title, "Tema4");
  assert.match(p.items[0].subtitle, /3 de 10 questões/);
});

test("below 70% without Revisão data → only the wrong ones are asked again, with real minutes", () => {
  const p = plan({ signals: { quizAttempts: answers(1, 10, 6) } });
  const q = p.items.find((i) => i.title === "Tema1" && i.kind === "quiz")!;
  assert.equal(q.units, 4);
  assert.equal(q.estimatedMinutes, 10);
});

// Every answered question is enrolled in the Revisão; answers(1, 10, 6) leaves questions 106–109 wrong.
const inRevisao = (ids: number[], over: Partial<{ repetitions: number; last_reviewed_at: string; suspended: boolean }> = {}) =>
  ids.map((id) => ({ item_id: id, repetitions: 0, last_reviewed_at: "2026-07-20T10:00:01Z", suspended: false, ...over }));

test("below 70% with the wrong questions in the Revisão → no duplicate item, and the topic does not block the plan", () => {
  const p = plan({ signals: { quizAttempts: answers(1, 10, 6), questionReview: inRevisao([106, 107, 108, 109]), reviewDueToday: 4 } });
  assert.equal(p.items.some((i) => i.title === "Tema1" && i.kind === "quiz"), false, "the Revisão already brings them back");
  assert.equal(p.items[0].title, "4 itens para revisar", "the next activity is defined and has time");
  assert.equal(p.items[0].estimatedMinutes, 2);
  // The rest of Tema1 is still recommended, and the plan moves on to Tema2.
  assert.deepEqual(kindsOf(p, "Tema1"), ["revalida_up", "flashcards", "audio"]);
  assert.ok(p.items.some((i) => i.title === "Tema2"));
  assert.ok(p.items.every((i) => i.estimatedMinutes > 0), "no zero-length item");
});

test("below 70%: a wrong question the Revisão is NOT bringing back (suspended) is asked by the plan", () => {
  const rows = [...inRevisao([106, 107, 108]), ...inRevisao([109], { suspended: true })];
  const p = plan({ signals: { quizAttempts: answers(1, 10, 6), questionReview: rows } });
  const q = p.items.find((i) => i.title === "Tema1" && i.kind === "quiz")!;
  assert.equal(q.units, 1);
});

test("a question answered right later IN the Revisão counts: the topic reaches 70% and concludes", () => {
  // 6/10 right; two of the wrong ones were answered right in a review session the next day → 8/10.
  const rows = [
    ...inRevisao([106, 107], { repetitions: 1, last_reviewed_at: "2026-07-21T10:00:00Z" }),
    ...inRevisao([108, 109]),
  ];
  const allElseDone = {
    lessonCompletions: [
      { lesson_id: 801, page_id: 301, completed_at: "2026-07-20T10:00:00Z" },
      { lesson_id: 701, page_id: 600, completed_at: "2026-07-20T10:00:00Z" },
    ],
    flashcards: { seenByGroup: new Map([[901, 20]]), paceSeconds: null, paceSamples: 0, attemptsToday: 0 },
  };
  const before = plan({ signals: { quizAttempts: answers(1, 10, 6), questionReview: inRevisao([106, 107, 108, 109]), ...allElseDone } });
  assert.equal(before.forecast!.inReviewTopics, 1, "nothing left to schedule, but not concluded");
  assert.equal(before.forecast!.completedTopics, 0);
  assert.equal(before.forecast!.pendingTopics, N - 1);
  const after = plan({ signals: { quizAttempts: answers(1, 10, 6), questionReview: rows, ...allElseDone } });
  assert.equal(after.forecast!.inReviewTopics, 0);
  assert.equal(after.forecast!.completedTopics, 1);
});

test("time spent in the Revisão today counts against today's time", () => {
  const none = plan();
  const reviewed = plan({ signals: { reviewedToday: 40 } }); // 40 items × 30 s = 20 min
  assert.equal(reviewed.todayDoneMinutes, 20);
  assert.ok(reviewed.totalEstimatedMinutes <= 40);
  assert.ok(reviewed.totalEstimatedMinutes < none.totalEstimatedMinutes);
});

test("the forecast holds back for reviews what the Revisão takes today (never below the minimum, never above the daily limit)", () => {
  const light = plan({ testDate: "2026-08-20", signals: { reviewDueToday: 0 } });
  const heavy = plan({ testDate: "2026-08-20", signals: { reviewDueToday: 80 } });   // 40 min of a 60-min day → capped at 50%
  const future = (p: ReturnType<typeof plan>) => p.scheduleDays.filter((d) => d.key > TODAY && d.available === 60);
  assert.ok(future(light).every((d) => d.review === 12));
  assert.ok(future(heavy).every((d) => d.review === 30));
});

test("MedHelp 60D materials are never scheduled by Meu Plano", () => {
  const p = plan({ testDate: "2026-09-01", prefs: { include_60d: true, preferred_content_types: ["quiz", "simulado", "revalida_up", "flashcards", "audio", "memorecards"] } });
  assert.equal(p.phase, "intensification");
  assert.equal(p.items.some((i) => i.kind === "memorecards"), false);
  const sim = p.items.find((i) => i.kind === "simulado")!;
  assert.match(sim.title, /^Mini simulado/);
  assert.match(sim.title, /25 questões/);
  assert.equal(sim.href, "/app/estudo-por-questoes?tab=simulados");
  assert.ok(p.totalEstimatedMinutes <= 60);
});

test("forecast: zero topics concluded in full is told apart from partial progress", () => {
  // One study day of 30 min: Tema1 does not fit whole, but the plan does advance in it.
  const p = plan({ testDate: "2026-07-29", prefs: { daily_minutes: 30, preferred_content_types: ["quiz", "revalida_up", "flashcards"] } });
  const f = p.forecast!;
  assert.equal(f.expectedTopics, 0);
  assert.equal(f.partialTopics, 1);
  assert.ok(f.scheduledMinutes > 0 && f.scheduledMinutes < f.pendingMinutes);
});

test("plan: what was studied today counts against today's time; the day ends as 'complete', not 'empty'", () => {
  const todayAnswers = Array.from({ length: 24 }, (_, q) => ({
    specialty_id: 1, is_correct: true, created_at: "2026-07-28T12:00:00Z", page_id: 999, question_id: 5000 + q,
  }));
  const p = plan({ signals: { quizAttempts: todayAnswers } });
  assert.equal(p.todayDoneMinutes, 60);
  assert.equal(p.items.length, 0);
  assert.equal(p.dayComplete, true);
  const more = plan({ signals: { quizAttempts: todayAnswers }, extra: 30 });
  assert.equal(more.dayComplete, false);
  assert.ok(more.totalEstimatedMinutes <= 30);
});

test("plan: a faster pace puts more content in the same day", () => {
  const std = plan({ prefs: { pace_mode: "standard" } });
  const fast = plan({ prefs: { pace_mode: "fast" } });
  const units = (p: ReturnType<typeof plan>) => p.items.filter((i) => i.kind === "quiz").reduce((s, i) => s + (i.units ?? 0), 0);
  assert.ok(units(fast) > units(std));
  assert.ok(fast.totalEstimatedMinutes <= 60);
});

test("forecast: everything fits → all expected, with the day the last topic ends", () => {
  const p = plan();
  const f = p.forecast!;
  assert.equal(f.pendingTopics, N);
  assert.equal(f.expectedTopics, N);
  assert.deepEqual(f.notExpected, []);
  assert.equal(f.hints.length, 0);
  assert.ok(f.finishDay && f.finishDay < "2027-01-15");
});

test("forecast: not enough time → says what is not expected and what would widen the coverage", () => {
  // Exam in 3 days, 30 min a day.
  const p = plan({ testDate: "2026-07-31", prefs: { daily_minutes: 30, preferred_content_types: ["quiz", "revalida_up", "flashcards"] } });
  const f = p.forecast!;
  assert.ok(f.expectedTopics < f.pendingTopics);
  assert.equal(f.notExpected.length, f.pendingTopics - f.expectedTopics);
  // Priority order is kept: the topics left are the lower-ranked ones.
  assert.equal(f.notExpected[f.notExpected.length - 1].name, `Tema${N}`);
  const minutesHint = f.hints.find((h) => h.kind === "minutes");
  assert.ok(minutesHint && minutesHint.expectedTopics > f.expectedTopics);
  assert.equal(f.studyDaysLeft, 3);
});

test("forecast: missed days never erase progress — the same progress gives the same pending work later", () => {
  const signals = { quizAttempts: answers(1, 10), lessonCompletions: [{ lesson_id: 801, page_id: 301, completed_at: "2026-07-20T10:00:00Z" }] };
  const now = plan({ signals });
  const later = withFrozenTime("2026-08-18T13:00:00Z", () => derivePlan({
    prefs: { ...defaultPrefs(), pace_mode: "standard" }, cohort: { test_date: "2027-01-15" },
    specialties: SPECIALTIES, pages: PAGES, topics: TOPICS, topicContent: CONTENT,
    signals: {
      reviewDueToday: 0, lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map(Array.from({ length: N }, (_, i) => [101 + i, 10])),
      catalog: CATALOG, flashcards: { seenByGroup: new Map(), paceSeconds: null, paceSamples: 0, attemptsToday: 0 },
      ...signals,
    },
  }));
  assert.equal(later.forecast!.pendingMinutes, now.forecast!.pendingMinutes);
  assert.equal(later.forecast!.completedTopics, now.forecast!.completedTopics);
  assert.ok(later.forecast!.studyDaysLeft < now.forecast!.studyDaysLeft);
});

test("forecast: no exam date → no forecast, but today is still planned", () => {
  const p = plan({ testDate: null });
  assert.equal(p.forecast, null);
  assert.ok(p.items.length > 0);
});

test("forecast: a paused day shows no items but still forecasts", () => {
  const p = plan({ prefs: { available_days: 127 & ~(1 << 2) } }); // Tuesday off
  assert.equal(p.paused, true);
  assert.equal(p.items.length, 0);
  assert.ok(p.forecast && p.forecast.pendingTopics === N);
});

test("MedVoice is not counted once today is past the foundation phase", () => {
  const p = plan({ testDate: "2026-09-01" });
  assert.equal(p.phase, "intensification");
  assert.equal(p.items.some((i) => i.kind === "audio"), false);
  assert.deepEqual(p.forecast!.scope.countedTypes, ["quiz", "revalida_up", "flashcards", "audio"]);
});

// ── wiring (source-level) ────────────────────────────────────────────────────

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");

test("the forecast uses Karina's wording: 'não previstos até a prova', never 'ficam de fora'", () => {
  const panel = src("app", "app", "plano", "forecast-panel.tsx");
  assert.match(panel, /não previstos até a prova/);
  assert.match(panel, /Resumos Narrativos e os materiais do\s+MedHelp 60D/);
  assert.match(panel, /não estão incluídos/);
  // Three separate facts (Karina 2026-11-18): full conclusion, partial advance, time that fits.
  assert.match(panel, /Temas com conclusão integral prevista/);
  assert.match(panel, /Temas com avanço parcial previsto/);
  assert.match(panel, /Tempo de materiais pendentes que cabe até a prova/);
  assert.match(panel, /temas sem conclusão integral prevista/);
  assert.doesNotMatch(panel, /ficam de fora|fica de fora/);
});

test("the student's answers are read past PostgREST's 1000-row cap", () => {
  const fetchSrc = src("lib", "study-plan", "fetch.ts");
  assert.match(fetchSrc, /fetchAllForUser<[^>]+>\(\s*admin, "quiz_attempts"/);
  assert.doesNotMatch(fetchSrc, /\.from\("quiz_attempts"\)/, "a direct read would silently drop the newest answers");
});

test("the settings action is restricted to content roles and audited", () => {
  const action = src("actions", "study-plan-settings.ts");
  assert.match(action, /\["super_admin", "content_admin"\]/);
  assert.match(action, /plan_settings_update/);
});

// ── mini simulado: its day, missed days, and students with little time ───────

test("schedule: a simulado skipped on its day is not chased all week — unless that day was missed altogether", () => {
  // Wednesday of an intensification week; the simulado belonged to Monday.
  const wed = { todayKey: "2026-07-29", examKey: "2026-09-01", queue: [quiz(1, 400)] };
  const missedMonday = simulateSchedule(input({ ...wed, today: { simuladoSkippedThrough: null } }));
  assert.equal(missedMonday.today.simuladoMinutes, 40, "nothing studied yet this week: it is offered now");
  const skippedIt = simulateSchedule(input({ ...wed, today: { simuladoSkippedThrough: "2026-07-27" } }));
  assert.equal(skippedIt.today.simuladoMinutes, 0, "studied on Monday and skipped it: not asked again");
});

test("schedule: with 'every N weeks' the simulado weeks are counted back from the exam week", () => {
  const r = simulateSchedule(input({ queue: [quiz(1, 4000)], examKey: "2026-09-01", simuladoEveryWeeks: 3 }));
  const simDays = r.days.filter((d) => d.simulado > 0).map((d) => d.key);
  // Exam week starts Monday 2026-08-31; simulado weeks: that one, 3 weeks before (08-10), 6 weeks before (07-20, past).
  assert.deepEqual(simDays, ["2026-08-10", "2026-08-31"]);
});

test("plan: mini simulados take at most a quarter of the week's study time (little time → every few weeks)", () => {
  // 30 min × 3 days = 90 min a week; one mini simulado = 62.5 min → every 3 weeks, not every week.
  const little = plan({ testDate: "2026-09-01", prefs: { ...WITH_SIMULADO, daily_minutes: 30, available_days: (1 << 2) | (1 << 3) | (1 << 5) } }); // Tue, Wed, Fri
  const simDays = little.scheduleDays.filter((d) => d.simulado > 0).length;
  const weeks = 5;
  assert.ok(simDays > 0 && simDays <= weeks, `simulado on ${simDays} days in ~${weeks} weeks`);
  const content = little.scheduleDays.reduce((s, d) => s + d.content, 0);
  const simulado = little.scheduleDays.reduce((s, d) => s + d.simulado, 0);
  assert.ok(content > simulado, "new content keeps most of the time");
  // 60 min × 7 days: one every week.
  const plenty = plan({ testDate: "2026-09-01", prefs: WITH_SIMULADO });
  const mondays = plenty.scheduleDays.filter((d) => d.simulado > 0 && d.key > TODAY).length;
  assert.ok(mondays >= 4);
});

test("an exam date that has passed (or is today) gives no forecast, and today is still planned", () => {
  for (const testDate of ["2026-07-28", "2026-05-10"]) {
    const p = plan({ testDate });
    assert.equal(p.forecast, null, testDate);
    assert.ok(p.items.length > 0);
    assert.ok(p.totalEstimatedMinutes <= p.todayBudgetMinutes);
  }
});
