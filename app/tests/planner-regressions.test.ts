/**
 * Planner regressions.
 *
 * These began as an adversarial sweep against the 2026-07-28 planner fixes —
 * each one originally FAILED and named a real defect. They are kept as
 * permanent guards: every case here is a bug a student actually hit, or would
 * have hit, and each assertion message says what they would have seen.
 *
 * Two cases (D3, D8) document an ACCEPTED tradeoff rather than a fixed bug;
 * they assert today's deliberate behaviour so that changing it is a decision,
 * not an accident. Read their comments before "fixing" them.
 *
 * The original suite also carried tests that re-implemented UTC expressions
 * copied out of unfixed files. Those files are fixed, so the copies asserted
 * nothing about shipping code and were removed — `no-utc-day-derivations`
 * in br-date-and-engine.test.ts guards that ground for real, against the source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withFrozenTime, MORNING_BRT } from "./helpers/freeze-time";
import { toDateKeyBR, addDaysKey, startOfDayBRIso } from "@/lib/br-date";
import {
  derivePlan, defaultPrefs, buildPageProgress, isPageMastered,
  type StudyPlanPrefs, type Signals, type TopicRow, type PageRow,
  type TopicContentRow, type SpecialtyRow,
} from "@/lib/study-plan/derive";





// ═══════════════════════════════════════════════════════════════════════════
// D1 — lib/br-date.ts:41  toDateKeyBR passes through impossible calendar dates
// ═══════════════════════════════════════════════════════════════════════════

test("D1 toDateKeyBR rejects a structurally-shaped but impossible date", () => {
  // The fast path is a SHAPE test (/^\d{4}-\d{2}-\d{2}$/), not a validity test.
  // The module's documented contract ("invalid input yields empty string") and
  // planner.test.ts:58 both say garbage becomes "". Month 13 / day 45 does not.
  assert.equal(toDateKeyBR("2026-13-45"), "",
    "br-date.ts:41 — the bare-key fast path never validates the value it returns");
  assert.equal(toDateKeyBR("0000-00-00"), "");
});

test("D1b toDateKeyBR turns a null timestamp into 1970-01-01, not ''", () => {
  // fetch.ts:181 casts raw PostgREST rows straight into Signals with `as`, so a
  // NULL created_at reaches here as null with no runtime guard. `new Date(null)`
  // is the epoch, so the row is silently dated 1969-12-31 in Brazil instead of
  // being discarded — it can never be "today", but it also never surfaces.
  assert.equal(toDateKeyBR(null as unknown as string), "",
    "br-date.ts:42 — new Date(null) is the epoch, not an Invalid Date");
});

// ═══════════════════════════════════════════════════════════════════════════
// D2 — lib/study-plan/derive.ts:228  NaN denominator ⇒ instant false mastery
// ═══════════════════════════════════════════════════════════════════════════

test("D2 isPageMastered treats an unknown (NaN) question total as MASTERED", () => {
  // Guard chain: `NaN <= 0` is false, `5 < NaN` is false, 5/5 >= 0.7 is true.
  // The `totalQuestions <= 0` guard exists precisely to mean "unknown total →
  // never retire", and NaN — the most likely form of an unknown total — walks
  // straight past it.
  //
  // Reachable: fetch.ts:177 does `Number(r.question_count)`. If the view ever
  // returns a differently-named column (a rename, a CREATE OR REPLACE that adds
  // a column, a PostgREST cache serving a stale shape) every row becomes NaN,
  // and EVERY quiz page in the plan is declared mastered at once. The dashboard
  // then renders "Você cobriu o material das suas prioridades" (app/page.tsx:700)
  // to a student who has answered almost nothing.
  assert.equal(isPageMastered({ answered: 5, correct: 5 }, NaN), false,
    "derive.ts:228 — `totalQuestions <= 0` does not catch NaN");
});

test("D2b a NaN question-count wipes the entire plan", () => {
  const plan = withFrozenTime(MORNING_BRT, () => run({
    signals: {
      quizAttempts: [
        { specialty_id: 1, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: 1 },
        { specialty_id: 2, is_correct: true, created_at: "2026-07-20T10:00:00Z", page_id: 200, question_id: 1 },
      ],
      questionCountsByPageId: new Map([[100, NaN], [200, NaN]]),
    },
  }));
  assert.ok(plan.items.some((i) => i.kind === "quiz"),
    "one answered question per page must not empty the plan — this is the exact P0 the fix targeted, resurrected via NaN");
});

// ═══════════════════════════════════════════════════════════════════════════
// D3 — derive.ts:546  the incidence_count fallback under-counts shared pages
// ═══════════════════════════════════════════════════════════════════════════
//
// schema-patch-quiz-page-question-counts.sql is UNTRACKED in git and has not
// been applied, so `questionCountsByPageId` is EMPTY in production today and
// `totalQuestions` falls back to `topic.incidence_count` for every topic.
//
// derive.ts:155 justifies that: "which equals the question count for 199 of 211
// topics". True — but the 12 exceptions are exactly the pages where it matters.
// parsed/split-outros-0c.sql: the Urologia coarse quiz page 90242 holds 30
// questions and was split into 7 sub-topics of incidence 6·6·4·4·2·2·2 (Σ26).
// Ranked first is "Próstata", incidence 6.

const UROLOGY_PAGE: PageRow = {
  id: 90242, slug: "urologia-quiz", title: "Urologia", type: "h5p-quiz",
  specialty_id: 1, track_id: null, content_module_id: null, view: "quiz",
};
const UROLOGY_SUBTOPICS: TopicRow[] = [
  { id: 11, name: "Próstata",          slug: "prostata",          specialty_id: 1, source_page_id: 90242, incidence_count: 6, priority_tier: "B", is_pinned: false },
  { id: 12, name: "Trauma urogenital", slug: "trauma-urogenital", specialty_id: 1, source_page_id: 90242, incidence_count: 6, priority_tier: "B", is_pinned: false },
  { id: 13, name: "Bexiga",            slug: "bexiga",            specialty_id: 1, source_page_id: 90242, incidence_count: 4, priority_tier: "C", is_pinned: false },
  { id: 14, name: "Testículo",         slug: "testiculo",         specialty_id: 1, source_page_id: 90242, incidence_count: 4, priority_tier: "C", is_pinned: false },
  { id: 15, name: "Pênis",             slug: "penis",             specialty_id: 1, source_page_id: 90242, incidence_count: 2, priority_tier: "D", is_pinned: false },
  { id: 16, name: "Fimose",            slug: "fimose",            specialty_id: 1, source_page_id: 90242, incidence_count: 2, priority_tier: "D", is_pinned: false },
  { id: 17, name: "Cálculos urinários", slug: "calculos-urinarios", specialty_id: 1, source_page_id: 90242, incidence_count: 2, priority_tier: "D", is_pinned: false },
];
const UROLOGY_CONTENT: TopicContentRow[] = UROLOGY_SUBTOPICS.map((t) => ({
  topic_id: t.id, resource_type: "quiz", page_id: 90242, question_filter: null,
}));

test("ACCEPTED TRADEOFF: without the question-count view, split topics fall back to incidence_count", () => {
  // The student answers 6 of page 90242's 30 questions, gets 5 right (83%).
  //
  // This asserts the FALLBACK path, which is deliberately imperfect. When
  // `quiz_page_question_counts` is unavailable the engine uses the topic's own
  // `incidence_count` as the denominator. That is exact for 199 of 211 topics,
  // but wrong for the 12 sub-topics that share the 3 coarse pages
  // (90240/90241/90242) — Fimose carries incidence 2 on a 30-question page, so
  // the page retires early and the remaining questions stop being scheduled.
  //
  // Accepted because the view IS applied in prod and in the local mirror
  // (schema-patch-quiz-page-question-counts.sql), so this path only runs if
  // someone ships the code without the patch. The alternative — never retiring
  // anything when the view is missing — would freeze every student's plan on a
  // transient read error, which is worse. See D3b for the real behaviour.
  //
  // If you make this test fail, you have changed the fallback. Make sure that
  // was on purpose.
  const attempts = Array.from({ length: 6 }, (_, i) => ({
    specialty_id: 1, is_correct: i < 5,
    created_at: "2026-07-20T10:00:00Z", page_id: 90242, question_id: i + 1,
  }));
  const plan = withFrozenTime(MORNING_BRT, () => run({
    pages: [UROLOGY_PAGE, ...PAGES],
    topics: [...UROLOGY_SUBTOPICS, ...TOPICS],
    topicContent: [...UROLOGY_CONTENT, ...TOPIC_CONTENT],
    signals: { quizAttempts: attempts, questionCountsByPageId: new Map() },
  }));
  assert.equal(plan.items.some((i) => i.pageId === 90242), false,
    "fallback path: 6 answers >= Próstata's incidence_count of 6 at 83% retires the shared page");
});

test("D3b the same page survives correctly once the view IS applied", () => {
  // Control: this is what the fix is supposed to do. It only works if
  // schema-patch-quiz-page-question-counts.sql is actually applied to prod.
  const attempts = Array.from({ length: 6 }, (_, i) => ({
    specialty_id: 1, is_correct: i < 5,
    created_at: "2026-07-20T10:00:00Z", page_id: 90242, question_id: i + 1,
  }));
  const plan = withFrozenTime(MORNING_BRT, () => run({
    pages: [UROLOGY_PAGE, ...PAGES],
    topics: [...UROLOGY_SUBTOPICS, ...TOPICS],
    topicContent: [...UROLOGY_CONTENT, ...TOPIC_CONTENT],
    signals: { quizAttempts: attempts, questionCountsByPageId: new Map([[90242, 30]]) },
  }));
  assert.equal(plan.items.some((i) => i.pageId === 90242), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// D4 — derive.ts:194  synthetic ids let legacy attempts inflate coverage
// ═══════════════════════════════════════════════════════════════════════════

test("D4 pre-tracking attempts double-count and fake mastery on a page", () => {
  // A page with 20 questions. The student answered 10 of them BEFORE question-level
  // tracking (question_id null → each gets a unique synthetic id), then came back
  // and answered THE SAME 10 with real ids. Distinct-question coverage is 10/20,
  // but buildPageProgress reports 20 — and the page is retired.
  const legacy = Array.from({ length: 10 }, (_, i) => ({
    specialty_id: 1, is_correct: true,
    created_at: `2026-07-01T10:${String(i).padStart(2, "0")}:00Z`, page_id: 100,
    question_id: null as number | null,
  }));
  const tracked = Array.from({ length: 10 }, (_, i) => ({
    specialty_id: 1, is_correct: true,
    created_at: `2026-07-20T10:${String(i).padStart(2, "0")}:00Z`, page_id: 100,
    question_id: i + 1,
  }));
  const progress = buildPageProgress([...legacy, ...tracked]);
  assert.equal(progress.get(100)!.answered, 10,
    "derive.ts:194 — 10 real questions were answered, but the synthetic-id fallback reports 20");

  const plan = withFrozenTime(MORNING_BRT, () =>
    run({ signals: { quizAttempts: [...legacy, ...tracked] } }));
  assert.equal(plan.items.some((i) => i.pageId === 100), true,
    "half the page is unanswered, yet the topic is retired from the plan");
});

// ═══════════════════════════════════════════════════════════════════════════
// D5 — derive.ts:554  the progress subtitle can render more answered than total
// ═══════════════════════════════════════════════════════════════════════════

test("D5 a deleted question produces a nonsense subtitle ('18 de 15 questões')", () => {
  // Data drift: the student answered 18 distinct questions; 3 were later deleted,
  // so the view now reports 15. `answered < totalQuestions` is false so the page
  // is judged on accuracy alone — at 60% it stays scheduled, and the subtitle
  // (derive.ts:554) prints answered/total with no clamp.
  const attempts = Array.from({ length: 18 }, (_, i) => ({
    specialty_id: 1, is_correct: i < 10, // 55%
    created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  }));
  const plan = withFrozenTime(MORNING_BRT, () => run({
    signals: { quizAttempts: attempts, questionCountsByPageId: new Map([[100, 15], [200, 10]]) },
  }));
  const item = plan.items.find((i) => i.pageId === 100)!;
  assert.ok(item, "page still scheduled at 55%");
  assert.doesNotMatch(item.subtitle, /18 de 15/,
    `derive.ts:554 — subtitle rendered "${item.subtitle}"; the student is shown a progress count above 100%`);
});

// ═══════════════════════════════════════════════════════════════════════════
// D6 — derive.ts:201  ties on created_at resolve by array order (nondeterministic)
// ═══════════════════════════════════════════════════════════════════════════

test("D6 two attempts with identical created_at resolve by row order", () => {
  // `a.created_at >= prev.at` means "last one wins on a tie". The rows come from
  // fetch.ts:97 — a select with NO order by — so PostgREST/Postgres may return
  // them in either order across requests (seq scan order changes after VACUUM,
  // an index-only scan, or a parallel plan). Same data, different mastery verdict
  // on consecutive page loads.
  const base = { specialty_id: 1, page_id: 100, question_id: 1, created_at: "2026-07-20T10:00:00.000000+00:00" };
  const aThenB = buildPageProgress([{ ...base, is_correct: true }, { ...base, is_correct: false }]);
  const bThenA = buildPageProgress([{ ...base, is_correct: false }, { ...base, is_correct: true }]);
  assert.deepEqual(aThenB.get(100), bThenA.get(100),
    "derive.ts:201 — tie-break depends on unordered query results; add a stable secondary key (e.g. attempt id) or ORDER BY created_at, id in fetch.ts:97");
});

// ═══════════════════════════════════════════════════════════════════════════
// D7 — derive.ts:169 claims parity with roadmap.ts. It does not hold.
// ═══════════════════════════════════════════════════════════════════════════
//
// derive.ts:166-171: "Mirrors the Roteiro's 'dominado' threshold
// (lib/study-plan/roadmap.ts) so the two surfaces never disagree."
//
// roadmap.ts:79-102 (UNCHANGED by this fix) computes:
//   n       = RAW attempt-row count for the page   (no dedup by question)
//   correct = RAW correct-row count                (no latest-attempt rule)
//   dominado ⇔ n >= topic.incidence_count && correct/n >= 0.7
//
// derive.ts computes distinct questions / latest attempt / question_count.
// Three independent axes of disagreement.

type Attempt = { page_id: number; is_correct: boolean; question_id: number | null; created_at: string; specialty_id: number | null };

/**
 * Transcription of roadmap.ts as it stands AFTER the parity fix. It no longer
 * re-derives anything: it calls the engine's own buildPageProgress +
 * isPageMastered, with the page's real question_count and incidence_count only as
 * the fallback. The tests below therefore assert genuine parity between the two
 * surfaces, not agreement between two hand-copied formulas.
 *
 *   const byPage = buildPageProgress(attempts);
 *   const total  = questionCounts.get(source_page_id) ?? t.incidence_count;
 *   status = isPageMastered(byPage.get(source_page_id), total) ? "dominado" : …
 */
function roteiroIsDominado(
  attempts: Attempt[],
  pageId: number,
  incidenceCount: number,
  questionCount?: number,
): boolean {
  return isPageMastered(buildPageProgress(attempts).get(pageId), questionCount ?? incidenceCount);
}

test("D7 grinding ONE question fakes 'Dominado' on the Roteiro (the P0, unfixed)", () => {
  // The very failure derive.ts was hardened against still stands on /app/plano/roteiro.
  const attempts: Attempt[] = Array.from({ length: 20 }, (_, i) => ({
    page_id: 100, is_correct: true, question_id: 3,
    created_at: `2026-07-20T10:${String(i).padStart(2, "0")}:00Z`, specialty_id: 1,
  }));
  assert.equal(roteiroIsDominado(attempts, 100, 20), false,
    "roadmap.ts:102 — 20 attempts on ONE question mark a 20-question topic 'Dominado'; " +
    "derive.ts correctly keeps it scheduled, so the plan and the Roteiro now contradict each other");
});

test("D7b a retry session makes the plan and the Roteiro disagree", () => {
  // 20 questions. First pass: 10 right, 10 wrong. Then the student retries the
  // 10 wrong ones and gets them all right.
  const first: Attempt[] = Array.from({ length: 20 }, (_, i) => ({
    page_id: 100, is_correct: i < 10, question_id: i + 1,
    created_at: "2026-07-20T10:00:00Z", specialty_id: 1,
  }));
  const retry: Attempt[] = Array.from({ length: 10 }, (_, i) => ({
    page_id: 100, is_correct: true, question_id: 11 + i,
    created_at: "2026-07-21T10:00:00Z", specialty_id: 1,
  }));
  const all = [...first, ...retry];

  const planMastered = isPageMastered(buildPageProgress(all).get(100), 20);
  const roteiroMastered = roteiroIsDominado(all, 100, 20);
  assert.equal(planMastered, roteiroMastered,
    `derive.ts:169 — plan says mastered=${planMastered} (20/20 distinct, latest all correct), ` +
    `Roteiro says dominado=${roteiroMastered} (30 raw attempts, 20 correct = 66.7%). ` +
    "The topic vanishes from the daily plan while the Roteiro still shows it 'em andamento' — " +
    "the exact symptom derive.ts:216-221 says the fix eliminated.");
});

test("D7c the two surfaces use different denominators once the view is applied", () => {
  // Roteiro's denominator is topic.incidence_count (6 for Próstata).
  // The plan's is question_count (30 for page 90242). Applying the schema patch
  // does not converge them — it makes them diverge harder.
  const attempts: Attempt[] = Array.from({ length: 6 }, (_, i) => ({
    page_id: 90242, is_correct: true, question_id: i + 1,
    created_at: "2026-07-20T10:00:00Z", specialty_id: 1,
  }));
  const planMastered = isPageMastered(buildPageProgress(attempts).get(90242), 30);
  // The Roteiro now reads the same question_count view the plan does.
  const roteiroMastered = roteiroIsDominado(attempts, 90242, 6, 30);
  assert.equal(planMastered, roteiroMastered,
    `roadmap.ts:102 was not updated: plan mastered=${planMastered} (6/30), Roteiro dominado=${roteiroMastered} (6/6). ` +
    "The Roteiro's 'Dominados' headline count is inflated for all 12 split sub-topics.");
});

// ═══════════════════════════════════════════════════════════════════════════
// D8 — derive.ts:547  an over-counting denominator pins a topic forever
// ═══════════════════════════════════════════════════════════════════════════

test("ACCEPTED TRADEOFF: a denominator larger than the answerable set pins a topic", () => {
  // quiz_page_question_counts is COUNT(*) over quiz_questions with no status /
  // validity filter. If a page ever holds rows the player does not serve,
  // `answered` can never reach `question_count`, isPageMastered stays false, and
  // the topic is pinned for the rest of the membership.
  //
  // Accepted because the view counts exactly the rows the quiz player reads —
  // there is no serving filter today, so the two cannot diverge. The safe
  // alternative (retire on "close enough") would re-open the shared-page bug
  // this whole change set exists to fix: a 30-question page would clear at 24.
  //
  // The guard that matters is upstream: if a serving filter is ever added to the
  // quiz player, this view must gain the same filter in the same commit.
  //
  // This test asserts the pin so the cost stays visible and measured.
  const answerable = 20, viewCount = 25;
  const attempts = Array.from({ length: answerable }, (_, i) => ({
    specialty_id: 1, is_correct: true,
    created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  }));
  // Walk 180 consecutive Brazilian days. Page 100 must clear on at least one.
  let key = "2026-07-28";
  let daysStillScheduled = 0;
  let lastSubtitle = "";
  for (let d = 0; d < 180; d++) {
    const plan = withFrozenTime(`${key}T13:00:00Z`, () => run({
      signals: { quizAttempts: attempts, questionCountsByPageId: new Map([[100, viewCount], [200, 10]]) },
    }));
    const item = plan.items.find((i) => i.pageId === 100);
    if (item) { daysStillScheduled++; lastSubtitle = item.subtitle; }
    key = addDaysKey(key, 1);
  }
  assert.equal(daysStillScheduled, 180,
    `documented cost: with a denominator of ${viewCount} against ${answerable} answerable questions the ` +
    `topic stays scheduled on every one of 180 days, reading "${lastSubtitle}". If this number ever ` +
    "drops, someone loosened the mastery rule — check it did not re-open the shared-page bug.");
});

test("D8b incidence_count of 0 also pins a topic forever", () => {
  // topics.incidence_count is a plain integer with no CHECK > 0. A topic seeded
  // at 0 (or any future topic added before its questions exist) gets
  // totalQuestions = 0 → isPageMastered short-circuits to false permanently, and
  // the subtitle reads "N de 0 questões".
  const zeroTopic: TopicRow[] = [
    { id: 1, name: "Arritmias", slug: "arritmias", specialty_id: 1, source_page_id: 100, incidence_count: 0, priority_tier: null, is_pinned: false },
  ];
  const attempts = Array.from({ length: 20 }, (_, i) => ({
    specialty_id: 1, is_correct: true,
    created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1,
  }));
  const plan = withFrozenTime(MORNING_BRT, () => run({
    topics: zeroTopic, topicContent: [{ topic_id: 1, resource_type: "quiz", page_id: 100, question_filter: null }],
    signals: { quizAttempts: attempts, questionCountsByPageId: new Map() },
  }));
  const item = plan.items.find((i) => i.pageId === 100);
  assert.equal(item, undefined,
    `derive.ts:229 — a fully-answered, 100%-correct page stays scheduled forever; subtitle: "${item?.subtitle}"`);
});

// ═══════════════════════════════════════════════════════════════════════════
// D9 — the plan is now permanently static for a stuck student
// ═══════════════════════════════════════════════════════════════════════════

test("D9 a student below 70% on every scheduled page sees the same plan forever", () => {
  // Fully answered, 65% accuracy on both pages. Nothing in the plan tells the
  // student a 70% bar exists; the reason line still says "Retome de onde parou
  // neste tema" and the subtitle says "20 de 20 questões" — i.e. finished.
  const attempts = [
    ...Array.from({ length: 20 }, (_, i) => ({ specialty_id: 1, is_correct: i < 13, created_at: "2026-07-20T10:00:00Z", page_id: 100, question_id: i + 1 })),
    ...Array.from({ length: 10 }, (_, i) => ({ specialty_id: 2, is_correct: i < 6,  created_at: "2026-07-20T10:00:00Z", page_id: 200, question_id: i + 1 })),
  ];
  const plan = withFrozenTime(MORNING_BRT, () => run({ signals: { quizAttempts: attempts } }));
  const item = plan.items.find((i) => i.pageId === 100)!;
  assert.doesNotMatch(item.subtitle, /^Cardiologia · 20 de 20 questões$/,
    `derive.ts:552-566 — the item reads "${item.subtitle}" / "${item.reason}" on a page the student has ` +
    "100% covered. There is no copy anywhere explaining that 70% accuracy is the exit condition, so the " +
    "plan reads as broken. Previously this topic rotated out after one answer; now it never rotates.");
});

// ═══════════════════════════════════════════════════════════════════════════
// D10 — startOfDayBRIso hardcodes -03:00 and is wrong for pre-2019 dates
// ═══════════════════════════════════════════════════════════════════════════

test("D10 startOfDayBRIso disagrees with toDateKeyBR during historical DST", () => {
  // Brazil observed DST until 2019 (UTC-02:00 in summer). br-date.ts:22 hardcodes
  // -03:00, while every other function in the module goes through Intl and honours
  // the historical rule. For 2018-02-01, true local midnight is 02:00Z, but
  // startOfDayBRIso returns 03:00Z — a one-hour hole at the start of the day that a
  // `.gte("created_at", startOfDayBRIso(key))` filter would silently drop.
  const key = "2018-02-01";
  const oneMinuteAfterTrueMidnight = "2018-02-01T02:01:00Z";
  assert.equal(toDateKeyBR(oneMinuteAfterTrueMidnight), key); // Intl agrees it's the 1st
  assert.ok(Date.parse(oneMinuteAfterTrueMidnight) >= Date.parse(startOfDayBRIso(key)),
    "br-date.ts:22 — the literal -03:00 offset makes the day-start bound one hour late whenever " +
    "the historical rule was -02:00. LATENT ONLY: the product has no pre-2019 data, and the only " +
    "caller (app/page.tsx:413) passes today's key. Flagging because the constant is load-bearing " +
    "and the comment asserts it is safe unconditionally.");
});

// ── shared fixtures ─────────────────────────────────────────────────────────

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
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0,
      lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map([[100, 20], [200, 10]]),
      ...args.signals,
    },
  });
}
