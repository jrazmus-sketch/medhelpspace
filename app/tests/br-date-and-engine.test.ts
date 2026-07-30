/**
 * lib/br-date.ts + the study-plan engine's use of it.
 *
 * The product's "today" is the STUDENT's day in Brazil, never the server's.
 * Vercel runs UTC, so between 21:00 and 23:59 BRT the two disagree — and every
 * planner date defect lived in that window.
 *
 * These must pass under ANY server timezone. `npm test` runs them under
 * whatever the machine has; before changing anything in br-date.ts, run the
 * matrix too:
 *
 *   TZ=UTC npm test                 # what Vercel actually runs
 *   TZ=America/Sao_Paulo npm test   # server and audience agree
 *   TZ=Asia/Tokyo npm test          # positive offset
 *   TZ=America/Los_Angeles npm test # negative offset
 *   TZ=Pacific/Kiritimati npm test  # UTC+14, the extreme
 *
 * The last test in this file scans the source for reintroduced UTC-day
 * expressions — it is the guard that catches the copy someone pastes next month.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withFrozenTime } from "./helpers/freeze-time";
import {
  todayKeyBR, toDateKeyBR, dayOfWeekBR, dayOfWeekForKey,
  addDaysKey, diffDaysKey, startOfDayBRIso, endOfDayBRIso,
} from "@/lib/br-date";
import {
  derivePlan, defaultPrefs, buildPageProgress, isPageMastered,
  type StudyPlanPrefs, type Signals, type TopicRow, type PageRow,
  type TopicContentRow, type SpecialtyRow,
} from "@/lib/study-plan/derive";


// ── A1. The exact UTC rollover boundary, to the millisecond ──────────────────

test("A1 rollover: 02:59:59.999Z is still yesterday in Brazil; 03:00:00.000Z is today", () => {
  assert.equal(todayKeyBR(new Date("2026-07-29T02:59:59.999Z")), "2026-07-28");
  assert.equal(todayKeyBR(new Date("2026-07-29T03:00:00.000Z")), "2026-07-29");
  assert.equal(todayKeyBR(new Date("2026-07-29T03:00:00.001Z")), "2026-07-29");
  // 00:00 and 21:00 UTC — the two other "interesting" clock positions.
  assert.equal(todayKeyBR(new Date("2026-07-29T00:00:00Z")), "2026-07-28");
  assert.equal(todayKeyBR(new Date("2026-07-28T21:00:00Z")), "2026-07-28");
});

test("A1b 23:59:59.999 BRT maps to the Brazilian day, not the UTC one", () => {
  // 2026-07-28 23:59:59.999 BRT === 2026-07-29 02:59:59.999 Z
  const inst = new Date("2026-07-29T02:59:59.999Z");
  assert.equal(toDateKeyBR(inst), "2026-07-28");
  assert.notEqual(inst.toISOString().slice(0, 10), toDateKeyBR(inst)); // the bug being fixed
});

// ── A2. toDateKeyBR input-shape fuzz ────────────────────────────────────────

test("A2 toDateKeyBR accepts every shape Postgres/PostgREST can emit", () => {
  const cases: [string | Date, string][] = [
    ["2026-07-28", "2026-07-28"],                              // bare DATE column
    ["2026-07-29T00:30:00+00:00", "2026-07-28"],               // PostgREST timestamptz
    ["2026-07-29T00:30:00Z", "2026-07-28"],                    // Z form
    ["2026-07-28T23:10:00.123456+00:00", "2026-07-28"],        // 6-digit micros
    ["2026-07-29T00:30:00.123456+00:00", "2026-07-28"],        // micros across the boundary
    ["2026-07-28T21:30:00-03:00", "2026-07-28"],               // already -03:00
    ["2026-07-29T09:30:00+09:00", "2026-07-28"],               // a +09:00 offset instant
    [new Date("2026-07-29T00:30:00Z"), "2026-07-28"],          // a real Date object
  ];
  for (const [input, expected] of cases) {
    assert.equal(toDateKeyBR(input), expected, `input: ${String(input)}`);
  }
});

test("A2b toDateKeyBR never throws and never returns a truthy wrong key on garbage", () => {
  // "2026-13-45" is covered separately in planner-regressions.test.ts (D1):
  // it is well-SHAPED but not a real date, which needed its own guard.
  for (const junk of ["", "not-a-date", "T00:00:00Z", "null"]) {
    assert.equal(toDateKeyBR(junk), "", `junk: ${junk}`);
  }
  assert.equal(toDateKeyBR(new Date(NaN)), "");
});

test("A2c an unparseable created_at can never be counted as 'today'", () => {
  // "" never equals a real YYYY-MM-DD key, so a corrupt row silently drops out
  // of progressToday instead of inflating it.
  assert.notEqual(toDateKeyBR("garbage"), todayKeyBR(new Date("2026-07-28T13:00:00Z")));
});

// ── A3. Key arithmetic at calendar seams ────────────────────────────────────

test("A3 addDaysKey across month / year / leap / century seams", () => {
  assert.equal(addDaysKey("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysKey("2027-01-01", -1), "2026-12-31");
  assert.equal(addDaysKey("2028-02-28", 1), "2028-02-29");   // leap
  assert.equal(addDaysKey("2028-02-29", 1), "2028-03-01");
  assert.equal(addDaysKey("2100-02-28", 1), "2100-03-01");   // NOT a leap year
  assert.equal(addDaysKey("2026-07-28", 0), "2026-07-28");
  assert.equal(addDaysKey("2026-01-31", 1), "2026-02-01");
  assert.equal(addDaysKey("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysKey("2026-07-28", 365), "2027-07-28");
});

test("A3b addDaysKey is TZ-independent (parses and formats in UTC throughout)", () => {
  // Regression guard: a `new Date(key)` + local getters implementation would
  // shift under TZ=Pacific/Kiritimati (UTC+14) or America/Los_Angeles (UTC-8).
  assert.equal(addDaysKey("2026-01-01", -1), "2025-12-31");
  assert.equal(addDaysKey("2026-12-31", 1), "2027-01-01");
});

test("A3c diffDaysKey is exact across DST-free and DST-bearing spans", () => {
  assert.equal(diffDaysKey("2026-01-01", "2026-12-31"), 364);
  assert.equal(diffDaysKey("2028-01-01", "2029-01-01"), 366);   // leap year
  // Northern-hemisphere DST transitions in the server zone must not leak in.
  assert.equal(diffDaysKey("2026-03-01", "2026-04-01"), 31);
  assert.equal(diffDaysKey("2026-10-15", "2026-11-15"), 31);
  assert.equal(diffDaysKey("2026-12-31", "2026-01-01"), -364);
});

test("A3d dayOfWeekForKey is stable across seams and centuries", () => {
  assert.equal(dayOfWeekForKey("2026-01-01"), 4);  // Thursday
  assert.equal(dayOfWeekForKey("2026-12-31"), 4);  // Thursday
  assert.equal(dayOfWeekForKey("2028-02-29"), 2);  // Tuesday
  assert.equal(dayOfWeekForKey("2000-01-01"), 6);  // Saturday
  // round-trip: 7 days later is always the same weekday
  for (const k of ["2026-07-28", "2026-12-28", "2028-02-22"]) {
    assert.equal(dayOfWeekForKey(addDaysKey(k, 7)), dayOfWeekForKey(k));
  }
});

test("A3e dayOfWeekBR uses the Brazilian day even at 22:00 BRT", () => {
  assert.equal(dayOfWeekBR(new Date("2026-07-29T01:00:00Z")), 2); // Tue in BR
  assert.equal(new Date("2026-07-29T01:00:00Z").getUTCDay(), 3);  // Wed in UTC
});

// ── A4. Postgres range bounds ───────────────────────────────────────────────

test("A4 start/endOfDayBRIso bracket exactly 24h and are half-open", () => {
  const s = startOfDayBRIso("2026-07-28");
  const e = endOfDayBRIso("2026-07-28");
  assert.equal(s, "2026-07-28T03:00:00.000Z");
  assert.equal(e, "2026-07-29T03:00:00.000Z");
  assert.equal(Date.parse(e) - Date.parse(s), 86_400_000);
  // Every instant in [s, e) must map back to the same day key…
  assert.equal(toDateKeyBR(s), "2026-07-28");
  assert.equal(toDateKeyBR(new Date(Date.parse(e) - 1).toISOString()), "2026-07-28");
  // …and the exclusive upper bound must belong to the next day.
  assert.equal(toDateKeyBR(e), "2026-07-29");
});

test("A4b bounds round-trip for every day of a full post-2019 year", () => {
  let key = "2026-01-01";
  for (let i = 0; i < 365; i++) {
    assert.equal(toDateKeyBR(startOfDayBRIso(key)), key, `start ${key}`);
    assert.equal(toDateKeyBR(endOfDayBRIso(key)), addDaysKey(key, 1), `end ${key}`);
    key = addDaysKey(key, 1);
  }
});

// ── A5. Long-horizon consistency of the module against itself ───────────────

test("A5 todayKeyBR agrees with toDateKeyBR for 2000 sampled instants", () => {
  let t = Date.parse("2026-01-01T00:00:00Z");
  for (let i = 0; i < 2000; i++) {
    const d = new Date(t);
    assert.equal(todayKeyBR(d), toDateKeyBR(d));
    t += 4 * 3600 * 1000 + 971_000; // ~4h + a prime-ish offset, sweeps all hours
  }
});

test("A5b addDaysKey/diffDaysKey are mutual inverses over a year", () => {
  let key = "2026-06-01";
  for (let i = 0; i < 400; i++) {
    const next = addDaysKey(key, 1);
    assert.equal(diffDaysKey(key, next), 1, `${key} -> ${next}`);
    assert.equal(addDaysKey(next, -1), key);
    key = next;
  }
});

// ── A6. nextDayMatchingMask 30-day loop across a year end ───────────────────

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
function run(args: {
  prefs?: Partial<StudyPlanPrefs>; signals?: Partial<Signals>;
  testDate?: string | null; topics?: TopicRow[];
  topicContent?: TopicContentRow[]; pages?: PageRow[];
}) {
  return derivePlan({
    prefs: { ...defaultPrefs(), ...args.prefs },
    cohort: { test_date: args.testDate === undefined ? "2027-01-15" : args.testDate },
    specialties: SPECIALTIES,
    pages: args.pages ?? PAGES,
    topics: args.topics ?? TOPICS,
    topicContent: args.topicContent ?? TOPIC_CONTENT,
    signals: emptySignals(args.signals),
  });
}

test("A6 resume date crosses a year end correctly (Sunday-only student, 28 Dec)", () => {
  // 2026-12-28 is a Monday. A Sunday-only student resumes 2027-01-03.
  const plan = withFrozenTime("2026-12-28T15:00:00Z", () =>
    run({ prefs: { available_days: 1 << 0 } }));
  assert.equal(plan.paused, true);
  assert.equal(plan.nextAvailableDate, "2027-01-03");
  assert.equal(dayOfWeekForKey(plan.nextAvailableDate!), 0);
});

test("A6b resume date skips a pause range that itself spans the year end", () => {
  const plan = withFrozenTime("2026-12-28T15:00:00Z", () =>
    run({
      prefs: { available_days: 1 << 0 },
      signals: { pauses: [{ pause_from: "2026-12-30", pause_until: "2027-01-05", reason: "Férias" }] },
    }));
  // Inside the pause range → date_range pause wins, resume the day after.
  assert.equal(plan.pauseReason?.type, "weekly_off"); // 28 Dec is outside the range
  assert.equal(plan.nextAvailableDate, "2027-01-10"); // 3 Jan is inside the pause → next Sunday
});

test("A6c 30-day search window: a student available only on a day >30 days out gets null", () => {
  const plan = withFrozenTime("2026-12-28T15:00:00Z", () =>
    run({
      prefs: { available_days: 1 << 0 },
      signals: { pauses: [{ pause_from: "2026-12-29", pause_until: "2027-03-01", reason: "Licença" }] },
    }));
  assert.equal(plan.paused, true);
  assert.equal(plan.nextAvailableDate, null, "must degrade to null, never loop or crash");
});

test("A6d date-range pause at its exact inclusive edges", () => {
  const at = (iso: string, from: string, until: string) =>
    withFrozenTime(iso, () => run({ signals: { pauses: [{ pause_from: from, pause_until: until, reason: null }] } }));
  // 2026-07-29T01:00Z === 2026-07-28 22:00 BRT.
  assert.equal(at("2026-07-29T01:00:00Z", "2026-07-28", "2026-07-28").paused, true,
    "a one-day pause set for the 28th must still hold at 22:00 BRT on the 28th");
  assert.equal(at("2026-07-29T01:00:00Z", "2026-07-27", "2026-07-27").paused, false);
  assert.equal(at("2026-07-29T03:30:00Z", "2026-07-28", "2026-07-28").paused, false,
    "and must lapse once Brazil is on the 29th");
});

// ── A7. skipToday round-trip ────────────────────────────────────────────────

test("A7 'pular hoje' at 22:00 BRT pauses TODAY, not tomorrow", () => {
  // Reproduces actions/study-plan.ts skipToday(): pause_from = pause_until = todayKeyBR().
  const key = withFrozenTime("2026-07-29T01:00:00Z", () => todayKeyBR());
  assert.equal(key, "2026-07-28");
  const plan = withFrozenTime("2026-07-29T01:00:00Z", () =>
    run({ signals: { pauses: [{ pause_from: key, pause_until: key, reason: "Folga de hoje" }] } }));
  assert.equal(plan.paused, true, "the skip must take effect immediately");
  assert.equal(plan.nextAvailableDate, "2026-07-29");
});

// ── A8. Mastery invariants that DO hold ─────────────────────────────────────

test("A8 isPageMastered boundary: exactly 70% masters, one below does not", () => {
  assert.equal(isPageMastered({ answered: 10, correct: 7 }, 10), true);
  assert.equal(isPageMastered({ answered: 10, correct: 6 }, 10), false);
  assert.equal(isPageMastered({ answered: 3, correct: 2 }, 3), false);  // 66.7%
  assert.equal(isPageMastered({ answered: 20, correct: 14 }, 20), true); // 70.0%
});

test("A8b isPageMastered never divides by zero and never NaNs", () => {
  // NOTE: NaN is deliberately absent — it slips the guard. See defects.test.ts D2.
  for (const total of [0, -1, -100]) {
    assert.equal(isPageMastered({ answered: 5, correct: 5 }, total), false, `total=${total}`);
  }
  assert.equal(isPageMastered({ answered: 0, correct: 0 }, 10), false);
  assert.equal(isPageMastered(undefined, 10), false);
});

test("A8c buildPageProgress: latest attempt wins in BOTH directions", () => {
  const right2wrong = buildPageProgress([
    { specialty_id: 1, is_correct: true,  created_at: "2026-07-20T10:00:00Z", page_id: 10, question_id: 1 },
    { specialty_id: 1, is_correct: false, created_at: "2026-07-21T10:00:00Z", page_id: 10, question_id: 1 },
  ]);
  assert.deepEqual(right2wrong.get(10), { answered: 1, correct: 0 });
  // …and order of the input array must not matter when timestamps differ.
  const reversed = buildPageProgress([
    { specialty_id: 1, is_correct: false, created_at: "2026-07-21T10:00:00Z", page_id: 10, question_id: 1 },
    { specialty_id: 1, is_correct: true,  created_at: "2026-07-20T10:00:00Z", page_id: 10, question_id: 1 },
  ]);
  assert.deepEqual(reversed.get(10), { answered: 1, correct: 0 });
});

test("A8d buildPageProgress partitions strictly by page_id", () => {
  const p = buildPageProgress([
    { specialty_id: 1, is_correct: true,  created_at: "2026-07-20T10:00:00Z", page_id: 10, question_id: 1 },
    { specialty_id: 1, is_correct: false, created_at: "2026-07-20T10:00:00Z", page_id: 20, question_id: 1 },
  ]);
  assert.deepEqual(p.get(10), { answered: 1, correct: 1 });
  assert.deepEqual(p.get(20), { answered: 1, correct: 0 });
});

test("A8e lexicographic created_at comparison is correct for PostgREST's format", () => {
  // buildPageProgress compares created_at as STRINGS. Verify that is sound for
  // fractional-second precision, which PostgREST emits with variable width.
  const later = (a: string, b: string) => {
    const p = buildPageProgress([
      { specialty_id: 1, is_correct: false, created_at: a, page_id: 1, question_id: 1 },
      { specialty_id: 1, is_correct: true,  created_at: b, page_id: 1, question_id: 1 },
    ]);
    return p.get(1)!.correct === 1; // true when b won
  };
  assert.equal(later("2026-07-20T10:00:00+00:00",      "2026-07-20T10:00:00.5+00:00"), true);
  assert.equal(later("2026-07-20T10:00:00.05+00:00",   "2026-07-20T10:00:00.5+00:00"), true);
  assert.equal(later("2026-07-20T10:00:00.123456+00:00", "2026-07-20T10:00:01+00:00"), true);
  assert.equal(later("2026-07-20T09:59:59+00:00",      "2026-07-20T10:00:00+00:00"), true);
});

// ── A9. Structural robustness of derivePlan ─────────────────────────────────

test("A9 a topic whose quiz page is missing from `pages` is skipped, not crashed on", () => {
  const orphan: TopicRow[] = [
    { id: 9, name: "Órfão", slug: "orfao", specialty_id: 1, source_page_id: 99999, incidence_count: 50, priority_tier: "A", is_pinned: false },
    ...TOPICS,
  ];
  const content: TopicContentRow[] = [
    { topic_id: 9, resource_type: "quiz", page_id: 99999, question_filter: null },
    ...TOPIC_CONTENT,
  ];
  const plan = withFrozenTime("2026-07-28T13:00:00Z", () => run({ topics: orphan, topicContent: content }));
  assert.equal(plan.items.some((i) => i.href.includes("undefined")), false);
  assert.equal(plan.items.some((i) => i.pageId === 99999), false);
  // and it must not consume a scheduling slot — the real topics still surface
  assert.equal(plan.items.some((i) => i.pageId === 100), true);
  assert.equal(plan.items.some((i) => i.pageId === 200), true);
});

test("A9b a topic pointing at a specialty that does not exist is skipped", () => {
  const ghost: TopicRow[] = [
    { id: 8, name: "Fantasma", slug: "fantasma", specialty_id: 777, source_page_id: 100, incidence_count: 99, priority_tier: "A", is_pinned: false },
    ...TOPICS,
  ];
  const plan = withFrozenTime("2026-07-28T13:00:00Z", () =>
    run({ topics: ghost, topicContent: [{ topic_id: 8, resource_type: "quiz", page_id: 100, question_filter: null }, ...TOPIC_CONTENT] }));
  assert.equal(plan.items.some((i) => i.specialtyId === 777), false);
  assert.equal(plan.items.some((i) => i.title === "Fantasma"), false);
  assert.equal(plan.items.some((i) => i.pageId === 100), true, "the real Arritmias topic still emits");
});

test("A9c a topic with specialty_id null never reaches the ranker", () => {
  const nullSpec: TopicRow[] = [
    { id: 7, name: "SemEsp", slug: "semesp", specialty_id: null, source_page_id: 100, incidence_count: 99, priority_tier: "A", is_pinned: false },
    ...TOPICS,
  ];
  const plan = withFrozenTime("2026-07-28T13:00:00Z", () => run({ topics: nullSpec }));
  assert.equal(plan.items.some((i) => i.title === "SemEsp"), false);
});

test("A9d empty universes produce an empty plan, never a throw", () => {
  const plan = withFrozenTime("2026-07-28T13:00:00Z", () =>
    derivePlan({
      prefs: defaultPrefs(), cohort: null, specialties: [], pages: [],
      topics: [], topicContent: [], signals: emptySignals(),
    }));
  assert.equal(plan.items.length, 0);
  assert.equal(plan.weakestSpecialties.length, 0);
  assert.equal(plan.daysToExam, null);
});

test("A9e an exam date already in the past clamps daysToExam to 0 and tapers", () => {
  const plan = withFrozenTime("2026-07-28T13:00:00Z", () => run({ testDate: "2026-01-01" }));
  assert.equal(plan.daysToExam, 0);
  assert.equal(plan.phase, "taper");
});

test("A9f test_date given as a full timestamp is tolerated", () => {
  const a = withFrozenTime("2026-07-28T13:00:00Z", () => run({ testDate: "2026-09-13" }));
  const b = withFrozenTime("2026-07-28T13:00:00Z", () => run({ testDate: "2026-09-13T00:00:00+00:00" }));
  assert.equal(a.daysToExam, b.daysToExam);
  assert.equal(a.daysToExam, 47);
});

// ── A10. The plan is deterministic for a fixed input ────────────────────────

test("A10 derivePlan is pure: same input, byte-identical output", () => {
  const once = withFrozenTime("2026-07-28T13:00:00Z", () => run({ testDate: "2026-09-01", signals: { reviewDueToday: 12 } }));
  const twice = withFrozenTime("2026-07-28T13:00:00Z", () => run({ testDate: "2026-09-01", signals: { reviewDueToday: 12 } }));
  assert.deepEqual(JSON.parse(JSON.stringify(once)), JSON.parse(JSON.stringify(twice)));
});

test("A10b the plan does NOT change across the 21:00 BRT boundary within one day", () => {
  const morning = withFrozenTime("2026-07-28T13:00:00Z", () => run({ testDate: "2026-09-01" }));
  const evening = withFrozenTime("2026-07-29T01:00:00Z", () => run({ testDate: "2026-09-01" }));
  assert.equal(morning.daysToExam, evening.daysToExam,
    "the countdown must not tick down three hours early");
  assert.deepEqual(morning.items.map((i) => i.href), evening.items.map((i) => i.href));
});

// ── Source guard ─────────────────────────────────────────────────────────────
//
// The date defects were not one bug: the same UTC-day expression was copy-pasted
// across nine files, and each copy produced its own visible symptom. Asserting
// behaviour module-by-module cannot catch the tenth copy someone adds next
// month, so this scans the shipped source instead.
//
// If this fails: use lib/br-date.ts. See feedback in that module's header for why
// `new Date().toISOString().split("T")[0]` is never the student's day.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Files where "today" is student-visible and must be Brazilian. */
const GUARDED = [
  "lib/study-plan",
  "lib/review",
  "app/app/page.tsx",
  "app/app/relatorio",
  "app/app/plano",
  "actions/study-plan.ts",
  "components/content/flashcard-renderer.tsx",
  "app/api/cron/lifecycle-notifications",
];

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /toISOString\(\)\s*\.\s*split\("T"\)\[0\]/, why: "UTC calendar day — use todayKeyBR()/toDateKeyBR()" },
  { pattern: /created_at\s*\.\s*split\("T"\)\[0\]/, why: "buckets a timestamp on its UTC date — use toDateKeyBR()" },
  { pattern: /completed_at\s*\.\s*split\("T"\)\[0\]/, why: "buckets a timestamp on its UTC date — use toDateKeyBR()" },
  { pattern: /new Date\(\)\.getDay\(\)/, why: "server weekday — use dayOfWeekBR()" },
  { pattern: /new Date\(\)\.getHours\(\)/, why: "server hour — use hourBR()" },
  { pattern: /setHours\(0,\s*0,\s*0,\s*0\)/, why: "server-local midnight — use todayKeyBR()/startOfDayBRIso()" },
];

function walk(target: string): string[] {
  const full = path.join(SRC, target);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((entry) => walk(path.join(target, entry)));
}

test("no UTC-day derivations survive anywhere in the planner surface", () => {
  const offences: string[] = [];
  for (const target of GUARDED) {
    for (const file of walk(target)) {
      if (!/\.tsx?$/.test(file)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(line)) {
            const rel = path.relative(SRC, file).split(path.sep).join("/");
            offences.push(`${rel}:${i + 1} — ${why}\n    ${line.trim()}`);
          }
        }
      });
    }
  }
  assert.deepEqual(offences, [],
    `server-clock date derivation reintroduced:\n  ${offences.join("\n  ")}`);
});
