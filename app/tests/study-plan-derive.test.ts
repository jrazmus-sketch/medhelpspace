import { test } from "node:test";
import assert from "node:assert/strict";
import { withFrozenTime, MORNING_BRT, EVENING_BRT } from "./helpers/freeze-time";
import {
  todayKeyBR, toDateKeyBR, dayOfWeekBR, dayOfWeekForKey,
  addDaysKey, diffDaysKey, startOfDayBRIso, endOfDayBRIso,
} from "@/lib/br-date";
import {
  derivePlan, defaultPrefs, buildPageProgress, isPageMastered,
  type StudyPlanPrefs, type Signals, type TopicRow, type PageRow,
  type TopicContentRow, type SpecialtyRow, type ContentType,
} from "@/lib/study-plan/derive";

// derivePlan reads "now" internally, so the rollover is exercised by freezing
// the global clock — see tests/helpers/freeze-time.ts.

// 2026-07-28 is a TUESDAY in Brazil.



// ── br-date ──────────────────────────────────────────────────────────────────

test("todayKeyBR: 22:00 BRT is still the same Brazilian day (UTC says tomorrow)", () => {
  assert.equal(todayKeyBR(new Date(EVENING_BRT)), "2026-07-28");
  // Proof the old implementation disagreed:
  assert.equal(new Date(EVENING_BRT).toISOString().split("T")[0], "2026-07-29");
});

test("todayKeyBR: just after BR midnight is the new day", () => {
  assert.equal(todayKeyBR(new Date("2026-07-29T03:30:00Z")), "2026-07-29");
  assert.equal(todayKeyBR(new Date("2026-07-29T02:59:00Z")), "2026-07-28");
});

test("toDateKeyBR: bare date keys pass through untouched", () => {
  assert.equal(toDateKeyBR("2026-07-28"), "2026-07-28");
});

test("toDateKeyBR: timestamps convert to the Brazilian calendar day", () => {
  assert.equal(toDateKeyBR("2026-07-29T00:30:00+00:00"), "2026-07-28");
  assert.equal(toDateKeyBR("2026-07-28T23:59:59Z"), "2026-07-28");
  assert.equal(toDateKeyBR("2026-07-29T03:00:00Z"), "2026-07-29");
});

test("toDateKeyBR: invalid input yields empty string, never a crash", () => {
  assert.equal(toDateKeyBR("not-a-date"), "");
});

test("dayOfWeekForKey / dayOfWeekBR", () => {
  assert.equal(dayOfWeekForKey("2026-07-28"), 2); // Tuesday
  assert.equal(dayOfWeekForKey("2026-07-26"), 0); // Sunday
  assert.equal(dayOfWeekBR(new Date(EVENING_BRT)), 2); // still Tuesday in Brazil
  assert.equal(new Date(EVENING_BRT).getUTCDay(), 3); // ...but Wednesday in UTC
});

test("addDaysKey crosses month and year boundaries", () => {
  assert.equal(addDaysKey("2026-07-31", 1), "2026-08-01");
  assert.equal(addDaysKey("2026-01-01", -1), "2025-12-31");
  assert.equal(addDaysKey("2028-02-28", 1), "2028-02-29"); // leap year
});

test("diffDaysKey", () => {
  assert.equal(diffDaysKey("2026-07-28", "2026-09-13"), 47);
  assert.equal(diffDaysKey("2026-07-28", "2026-07-28"), 0);
  assert.equal(diffDaysKey("2026-07-28", "2026-07-27"), -1);
});

test("startOfDayBRIso / endOfDayBRIso are exact UTC-03:00 bounds", () => {
  assert.equal(startOfDayBRIso("2026-07-28"), "2026-07-28T03:00:00.000Z");
  assert.equal(endOfDayBRIso("2026-07-28"), "2026-07-29T03:00:00.000Z");
});

// ── Mastery helpers ──────────────────────────────────────────────────────────

test("buildPageProgress counts DISTINCT questions, latest attempt wins", () => {
  const p = buildPageProgress([
    { specialty_id: 1, is_correct: false, created_at: "2026-07-20T10:00:00Z", page_id: 10, question_id: 1 },
    { specialty_id: 1, is_correct: true,  created_at: "2026-07-21T10:00:00Z", page_id: 10, question_id: 1 }, // retry, now right
    { specialty_id: 1, is_correct: true,  created_at: "2026-07-20T10:00:00Z", page_id: 10, question_id: 2 },
  ]);
  assert.deepEqual(p.get(10), { answered: 2, correct: 2 });
});

test("buildPageProgress: same question 30 times is still 1 question", () => {
  const attempts = Array.from({ length: 30 }, (_, i) => ({
    specialty_id: 1, is_correct: true, created_at: `2026-07-20T10:${String(i).padStart(2, "0")}:00Z`,
    page_id: 10, question_id: 7,
  }));
  assert.deepEqual(buildPageProgress(attempts).get(10), { answered: 1, correct: 1 });
});

test("buildPageProgress: attempts with no question_id prove no coverage", () => {
  // quiz_attempts.question_id is NOT NULL in the DB, so this only guards
  // synthesized signals. Counting them would let N attempts on ONE question look
  // like N distinct questions answered — the exact way to fake mastery.
  const p = buildPageProgress([
    { specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 10 },
    { specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:01:00Z", page_id: 10 },
  ]);
  assert.equal(p.get(10), undefined);
});

test("mixed null and real question_ids: only the real ones count", () => {
  const p = buildPageProgress([
    { specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 10, question_id: null },
    { specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:01:00Z", page_id: 10, question_id: 5 },
  ]);
  assert.deepEqual(p.get(10), { answered: 1, correct: 1 });
});

test("a question deleted after being answered never reads as '18 de 15'", () => {
  const attempts = Array.from({ length: 18 }, (_, i) => ({
    specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  }));
  const plan = withFrozenTime(MORNING_BRT, () =>
    run({ signals: { quizAttempts: attempts, questionCountsByPageId: new Map([[100, 15], [200, 10]]) } }));
  // 18 >= 15 at 100% → mastered and gone; the other topic still flows.
  assert.equal(plan.items.some((i) => i.pageId === 100), false);
  assert.equal(plan.items.some((i) => i.pageId === 200), true);
});

test("fully answered but under 70% says so instead of 'retome de onde parou'", () => {
  const attempts = Array.from({ length: 20 }, (_, i) => ({
    specialty_id: 1, is_correct: i < 13, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  })); // 65%
  const plan = withFrozenTime(MORNING_BRT, () => run({ signals: { quizAttempts: attempts } }));
  const item = plan.items.find((i) => i.pageId === 100)!;
  assert.match(item.subtitle, /65% de acerto · revise os erros/);
  assert.match(item.reason, /respondeu tudo/);
});

test("a NaN question count never retires a page", () => {
  const attempts = Array.from({ length: 5 }, (_, i) => ({
    specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  }));
  assert.equal(isPageMastered({ answered: 5, correct: 5 }, NaN), false);
  const plan = withFrozenTime(MORNING_BRT, () =>
    run({ signals: { quizAttempts: attempts, questionCountsByPageId: new Map([[100, NaN]]) } }));
  assert.equal(plan.items.some((i) => i.pageId === 100), true, "unknown total must never empty the plan");
});

test("isPageMastered: needs full coverage AND >=70%", () => {
  assert.equal(isPageMastered({ answered: 10, correct: 7 }, 10), true);
  assert.equal(isPageMastered({ answered: 10, correct: 6 }, 10), false); // 60%
  assert.equal(isPageMastered({ answered: 9,  correct: 9 }, 10), false); // incomplete
  assert.equal(isPageMastered({ answered: 1,  correct: 1 }, 10), false); // THE P0 BUG
  assert.equal(isPageMastered(undefined, 10), false);
  assert.equal(isPageMastered({ answered: 0, correct: 0 }, 10), false);
  assert.equal(isPageMastered({ answered: 5, correct: 5 }, 0), false);  // unknown total
});

// ── derivePlan fixtures ──────────────────────────────────────────────────────

const SPECIALTIES: SpecialtyRow[] = [
  { id: 1, name: "Cardiologia", slug: "cardiologia" },
  { id: 2, name: "Pediatria", slug: "pediatria" },
];
const PAGES: PageRow[] = [
  { id: 100, slug: "arritmias-quiz", title: "Arritmias", type: "h5p-quiz", specialty_id: 1, track_id: null, content_module_id: null, view: "quiz" },
  { id: 200, slug: "asma-quiz", title: "Asma", type: "h5p-quiz", specialty_id: 2, track_id: null, content_module_id: null, view: "quiz" },
];
const TOPICS: TopicRow[] = [
  { id: 1, name: "Arritmias", slug: "arritmias", specialty_id: 1, source_page_id: 100, incidence_count: 20, priority_tier: "A", is_pinned: false },
  { id: 2, name: "Asma", slug: "asma", specialty_id: 2, source_page_id: 200, incidence_count: 10, priority_tier: "B", is_pinned: false },
];
const TOPIC_CONTENT: TopicContentRow[] = [
  { topic_id: 1, resource_type: "quiz", page_id: 100, question_filter: null },
  { topic_id: 2, resource_type: "quiz", page_id: 200, question_filter: null },
];

function emptySignals(over: Partial<Signals> = {}): Signals {
  return {
    quizAttempts: [], lessonCompletions: [], reviewDueToday: 0,
    lessonsByPageId: new Map(), pauses: [],
    questionCountsByPageId: new Map([[100, 20], [200, 10]]),
    ...over,
  };
}
function prefs(over: Partial<StudyPlanPrefs> = {}): StudyPlanPrefs {
  return { ...defaultPrefs(), ...over };
}
function run(args: {
  prefs?: Partial<StudyPlanPrefs>;
  signals?: Partial<Signals>;
  testDate?: string | null;
  topics?: TopicRow[];
  topicContent?: TopicContentRow[];
  pages?: PageRow[];
}) {
  return derivePlan({
    prefs: prefs(args.prefs),
    cohort: { test_date: args.testDate === undefined ? "2027-01-15" : args.testDate },
    specialties: SPECIALTIES,
    pages: args.pages ?? PAGES,
    topics: args.topics ?? TOPICS,
    topicContent: args.topicContent ?? TOPIC_CONTENT,
    signals: emptySignals(args.signals),
  });
}

// ── P0-1: the student's day ──────────────────────────────────────────────────

test("progressToday counts a 21:30 BRT session as TODAY, not tomorrow", () => {
  const plan = withFrozenTime(EVENING_BRT, () =>
    run({ signals: { quizAttempts: [
      // 2026-07-29T00:30Z = 21:30 BRT on the 28th — the exact window the bug ate.
      { specialty_id: 1, is_correct: true, created_at: "2026-07-29T00:30:00Z", page_id: 100, question_id: 1 },
      { specialty_id: 1, is_correct: true, created_at: "2026-07-28T14:00:00Z", page_id: 100, question_id: 2 },
    ] } }));
  assert.equal(plan.progressToday.questionsAnswered, 2);
  assert.equal(plan.progressToday.specialtiesTouched, 1);
});

test("progressToday excludes yesterday's late session", () => {
  const plan = withFrozenTime(MORNING_BRT, () =>
    run({ signals: { quizAttempts: [
      { specialty_id: 1, is_correct: true, created_at: "2026-07-28T02:00:00Z", page_id: 100, question_id: 1 }, // 23:00 BRT on the 27th
    ] } }));
  assert.equal(plan.progressToday.questionsAnswered, 0);
});

test("availability uses the Brazilian weekday (Tuesday-only student at 22:00 BRT)", () => {
  const tuesdayOnly = 1 << 2;
  const plan = withFrozenTime(EVENING_BRT, () => run({ prefs: { available_days: tuesdayOnly } }));
  assert.equal(plan.paused, false, "still Tuesday in Brazil — must not be paused");
});

test("availability pauses on a genuinely unavailable day", () => {
  const mondayOnly = 1 << 1;
  const plan = withFrozenTime(EVENING_BRT, () => run({ prefs: { available_days: mondayOnly } }));
  assert.equal(plan.paused, true);
  assert.equal(plan.pauseReason?.type, "weekly_off");
  assert.equal(plan.pauseReason?.type === "weekly_off" ? plan.pauseReason.dayName : null, "terça");
  assert.equal(plan.nextAvailableDate, "2026-08-03"); // next Monday
});

test("recurring off-day (plantão) takes precedence and reports the next open day", () => {
  const plan = withFrozenTime(MORNING_BRT, () =>
    run({ prefs: { available_days: 127, recurring_off_days: 1 << 2 } }));
  assert.equal(plan.paused, true);
  assert.equal(plan.pauseReason?.type, "recurring_off");
  assert.equal(plan.nextAvailableDate, "2026-07-29");
});

test("date-range pause wins over everything", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({ signals: { pauses: [
    { pause_from: "2026-07-27", pause_until: "2026-08-02", reason: "Férias" },
  ] } }));
  assert.equal(plan.paused, true);
  assert.equal(plan.pauseReason?.type, "date_range");
  assert.equal(plan.pauseReason?.type === "date_range" ? plan.pauseReason.label : null, "Férias");
  assert.equal(plan.items.length, 0);
});

test("no available days at all: paused with no resume date, never a crash", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({ prefs: { available_days: 0 } }));
  assert.equal(plan.paused, true);
  assert.equal(plan.nextAvailableDate, null);
});

test("daysToExam is computed on Brazilian days", () => {
  const plan = withFrozenTime(EVENING_BRT, () => run({ testDate: "2026-09-13" }));
  assert.equal(plan.daysToExam, 47); // 2026-07-28 → 2026-09-13 (BRT day, not UTC's 46)
  assert.equal(plan.phase, "intensification"); // 47 <= intensification_start_days (60)
});

test("phase boundaries: taper <=14, intensification <=60", () => {
  assert.equal(withFrozenTime(MORNING_BRT, () => run({ testDate: "2026-08-11" })).phase, "taper");          // 14
  assert.equal(withFrozenTime(MORNING_BRT, () => run({ testDate: "2026-08-12" })).phase, "intensification"); // 15
  assert.equal(withFrozenTime(MORNING_BRT, () => run({ testDate: "2026-09-26" })).phase, "intensification"); // 60
  assert.equal(withFrozenTime(MORNING_BRT, () => run({ testDate: "2026-09-27" })).phase, "foundation");      // 61
});

test("temp_intensity expires on the Brazilian day, not the UTC one", () => {
  const plan = withFrozenTime(EVENING_BRT, () =>
    run({ prefs: { intensity: "intenso", temp_intensity: "leve", temp_intensity_until: "2026-07-28" } }));
  assert.equal(plan.intensity, "leve", "still valid through the 28th in Brazil");
  const expired = withFrozenTime(MORNING_BRT, () =>
    run({ prefs: { intensity: "intenso", temp_intensity: "leve", temp_intensity_until: "2026-07-27" } }));
  assert.equal(expired.intensity, "intenso");
});

// ── P0-3: mastery, not one-and-done ──────────────────────────────────────────

test("a single answered question does NOT retire the topic", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({ signals: { quizAttempts: [
    { specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: 1 },
  ] } }));
  const quiz = plan.items.filter((i) => i.kind === "quiz");
  assert.equal(quiz.some((i) => i.pageId === 100), true, "page 100 must still be scheduled");
});

test("a partially answered topic is shown as resumable with real progress", () => {
  const attempts = Array.from({ length: 8 }, (_, i) => ({
    specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  }));
  const plan = withFrozenTime(MORNING_BRT, () => run({ signals: { quizAttempts: attempts } }));
  const item = plan.items.find((i) => i.pageId === 100)!;
  assert.ok(item, "topic still scheduled");
  assert.match(item.subtitle, /8 de 20 questões/);
  assert.equal(item.reason, "Retome de onde parou neste tema");
});

test("a mastered page IS retired", () => {
  const attempts = Array.from({ length: 20 }, (_, i) => ({
    specialty_id: 1, is_correct: i < 15, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  })); // 15/20 = 75%
  const plan = withFrozenTime(MORNING_BRT, () => run({ signals: { quizAttempts: attempts } }));
  assert.equal(plan.items.some((i) => i.pageId === 100), false);
  assert.equal(plan.items.some((i) => i.pageId === 200), true, "other topics keep flowing");
});

test("full coverage below 70% keeps the topic in rotation", () => {
  const attempts = Array.from({ length: 20 }, (_, i) => ({
    specialty_id: 1, is_correct: i < 10, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  })); // 50%
  const plan = withFrozenTime(MORNING_BRT, () => run({ signals: { quizAttempts: attempts } }));
  assert.equal(plan.items.some((i) => i.pageId === 100), true);
});

test("grinding one question 20 times does not fake mastery", () => {
  const attempts = Array.from({ length: 20 }, (_, i) => ({
    specialty_id: 1, is_correct: true, created_at: `2026-07-20T10:${String(i).padStart(2, "0")}:00Z`,
    page_id: 100, question_id: 3,
  }));
  const plan = withFrozenTime(MORNING_BRT, () => run({ signals: { quizAttempts: attempts } }));
  assert.equal(plan.items.some((i) => i.pageId === 100), true);
});

test("falls back to incidence_count when the question-count view is unavailable", () => {
  const attempts = Array.from({ length: 20 }, (_, i) => ({
    specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  }));
  const plan = withFrozenTime(MORNING_BRT, () =>
    run({ signals: { quizAttempts: attempts, questionCountsByPageId: new Map() } }));
  assert.equal(plan.items.some((i) => i.pageId === 100), false, "20 >= incidence_count 20 at 100%");
});

test("topics sharing one quiz page produce exactly one item", () => {
  const shared: TopicRow[] = [
    { id: 1, name: "Próstata", slug: "prostata", specialty_id: 1, source_page_id: 100, incidence_count: 6, priority_tier: "B", is_pinned: false },
    { id: 2, name: "Bexiga", slug: "bexiga", specialty_id: 1, source_page_id: 100, incidence_count: 4, priority_tier: "C", is_pinned: false },
    { id: 3, name: "Fimose", slug: "fimose", specialty_id: 1, source_page_id: 100, incidence_count: 2, priority_tier: "D", is_pinned: false },
  ];
  const content: TopicContentRow[] = shared.map((t) => ({ topic_id: t.id, resource_type: "quiz", page_id: 100, question_filter: null }));
  const plan = withFrozenTime(MORNING_BRT, () => run({ topics: shared, topicContent: content }));
  assert.equal(plan.items.filter((i) => i.pageId === 100).length, 1);
});

// ── P0-2: content-type gating ────────────────────────────────────────────────

test("simulado appears in intensification when opted in", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({ testDate: "2026-09-01" })); // 35 days
  assert.equal(plan.phase, "intensification");
  assert.equal(plan.items.some((i) => i.kind === "simulado"), true);
});

test("the legacy DB default (no 'simulado') silences the simulado item", () => {
  // Exactly what the wrong column default produced, before the schema patch.
  const legacy: ContentType[] = ["quiz", "lesson", "audio", "flashcards", "memorecards"];
  const plan = withFrozenTime(MORNING_BRT, () =>
    run({ testDate: "2026-09-01", prefs: { preferred_content_types: legacy } }));
  assert.equal(plan.items.some((i) => i.kind === "simulado"), false,
    "regression guard: this is exactly what the wrong column default produced");
});

test("unticking every content type yields an empty plan, not a crash", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({ prefs: { preferred_content_types: [] } }));
  assert.equal(plan.items.length, 0);
  assert.equal(plan.paused, false);
});

// ── General robustness ───────────────────────────────────────────────────────

test("no cohort test_date: no countdown, foundation phase, plan still built", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({ testDate: null }));
  assert.equal(plan.daysToExam, null);
  assert.equal(plan.phase, "foundation");
  assert.ok(plan.items.length > 0);
});

test("excluded specialties never appear", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({ prefs: { excluded_specialty_ids: [1] } }));
  assert.equal(plan.items.some((i) => i.specialtyId === 1), false);
});

test("review item is capped by flashcard_daily_cap and leads in taper", () => {
  const plan = withFrozenTime(MORNING_BRT, () =>
    run({ testDate: "2026-08-05", signals: { reviewDueToday: 300 }, prefs: { flashcard_daily_cap: 50 } }));
  assert.equal(plan.phase, "taper");
  assert.match(plan.items[0].title, /^50 itens para revisar/);
  assert.match(plan.items[0].subtitle, /300 devidos · limite diário: 50/);
});

test("every emitted item has a usable href and a positive duration", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({ testDate: "2026-09-01", signals: { reviewDueToday: 5 } }));
  assert.ok(plan.items.length > 0);
  for (const it of plan.items) {
    assert.match(it.href, /^\/app\//, `bad href: ${it.href}`);
    assert.ok(!it.href.includes("undefined"), `href contains undefined: ${it.href}`);
    assert.ok(it.estimatedMinutes > 0, `non-positive minutes on ${it.title}`);
    assert.ok(it.title.length > 0 && it.subtitle.length > 0);
  }
  assert.equal(
    plan.totalEstimatedMinutes,
    plan.items.reduce((s, i) => s + i.estimatedMinutes, 0),
  );
});
