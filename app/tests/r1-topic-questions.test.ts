/**
 * R1 — a Meu Plano topic is a set of ORIGINAL questions, not a section
 * (Karina 2026-11-12). These cases are the ones she asked to see tested:
 *   - a topic inside a broad section opens ONLY its questions (Artrite Infecciosa
 *     inside Outros › Ortopedia; the Urologia/Oftalmo/Otorrino sub-topics);
 *   - progress + "dominado" are computed over the topic's originals, and adding
 *     questions to a topic (4 → 8) keeps the answers but re-opens the topic;
 *   - one original filed in two sections is ONE question (counted once, answered
 *     on either copy);
 *   - a question moved to another section/specialty keeps its history;
 *   - the Revisão link follows the question's own topic and never borrows another
 *     subject's material;
 *   - without the R1 index everything behaves exactly as before.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { withFrozenTime, MORNING_BRT } from "./helpers/freeze-time";
import {
  derivePlan, defaultPrefs,
  type StudyPlanPrefs, type Signals, type TopicRow, type PageRow,
  type TopicContentRow, type SpecialtyRow,
} from "@/lib/study-plan/derive";
import {
  buildTopicQuestionIndex, buildTopicProgress, topicNeedsFilter, topicQuizHref,
  type TopicQuestionLink,
} from "@/lib/study-plan/topic-questions";
import { pickRemediation, REMEDIATION_LABELS, type TopicLinks } from "@/lib/review/remediation";
import { flashcardGroupSlug } from "@/lib/flashcard-group-slug";

// ── fixtures: Outros › Ortopedia (page 500) holds two topics ───────────────────
const SPECIALTIES: SpecialtyRow[] = [
  { id: 12, name: "Reumatologia", slug: "reumatologia" },
  { id: 18, name: "Outros", slug: "outros" },
  { id: 9, name: "Neurologia", slug: "neurologia" },
];
const PAGES: PageRow[] = [
  { id: 500, slug: "ortopedia", title: "Ortopedia", type: "h5p-quiz", specialty_id: 18, track_id: null, content_module_id: null, view: "quiz" },
  { id: 600, slug: "patologias-da-coluna-vertebral", title: "Coluna", type: "h5p-quiz", specialty_id: 9, track_id: null, content_module_id: null, view: "quiz" },
  { id: 700, slug: "reumatologia-flashcards", title: "Flashcards", type: "h5p-quiz", specialty_id: 12, track_id: 3, content_module_id: null, view: null },
];
const ARTRITE: TopicRow = { id: 103, name: "Artrite Infecciosa", slug: "artrite-infecciosa", specialty_id: 18, source_page_id: 500, incidence_count: 4, priority_tier: "C", is_pinned: false };
const OSTEO: TopicRow = { id: 129, name: "Osteomielite e Infecções Osteoarticulares", slug: "trauma-osteomielite", specialty_id: 18, source_page_id: 500, incidence_count: 2, priority_tier: "D", is_pinned: false };
const COLUNA: TopicRow = { id: 76, name: "Patologias da Coluna Vertebral", slug: "patologias-da-coluna-vertebral", specialty_id: 9, source_page_id: 600, incidence_count: 3, priority_tier: "C", is_pinned: false };
const TRM: TopicRow = { id: 123, name: "Trauma Raquimedular", slug: "trauma-raquimedular", specialty_id: 9, source_page_id: 600, incidence_count: 2, priority_tier: "D", is_pinned: false };
const TOPICS = [ARTRITE, OSTEO, COLUNA, TRM];
const TOPIC_CONTENT: TopicContentRow[] = [
  { topic_id: 103, resource_type: "quiz", page_id: 500, question_filter: null },
  { topic_id: 129, resource_type: "quiz", page_id: 500, question_filter: null },
  { topic_id: 76, resource_type: "quiz", page_id: 600, question_filter: null },
  { topic_id: 123, resource_type: "quiz", page_id: 600, question_filter: null },
  // Artrite Infecciosa's existing flashcard group stays in the Reumatologia deck.
  { topic_id: 103, resource_type: "flashcards", page_id: 700, question_filter: { group_label: "Artrite Infecciosa" } },
];

// Ortopedia: originals 1-4 artrite séptica (records 11-14), 5-6 osteomielite (15-16).
// Coluna: originals 7-9 patologias (17-19), 10-11 TRM (20-21); original 10 also has
// a second record (22) filed in another section (page 800, Cirurgia Geral copy).
const L = (topic: number, origin: number, q: number, page: number, primary = true): TopicQuestionLink =>
  ({ topic_id: topic, exam_question_id: origin, question_id: q, page_id: page, is_primary: primary });
const LINKS: TopicQuestionLink[] = [
  L(103, 1, 11, 500), L(103, 2, 12, 500), L(103, 3, 13, 500), L(103, 4, 14, 500),
  L(129, 5, 15, 500), L(129, 6, 16, 500),
  L(76, 7, 17, 600), L(76, 8, 18, 600), L(76, 9, 19, 600),
  L(123, 10, 20, 600), L(123, 11, 21, 600), L(123, 10, 22, 800),
];
const INDEX = buildTopicQuestionIndex(LINKS);

const at = (q: number, page: number, ok: boolean, t = "2026-07-20T10:00:00Z") =>
  ({ specialty_id: 18, is_correct: ok, created_at: t, page_id: page, question_id: q });

function run(signals: Partial<Signals>, prefs: Partial<StudyPlanPrefs> = {}) {
  return withFrozenTime(MORNING_BRT, () => derivePlan({
    prefs: { ...defaultPrefs(), intensity: "intenso", ...prefs },
    cohort: { test_date: "2027-01-15" },
    specialties: SPECIALTIES,
    pages: PAGES,
    topics: TOPICS,
    topicContent: TOPIC_CONTENT,
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0,
      lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map([[500, 6], [600, 5]]),
      ...signals,
    },
  }));
}

// ── index ─────────────────────────────────────────────────────────────────────

test("an original filed in two sections is ONE question of its topic", () => {
  assert.equal(INDEX.originsOfTopic.get(123)?.size, 2, "TRM has 2 originals although 3 records");
  assert.equal(INDEX.primaryOriginsOfTopic.get(123)?.size, 2);
  assert.equal(INDEX.mainSectionOfTopic.get(123), 600, "opens where most of its originals are");
});

test("a topic sharing its section needs the ?tema= filter; a lone topic does not", () => {
  assert.equal(topicNeedsFilter(INDEX, 103), true, "Artrite Infecciosa shares Ortopedia");
  const solo = buildTopicQuestionIndex([L(1, 1, 1, 900), L(1, 2, 2, 900)]);
  assert.equal(topicNeedsFilter(solo, 1), false, "the section is exactly the topic");
  const spread = buildTopicQuestionIndex([L(1, 1, 1, 900), L(1, 2, 2, 901)]);
  assert.equal(topicNeedsFilter(spread, 1), true, "originals in two sections → the filter gathers them");
});

test("topicQuizHref opens the topic under its section's OWN specialty", () => {
  const pageById = new Map(PAGES.map((p) => [p.id, p]));
  const specs = new Map(SPECIALTIES.map((s) => [s.id, s.slug]));
  const link = topicQuizHref(INDEX, ARTRITE, pageById, specs, "reumatologia");
  assert.deepEqual(link, { href: "/app/outros/ortopedia?tema=artrite-infecciosa", pageId: 500 });
});

// ── progress ──────────────────────────────────────────────────────────────────

test("progress counts originals; an answer on EITHER copy counts once", () => {
  const p = buildTopicProgress([at(22, 800, true), at(20, 600, false, "2026-07-19T10:00:00Z")], INDEX);
  assert.deepEqual(p.get(123), { answered: 1, correct: 1 }, "latest attempt on original 10 (copy 22) wins");
});

test("4 → 8: adding questions keeps the answers but the topic is no longer dominado", () => {
  const four = buildTopicQuestionIndex([1, 2, 3, 4].map((o) => L(1, o, o, 900)));
  const eight = buildTopicQuestionIndex([1, 2, 3, 4, 5, 6, 7, 8].map((o) => L(1, o, o, 900)));
  const attempts = [1, 2, 3, 4].map((q) => at(q, 900, true));
  assert.deepEqual(buildTopicProgress(attempts, four).get(1), { answered: 4, correct: 4 });
  assert.deepEqual(buildTopicProgress(attempts, eight).get(1), { answered: 4, correct: 4 },
    "the same 4 answers are preserved");
  assert.equal(eight.originsOfTopic.get(1)?.size, 8, "the denominator follows the new total");
});

// ── the plan ──────────────────────────────────────────────────────────────────

test("Artrite Infecciosa inside Ortopedia: its item opens only its questions", () => {
  const plan = run({ topicIndex: INDEX });
  const art = plan.items.find((i) => i.kind === "quiz" && i.title === "Artrite Infecciosa");
  const osteo = plan.items.find((i) => i.kind === "quiz" && i.title.startsWith("Osteomielite"));
  assert.ok(art && osteo, "two topics of ONE section are two items now (before R1: one)");
  assert.equal(art!.href, "/app/outros/ortopedia?tema=artrite-infecciosa");
  assert.equal(osteo!.href, "/app/outros/ortopedia?tema=trauma-osteomielite");
});

test("the plan item counts the topic's questions, not the section's", () => {
  const plan = run({ topicIndex: INDEX, quizAttempts: [at(11, 500, true), at(15, 500, true)] });
  const art = plan.items.find((i) => i.kind === "quiz" && i.title === "Artrite Infecciosa");
  assert.match(art!.subtitle, /1 de 4 questões/, "not '2 de 6' (the whole Ortopedia section)");
});

test("a topic is dominado on its own questions and leaves the plan; its neighbour stays", () => {
  const plan = run({ topicIndex: INDEX, quizAttempts: [11, 12, 13, 14].map((q) => at(q, 500, true)) });
  assert.ok(!plan.items.some((i) => i.kind === "quiz" && i.title === "Artrite Infecciosa"), "4/4 → dominado");
  assert.ok(plan.items.some((i) => i.kind === "quiz" && i.title.startsWith("Osteomielite")), "Osteomielite untouched");
});

test("dominado reopens when the topic gains questions (4 → 8)", () => {
  const grown = buildTopicQuestionIndex([...LINKS, L(103, 30, 31, 500), L(103, 31, 32, 500), L(103, 32, 33, 500), L(103, 33, 34, 500)]);
  const plan = run({ topicIndex: grown, quizAttempts: [11, 12, 13, 14].map((q) => at(q, 500, true)) });
  const art = plan.items.find((i) => i.kind === "quiz" && i.title === "Artrite Infecciosa");
  assert.ok(art, "back in the plan");
  assert.match(art!.subtitle, /4 de 8 questões/);
});

test("a question moved to another section keeps its history (attempt on the old page)", () => {
  // The attempt was recorded under page 999 (the section the record used to live in).
  const plan = run({ topicIndex: INDEX, quizAttempts: [at(11, 999, true)] });
  const art = plan.items.find((i) => i.kind === "quiz" && i.title === "Artrite Infecciosa");
  assert.match(art!.subtitle, /1 de 4 questões/, "progress keys on the record/original, never the page");
});

test("flashcards open the topic's own group, under the deck's own specialty", () => {
  const plan = run({ topicIndex: INDEX });
  const fc = plan.items.find((i) => i.kind === "flashcards" && i.title === "Artrite Infecciosa");
  assert.equal(fc?.href, "/app/reumatologia/reumatologia-flashcards?grupo=artrite-infecciosa",
    "Reumatologia deck, not /app/outros/…, and the Artrite Infecciosa group only");
});

test("without the R1 index the plan is unchanged (one item per shared section)", () => {
  const plan = run({});
  const ortho = plan.items.filter((i) => i.kind === "quiz" && i.pageId === 500);
  assert.equal(ortho.length, 1);
  assert.equal(ortho[0].href, "/app/outros/ortopedia");
  const fc = plan.items.find((i) => i.kind === "flashcards");
  assert.equal(fc?.href, "/app/reumatologia/reumatologia-flashcards", "deck link without ?grupo=");
});

test("a flashcards link that names no group never opens the whole deck (Karina 2026-11-13)", () => {
  const content: TopicContentRow[] = [
    ...TOPIC_CONTENT.filter((c) => c.resource_type !== "flashcards"),
    { topic_id: 103, resource_type: "flashcards", page_id: 700, question_filter: null },
  ];
  const plan = withFrozenTime(MORNING_BRT, () => derivePlan({
    prefs: { ...defaultPrefs(), intensity: "intenso" },
    cohort: { test_date: "2027-01-15" },
    specialties: SPECIALTIES, pages: PAGES, topics: TOPICS, topicContent: content,
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0, lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map([[500, 6], [600, 5]]), topicIndex: INDEX,
    },
  }));
  const fc = plan.items.find((i) => i.kind === "flashcards" && i.title === "Artrite Infecciosa");
  assert.equal(fc?.href, "/app/reumatologia/reumatologia-flashcards?grupo=artrite-infecciosa",
    "falls back to the topic's own name as the group, never the bare deck");
});

test("the deck says no Flashcards are linked when ?grupo= names no group (never the whole deck)", () => {
  const src = readFileSync(path.join(process.cwd(), "src/components/content/flashcard-renderer.tsx"), "utf8");
  assert.match(src, /Ainda não há Flashcards vinculados a este tema\./);
  assert.match(src, /!selectedGroup && grupo && groups\.length > 1/);
});

// ── R4b: stable group ids ─────────────────────────────────────────────────────

function runWith(content: TopicContentRow[], pages: PageRow[] = PAGES) {
  return withFrozenTime(MORNING_BRT, () => derivePlan({
    prefs: { ...defaultPrefs(), intensity: "intenso" },
    cohort: { test_date: "2027-01-15" },
    specialties: SPECIALTIES, pages, topics: TOPICS, topicContent: content,
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0, lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map([[500, 6], [600, 5]]), topicIndex: INDEX,
    },
  }));
}

test("R4b: a link with the group's id opens the group BY ID, whatever its name says", () => {
  const content: TopicContentRow[] = [
    ...TOPIC_CONTENT.filter((c) => c.resource_type !== "flashcards"),
    // an old spelling of the name — the id is what counts
    { topic_id: 103, resource_type: "flashcards", page_id: 700, question_filter: { group_label: "artrite infecciosa" }, flashcard_group_id: 37 },
  ];
  const fc = runWith(content).items.find((i) => i.kind === "flashcards" && i.title === "Artrite Infecciosa");
  assert.equal(fc?.href, "/app/reumatologia/reumatologia-flashcards?grupo=37");
});

test("R4b: a group moved to Outros (Ortopedia) takes its plan link along — the deck is the group's deck", () => {
  const outrosDeck: PageRow = { id: 701, slug: "outros-flashcards", title: "Flashcards", type: "h5p-quiz", specialty_id: 18, track_id: 3, content_module_id: null, view: null };
  const content: TopicContentRow[] = [
    ...TOPIC_CONTENT.filter((c) => c.resource_type !== "flashcards"),
    // the database keeps page_id = the group's deck (trigger), so after the move it is the Outros deck
    { topic_id: 103, resource_type: "flashcards", page_id: 701, question_filter: { group_label: "Artrite Infecciosa" }, flashcard_group_id: 37 },
    { topic_id: 129, resource_type: "flashcards", page_id: 701, question_filter: { group_label: "Trauma e Infecções Musculoesqueléticas" }, flashcard_group_id: 170 },
  ];
  const items = runWith(content, [...PAGES, outrosDeck]).items.filter((i) => i.kind === "flashcards");
  assert.equal(items.find((i) => i.title === "Artrite Infecciosa")?.href, "/app/outros/outros-flashcards?grupo=37");
  assert.equal(items.find((i) => i.title.startsWith("Osteomielite"))?.href, "/app/outros/outros-flashcards?grupo=170",
    "each Ortopedia topic opens ITS group, never the other one");
});

test("R4b: Coluna — two topics opening the SAME unified group appear once (no duplicated review)", () => {
  const neuroDeck: PageRow = { id: 702, slug: "neurologia-flashcards", title: "Flashcards", type: "h5p-quiz", specialty_id: 9, track_id: 3, content_module_id: null, view: null };
  const content: TopicContentRow[] = [
    ...TOPIC_CONTENT,
    { topic_id: 76, resource_type: "flashcards", page_id: 702, question_filter: { group_label: "Coluna Vertebral e Trauma Raquimedular" }, flashcard_group_id: 31 },
    { topic_id: 123, resource_type: "flashcards", page_id: 702, question_filter: { group_label: "Coluna Vertebral e Trauma Raquimedular" }, flashcard_group_id: 31 },
  ];
  const plan = runWith(content, [...PAGES, neuroDeck]);
  const fc = plan.items.filter((i) => i.kind === "flashcards" && i.href.endsWith("?grupo=31"));
  assert.equal(fc.length, 1, "one Flashcards item for the unified group");
  const quiz = plan.items.filter((i) => i.kind === "quiz" && i.pageId === 600);
  assert.equal(quiz.length, 2, "the two topics stay separate, each with its own questions");
});

test("R4b: the deck accepts ?grupo=<id> as well as the shareable slug", () => {
  const src = readFileSync(path.join(process.cwd(), "src/components/content/flashcard-renderer.tsx"), "utf8");
  assert.match(src, /groupBySlug\.get\(grupo\) \?\? byId\(grupo\)/);
  assert.match(src, /\.select\("id, group_id, group_position/);
});

test("R4b: the plan reads topic_content through the paginated, id-aware fetcher", () => {
  for (const f of ["src/lib/study-plan/fetch.ts", "src/lib/magnet/plan-preview.ts"]) {
    const src = readFileSync(path.join(process.cwd(), f), "utf8");
    assert.match(src, /fetchTopicContent\(admin\)/, f);
    assert.doesNotMatch(src, /from\("topic_content"\)/, `${f} must not read topic_content directly (1000-row cap)`);
  }
});

test("flashcardGroupSlug matches the deck renderer's ?grupo= slugs", () => {
  assert.equal(flashcardGroupSlug("Coluna Vertebral e Trauma Raquimedular"), "coluna-vertebral-e-trauma-raquimedular");
  assert.equal(flashcardGroupSlug("Cardiopatia Congênita"), "cardiopatia-congenita");
});

// ── Revisão link ──────────────────────────────────────────────────────────────

const SECTION_LINK = { href: "/app/outros/x-revalida-up", label: REMEDIATION_LABELS.revalidaUp };
const TOPIC_LINKS = new Map<number, TopicLinks>([
  [103, { resumoHref: "/app/reumatologia/artrite-infecciosa-resumos", revalidaUpHref: "/app/reumatologia/artrite-infecciosa-revalida-up" }],
  [129, { resumoHref: "/app/cirurgia-geral/trauma-osteomielite-resumos" }],
]);

test("Revisão: each Ortopedia question goes to ITS topic's Resumo", () => {
  const ortho = new Set([103, 129]);
  assert.equal(pickRemediation({ identified: true, topicId: 103, topicLinks: TOPIC_LINKS, sectionTopics: ortho, sectionRemediation: null })?.href,
    "/app/reumatologia/artrite-infecciosa-resumos");
  assert.equal(pickRemediation({ identified: true, topicId: 129, topicLinks: TOPIC_LINKS, sectionTopics: ortho, sectionRemediation: null })?.href,
    "/app/cirurgia-geral/trauma-osteomielite-resumos");
});

test("Revisão: a topic without material in a shared section gets NO link (never another subject's)", () => {
  const r = pickRemediation({ identified: true, topicId: 999, topicLinks: TOPIC_LINKS, sectionTopics: new Set([999, 210]), sectionRemediation: SECTION_LINK });
  assert.equal(r, null);
});

test("Revisão: alone in its section, a topic without own links keeps the section's link", () => {
  const r = pickRemediation({ identified: true, topicId: 999, topicLinks: TOPIC_LINKS, sectionTopics: new Set([999]), sectionRemediation: SECTION_LINK });
  assert.equal(r, SECTION_LINK);
});

test("Revisão: an undecided topic (new-topic proposal) in a shared section gets no link", () => {
  assert.equal(pickRemediation({ identified: true, topicId: null, topicLinks: TOPIC_LINKS, sectionTopics: new Set([210, 211]), sectionRemediation: SECTION_LINK }), null);
});

test("Revisão: a record not identified yet keeps the pre-R1 section link", () => {
  assert.equal(pickRemediation({ identified: false, topicId: null, topicLinks: TOPIC_LINKS, sectionTopics: new Set([210, 211]), sectionRemediation: SECTION_LINK }), SECTION_LINK);
});
