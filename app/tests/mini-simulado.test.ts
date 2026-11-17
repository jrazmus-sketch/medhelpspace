/**
 * Mini simulados in Meu Plano (Karina 2026-11-17, second round). Rules under test — each one is hers:
 *   A. a mini simulado left half-way is CONTINUED on the first unanswered question; "Recomeçar"
 *      preserves the history; one begun in a week and finished in the next is neither lost nor
 *      programmed twice;
 *   B. the block shows the TOTAL estimated time and, when the day is shorter, today's part —
 *      as estimates, never as timed sessions;
 *   C. frequency: Automática (25% reference) | 1 por semana | 2 por semana (no 25% limit);
 *   D. the impact is known before confirming, and a frequency whose sessions alone exceed the
 *      week's study time is never offered as viable.
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
import { DEFAULT_PLAN_SETTINGS } from "@/lib/study-plan/settings";
import { simulateSchedule, type ScheduleInput, type WorkActivity } from "@/lib/study-plan/schedule";
import {
  runProgress, simuladoFacts, simuladoCadence, frequencyFromColumn, frequencyToColumn,
  type SimuladoCatalog,
} from "@/lib/study-plan/simulado";

const S = DEFAULT_PLAN_SETTINGS;
// MORNING_BRT is Tuesday 2026-07-28; the week began on Monday 2026-07-27.
const TODAY = "2026-07-28";
const WEEK_START = "2026-07-27";
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

// ── the run ──────────────────────────────────────────────────────────────────

const QIDS = Array.from({ length: 25 }, (_, i) => 90001 + i);
const SIM_PAGE = 9001;
const catalog = (runStart?: string): SimuladoCatalog => ({
  pages: new Map([
    [SIM_PAGE, { pageId: SIM_PAGE, slug: "simulado-geral-3", title: "Simulado 3", specialtySlug: "geral", isMini: true, questionIds: QIDS }],
    [9100, { pageId: 9100, slug: "simulado-100q-1", title: "Simulado 100Q 1", specialtySlug: "geral", isMini: false, questionIds: [99001, 99002] }],
  ]),
  runStarts: new Map(runStart ? [[SIM_PAGE, runStart]] : []),
});
/** `n` answers to the first questions of the mini simulado, at `iso` (one second apart). */
const simAnswers = (n: number, iso: string, right = n) => Array.from({ length: n }, (_, i) => ({
  specialty_id: null, is_correct: i < right, page_id: SIM_PAGE, question_id: QIDS[i],
  created_at: new Date(Date.parse(iso) + i * 1000).toISOString(),
}));

test("run: the latest answer to each question of the page, since the run began", () => {
  const rows = [
    { page_id: SIM_PAGE, question_id: QIDS[0], is_correct: false, created_at: "2026-07-20T10:00:00Z" },
    { page_id: SIM_PAGE, question_id: QIDS[0], is_correct: true, created_at: "2026-07-21T10:00:00Z" },
    { page_id: SIM_PAGE, question_id: QIDS[1], is_correct: true, created_at: "2026-07-21T10:01:00Z" },
    { page_id: SIM_PAGE, question_id: 555, is_correct: true, created_at: "2026-07-21T10:02:00Z" }, // no longer on the page
  ];
  const all = runProgress(rows, QIDS, null);
  assert.deepEqual([...all.results], [[QIDS[0], true], [QIDS[1], true]]);
  // "Recomeçar" moved the start: the earlier answers are out of the run — and still in the list (history kept).
  const restarted = runProgress(rows, QIDS, "2026-07-21T10:00:30Z");
  assert.deepEqual([...restarted.results], [[QIDS[1], true]]);
  assert.equal(rows.length, 4);
});

test("facts: a mini simulado left half-way is the one in progress; a finished or untouched one is not", () => {
  const half = simuladoFacts(simAnswers(12, "2026-07-27T12:00:00Z"), catalog(), TODAY, WEEK_START);
  assert.deepEqual(half.inProgress && [half.inProgress.answered, half.inProgress.remaining, half.inProgress.carried], [12, 13, false]);
  assert.equal(simuladoFacts(simAnswers(25, "2026-07-27T12:00:00Z"), catalog(), TODAY, WEEK_START).inProgress, null);
  assert.equal(simuladoFacts([], catalog(), TODAY, WEEK_START).inProgress, null);
});

test("facts: begun in an earlier week → carried; untouched for more than a week → no longer asked for", () => {
  const lastFriday = simuladoFacts(simAnswers(12, "2026-07-24T12:00:00Z"), catalog(), TODAY, WEEK_START);
  assert.equal(lastFriday.inProgress?.carried, true);
  const stale = simuladoFacts(simAnswers(12, "2026-07-10T12:00:00Z"), catalog(), TODAY, WEEK_START);
  assert.equal(stale.inProgress, null);
});

test("facts: after 'Recomeçar' only the answers of the new run count", () => {
  const rows = [...simAnswers(25, "2026-07-20T12:00:00Z"), ...simAnswers(3, "2026-07-27T12:00:00Z")];
  const f = simuladoFacts(rows, catalog("2026-07-27T12:00:00Z"), TODAY, WEEK_START);
  assert.equal(f.inProgress?.answered, 3);
  assert.equal(f.inProgress?.remaining, 22);
});

test("facts: any simulado answered today counts as taken up today (a 60D Simulado 100Q too) — never as the one in progress", () => {
  const f = simuladoFacts(
    [{ page_id: 9100, question_id: 99001, is_correct: true, created_at: "2026-07-28T12:00:00Z" }], catalog(), TODAY, WEEK_START);
  assert.equal(f.touchedToday, 1);
  assert.equal(f.inProgress, null, "the plan never asks to continue a 60D simulado");
});

// ── frequency ────────────────────────────────────────────────────────────────

test("frequency: stored as NULL (Automática) | 1 | 2", () => {
  assert.equal(frequencyFromColumn(null), "auto");
  assert.equal(frequencyFromColumn(2), 2);
  assert.equal(frequencyFromColumn(7), "auto");
  assert.equal(frequencyToColumn("auto"), null);
  assert.equal(frequencyToColumn(1), 1);
});

test("frequency: Automática keeps the 25% reference; the student's own choice does not", () => {
  // 90 min a week, one session = 62.5 min.
  const auto = simuladoCadence("auto", S, 62.5, 90);
  assert.deepEqual([auto.sessionsPerWeek, auto.everyWeeks, auto.feasible], [1, 3, true]);
  assert.ok(auto.weeklyMinutes <= 0.25 * 90 + 0.01);
  const one = simuladoCadence(1, S, 62.5, 90);
  assert.deepEqual([one.sessionsPerWeek, one.everyWeeks, one.feasible], [1, 1, true]);
  assert.ok(one.weeklyMinutes > 0.25 * 90, "more than 25% of the week — allowed, it is the student's choice");
});

test("frequency: sessions that alone exceed the week's study time are never viable", () => {
  assert.equal(simuladoCadence(2, S, 62.5, 90).feasible, false, "125 min of simulados in a 90-minute week");
  assert.equal(simuladoCadence(2, S, 62.5, 125).feasible, true, "exactly the whole week still fits");
  assert.equal(simuladoCadence(1, S, 62.5, 60).feasible, false);
});

// ── schedule ─────────────────────────────────────────────────────────────────

const quiz = (topicId: number, questions: number): WorkActivity =>
  ({ kind: "quiz", topicId, unitsRemaining: questions, minutesPerUnit: 2.5, divisible: true, minChunkUnits: 1 });

function input(
  over: Omit<Partial<ScheduleInput>, "today"> & { today?: Partial<ScheduleInput["today"]>; minutes?: number; mask?: number },
): ScheduleInput {
  const minutes = over.minutes ?? 60;
  return {
    todayKey: TODAY,
    examKey: "2026-09-01",
    calendar: { studyDayMask: over.mask ?? 127, pauses: [], minutesForDay: () => minutes },
    settings: S,
    intensificationStartDays: 60,
    queue: [quiz(1, 4000)],
    simuladoEnabled: true,
    simuladoMinutes: 40, // 1.6 min a question
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
const weekTotal = (r: ReturnType<typeof simulateSchedule>, monday: string, sunday: string) =>
  r.days.filter((d) => d.key >= monday && d.key <= sunday).reduce((s, d) => s + d.simulado, 0);
function assertNoDayOverBudget(r: ReturnType<typeof simulateSchedule>) {
  for (const d of r.days) assert.ok(d.review + d.simulado + d.content <= d.available + 0.01, d.key);
}

test("schedule: the mini simulado in progress is continued — even after the student studied on its day", () => {
  // Monday: 12 of 25 answered. Tuesday: 13 left (20.8 min). A session merely SKIPPED would not come back; one begun does.
  const r = simulateSchedule(input({ today: { simuladoTouches: [{ dayKey: "2026-08-03", carried: false }], simuladoResumeMinutes: 13 * 1.6 }, todayKey: "2026-08-04" }));
  assert.ok(near(r.today.simuladoMinutes, 20.8));
  assert.ok(near(r.today.simuladoResumeMinutes, 20.8));
  assert.equal(r.today.simuladoPartial, false);
  assertNoDayOverBudget(r);
});

test("schedule: begun in one week and finished in the next — neither lost nor programmed twice", () => {
  const monday = { todayKey: "2026-08-03" };
  // Carried from last week: it stands in for this week's session.
  const carried = simulateSchedule(input({ ...monday, today: { simuladoResumeMinutes: 13 * 1.6, simuladoResumeCarried: true } }));
  assert.ok(near(carried.today.simuladoMinutes, 20.8), "the 13 questions left, not 13 + a new simulado");
  assert.ok(near(weekTotal(carried, "2026-08-03", "2026-08-09"), 20.8));
  // The week after is a normal week again.
  assert.ok(near(weekTotal(carried, "2026-08-10", "2026-08-16"), 40));
  // Without anything in progress the same Monday asks for the week's whole session.
  assert.ok(near(simulateSchedule(input(monday)).today.simuladoMinutes, 40));
});

test("schedule: in the forecast too, a session that does not fit its week continues instead of piling up", () => {
  // 8 min a day, Mon–Fri. Today (Monday, no review due) holds 5 questions = 8 min; every later day keeps 1.6 min
  // for reviews and holds 4 questions = 6.4 min. One 40-min simulado (25 questions) never fits a single week.
  const r = simulateSchedule(input({ minutes: 8, mask: 0b0111110, todayKey: "2026-07-27" }));
  assert.ok(near(weekTotal(r, "2026-07-27", "2026-08-02"), 33.6), "this week: 21 of the 25 questions");
  assert.ok(near(weekTotal(r, "2026-08-03", "2026-08-09"), 6.4), "next week: the 4 questions left — NOT 4 + a new simulado");
  assert.ok(near(weekTotal(r, "2026-08-10", "2026-08-16"), 32), "then a new session begins");
  assert.ok(near(weekTotal(r, "2026-08-17", "2026-08-23"), 8), "and is finished the week after");
  assertNoDayOverBudget(r);
});

test("schedule: two a week are spread over the week (Monday and Thursday when every day is a study day)", () => {
  const r = simulateSchedule(input({ simuladoSessionsPerWeek: 2 }));
  const days = r.days.filter((d) => d.key >= "2026-08-03" && d.key <= "2026-08-09" && d.simulado > 0).map((d) => d.key);
  assert.deepEqual(days, ["2026-08-03", "2026-08-06"]);
  assert.ok(near(weekTotal(r, "2026-08-03", "2026-08-09"), 80));
  assertNoDayOverBudget(r);
});

test("schedule: today's second session of the week is asked for after the first one was done on Monday", () => {
  // Thursday 2026-07-30, two a week: Monday's session was done (studied earlier), today's is new.
  const r = simulateSchedule(input({ todayKey: "2026-07-30", simuladoSessionsPerWeek: 2, today: { simuladoTouches: [{ dayKey: "2026-07-27", carried: false }] } }));
  assert.ok(near(r.today.simuladoMinutes, 40));
});

test("schedule: a session the plan postponed (the day went to finishing the one in progress) is still owed the next day", () => {
  // Two a week, every day a study day: sessions on Monday and Thursday. 25-minute days hold 15 questions.
  // Thursday: 13 questions left of Monday's simulado. Only 2 questions of the new session would fit after them,
  // so the new one is not opened today…
  const two = { simuladoSessionsPerWeek: 2, minutes: 25 };
  const monday = { dayKey: "2026-07-27", carried: false };
  const thu = simulateSchedule(input({ ...two, todayKey: "2026-07-30", today: { simuladoTouches: [monday], simuladoResumeMinutes: 13 * 1.6 } }));
  assert.ok(near(thu.today.simuladoMinutes, 20.8), "the 13 questions left, nothing else");
  assert.equal(thu.today.simuladoPartial, true, "the week's second session is still owed");
  // …and on Friday it is asked for: the week's second session is NOT lost (Thursday had simulado answers).
  const fri = simulateSchedule(input({ ...two, todayKey: "2026-07-31", today: { simuladoTouches: [monday] } }));
  assert.ok(near(fri.today.simuladoMinutes, 24), "15 questions of the new session");
  // A student who studied on Thursday WITHOUT touching a simulado skipped it: not chased on Friday.
  const skipped = simulateSchedule(input({ ...two, todayKey: "2026-07-31", today: { simuladoTouches: [monday], simuladoSkippedThrough: "2026-07-30" } }));
  assert.equal(skipped.today.simuladoMinutes, 0);
  // Once the second one is begun, nothing more is owed this week.
  const both = simulateSchedule(input({ ...two, todayKey: "2026-08-01", today: { simuladoTouches: [monday, { dayKey: "2026-07-31", carried: false }] } }));
  assert.equal(both.today.simuladoMinutes, 0);
});

test("schedule: a simulado carried from last week and finished on Monday still stands for this week's first session", () => {
  const carriedDone = [{ dayKey: "2026-07-27", carried: true }];
  // One a week: nothing new is opened later in the week.
  assert.equal(simulateSchedule(input({ todayKey: "2026-07-29", today: { simuladoTouches: carriedDone } })).today.simuladoMinutes, 0);
  // Two a week: Thursday's second session is a new one — exactly one, not two.
  const thu = simulateSchedule(input({ todayKey: "2026-07-30", simuladoSessionsPerWeek: 2, today: { simuladoTouches: carriedDone } }));
  assert.ok(near(thu.today.simuladoMinutes, 40));
});

test("facts: every simulado answered this week takes up one session — with the day it was first answered this week", () => {
  // Begun last Friday (12 answers), continued this Monday; and a 60D Simulado 100Q answered today.
  const rows = [
    ...simAnswers(12, "2026-07-24T12:00:00Z"),
    ...simAnswers(15, "2026-07-27T12:00:00Z"),
    { page_id: 9100, question_id: 99001, is_correct: true, created_at: "2026-07-28T12:00:00Z" },
  ];
  const f = simuladoFacts(rows, catalog(), TODAY, WEEK_START);
  assert.deepEqual(
    [...f.touches].sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
    [{ dayKey: "2026-07-27", carried: true }, { dayKey: "2026-07-28", carried: false }],
  );
  assert.deepEqual([...f.answerDays].sort(), ["2026-07-27", "2026-07-28"]);
  // Nothing answered this week → nothing taken up.
  assert.deepEqual(simuladoFacts(simAnswers(12, "2026-07-24T12:00:00Z"), catalog(), TODAY, WEEK_START).touches, []);
});

// ── the plan ─────────────────────────────────────────────────────────────────

const SPECIALTIES: SpecialtyRow[] = [{ id: 1, name: "Cardiologia", slug: "cardiologia" }];
const PAGES: PageRow[] = [];
const TOPICS: TopicRow[] = [];
const CONTENT: TopicContentRow[] = [];
for (let i = 1; i <= 40; i++) {
  PAGES.push({ id: 100 + i, slug: `q${i}`, title: `Q${i}`, type: "h5p-quiz", specialty_id: 1, track_id: null, content_module_id: null, view: "quiz" });
  TOPICS.push({ id: i, name: `Tema${i}`, slug: `t${i}`, specialty_id: 1, source_page_id: 100 + i, incidence_count: 100 - i, priority_tier: "A", is_pinned: false });
  CONTENT.push({ topic_id: i, resource_type: "quiz", page_id: 100 + i, question_filter: null });
}

function plan(over: { prefs?: Partial<StudyPlanPrefs>; signals?: Partial<Signals>; testDate?: string } = {}) {
  return withFrozenTime(MORNING_BRT, () => derivePlan({
    prefs: {
      ...defaultPrefs(), pace_mode: "standard",
      preferred_content_types: ["quiz", "simulado"], ...over.prefs,
    },
    cohort: { test_date: over.testDate ?? "2026-09-01" },
    specialties: SPECIALTIES, pages: PAGES, topics: TOPICS, topicContent: CONTENT,
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0, lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map(Array.from({ length: 40 }, (_, i) => [101 + i, 30])),
      simulados: catalog(),
      ...over.signals,
    },
  }));
}
const simItems = (p: ReturnType<typeof plan>) => p.items.filter((i) => i.kind === "simulado");

test("plan: the block shows the total estimated time and today's part when the day is shorter", () => {
  // 60-minute day, 62.5-minute simulado: 24 questions today, the last one on the next study day.
  const p = plan();
  const [sim] = simItems(p);
  assert.equal(sim.title, "Mini simulado — 25 questões");
  assert.equal(sim.cta, "Escolher simulado");
  assert.equal(sim.href, "/app/estudo-por-questoes?tab=simulados");
  assert.equal(sim.lines![0], "Tempo estimado: 62 min", "the whole simulado, never a reduced duration");
  assert.match(sim.lines![1], /^Hoje: cerca de 60 min \(24 questões\)\. Continue no próximo dia de estudo\.$/);
  assert.ok(p.totalEstimatedMinutes <= p.todayBudgetMinutes);
});

test("plan: a day that holds the whole simulado shows no 'Hoje' line", () => {
  const [sim] = simItems(plan({ prefs: { intensity: "intenso" } }));
  assert.deepEqual(sim.lines, ["Tempo estimado: 62 min"]);
});

test("plan: a mini simulado in progress becomes 'Continuar', straight to its page, with what is left", () => {
  const p = plan({ signals: { quizAttempts: simAnswers(12, "2026-07-27T12:00:00Z") } });
  const sims = simItems(p);
  assert.equal(sims.length, 1, "only the one in progress — no second simulado next to it");
  assert.equal(sims[0].title, "Continuar mini simulado");
  assert.equal(sims[0].href, "/app/geral/simulado-geral-3");
  assert.equal(sims[0].cta, "Continuar de onde parou");
  assert.match(sims[0].lines![0], /Simulados Gerais · Simulado 3 · faltam 13 de 25 questões/);
  assert.equal(sims[0].lines![1], "Tempo estimado: 32 min");
  assert.equal(sims[0].estimatedMinutes, 32);
});

test("plan: carried over from last week, with this week's simulado day missed — still only ONE block", () => {
  // Answered on Friday 24/07; nothing studied this week (Monday, the simulado's day, was missed).
  const p = plan({ signals: { quizAttempts: simAnswers(12, "2026-07-24T12:00:00Z") } });
  const sims = simItems(p);
  assert.deepEqual(sims.map((s) => s.title), ["Continuar mini simulado"]);
  assert.ok(near(p.scheduleDays.filter((d) => d.key <= "2026-08-02").reduce((s, d) => s + d.simulado, 0), 32.5));
});

test("plan: a simulado done outside the schedule today is not asked for again, and its time counts once", () => {
  const today = simAnswers(25, "2026-07-28T10:00:00Z");
  const p = plan({ signals: { quizAttempts: today } });
  assert.equal(simItems(p).length, 0);
  assert.equal(p.todayDoneMinutes, 63, "25 answers × 2.5 min, once (62.5)");
  // The day's time is used up: what did not fit stays pending for the next days.
  assert.equal(p.dayComplete, true);
  assert.ok((p.forecast?.pendingTopics ?? 0) > 0);
});

test("plan: 'Mini simulados' unchecked → no block, and the frequency is marked as not enabled", () => {
  const p = plan({ prefs: { preferred_content_types: ["quiz"] }, signals: { quizAttempts: simAnswers(12, "2026-07-27T12:00:00Z") } });
  assert.equal(simItems(p).length, 0);
  assert.equal(p.simulado.enabled, false);
});

test("plan: more than 60 days before the exam there is no mini simulado, whatever the frequency", () => {
  const p = plan({ testDate: "2027-01-15", prefs: { simulado_frequency: 2 } });
  assert.equal(simItems(p).length, 0);
  assert.equal(p.simulado.inPhase, false);
  assert.equal(p.simulado.phaseDays, 60);
});

test("plan: the student's frequency is used, and the other activities get the time that is left", () => {
  const auto = plan();
  const two = plan({ prefs: { simulado_frequency: 2 } });
  assert.equal(two.simulado.inForce, 2);
  const week = (p: ReturnType<typeof plan>) =>
    p.scheduleDays.filter((d) => d.key >= "2026-08-03" && d.key <= "2026-08-09").reduce((s, d) => s + d.simulado, 0);
  assert.ok(near(week(auto), 62.5));
  assert.ok(near(week(two), 125));
  for (const d of two.scheduleDays) assert.ok(d.review + d.simulado + d.content <= d.available + 0.01, d.key);
  assert.ok((two.forecast?.expectedTopics ?? 0) <= (auto.forecast?.expectedTopics ?? 0));
});

test("plan: every option carries its weekly time and its forecast, so the impact is shown before confirming", () => {
  const p = plan();
  const byFreq = new Map(p.simulado.options.map((o) => [String(o.frequency), o]));
  assert.deepEqual([...byFreq.keys()], ["auto", "1", "2"]);
  assert.equal(p.simulado.weeklyStudyMinutes, 420);
  assert.equal(byFreq.get("2")!.weeklyMinutes, 125);
  assert.equal(byFreq.get("auto")!.expectedTopics, p.forecast!.expectedTopics, "the option in force IS the forecast on screen");
  assert.ok(byFreq.get("2")!.expectedTopics! <= byFreq.get("1")!.expectedTopics!);
  assert.equal(p.simulado.pendingTopics, p.forecast!.pendingTopics);
});

test("plan: a saved frequency that no longer fits is not used — the plan falls back to Automática and says so", () => {
  // 30 min × 3 days = 90 min a week; two simulados = 125 min.
  const p = plan({ prefs: { simulado_frequency: 2, intensity: "leve", available_days: (1 << 2) | (1 << 3) | (1 << 5) } });
  assert.equal(p.simulado.chosen, 2);
  assert.equal(p.simulado.inForce, "auto");
  const two = p.simulado.options.find((o) => o.frequency === 2)!;
  assert.equal(two.feasible, false);
  assert.equal(two.expectedTopics, null, "no forecast is offered for a load that does not fit");
  const content = p.scheduleDays.reduce((s, d) => s + d.content, 0);
  assert.ok(content > 0, "the other activities keep their time");
});

// ── the screens and the route ────────────────────────────────────────────────

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");

test("player: reopens where the student stopped; 'Recomeçar' keeps the history", () => {
  const player = src("components", "content", "quiz-player.tsx");
  assert.match(player, /Continuando de onde você parou/);
  assert.match(player, /Recomeçar não apaga o histórico das tentativas anteriores/);
  assert.match(player, /newRun: true/);
  const route = src("app", "api", "quiz-attempt", "route.ts");
  assert.match(route, /from\("quiz_runs"\)\s*\.upsert/);
  assert.doesNotMatch(route, /\.delete\(/, "an answer is never deleted — a new run only moves a mark");
  assert.match(route, /started_at: inserted\.created_at/, "the run starts at the answer's own database timestamp");
});

test("player: only regular mini simulados resume — never a 60D Simulado 100Q or a topic view", () => {
  const renderer = src("components", "content", "quiz-renderer.tsx");
  assert.match(renderer, /!topicView && page\?\.view === "simulados" && page\?\.content_module_id == null/);
});

test("screen: times are presented as estimates, never as timed sessions", () => {
  assert.match(src("app", "app", "plano", "plano-client.tsx"), /Os tempos são estimativas, calculadas pelas suas respostas e pelo seu ritmo\. As sessões não são cronometradas\./);
  assert.match(src("app", "app", "plano", "simulado-frequency-editor.tsx"), /as sessões não são\s+cronometradas/);
});

test("screen: the frequency is confirmed after seeing the impact, and an unviable one cannot be confirmed", () => {
  const editor = src("app", "app", "plano", "simulado-frequency-editor.tsx");
  assert.match(editor, /Automática/);
  assert.match(editor, /1 por semana/);
  assert.match(editor, /2 por semana/);
  assert.match(editor, /Confirmar/);
  assert.match(editor, /não cabe na sua disponibilidade/);
  assert.match(editor, /Dividir a sessão entre dias não resolve/);
  const action = src("actions", "study-plan.ts");
  assert.match(action, /if \(!option\.feasible\) return \{ ok: false, error: "infeasible" \}/, "refused on the server too");
});
