/**
 * MedHelp 60D — the schedule (Karina 2026-11-17 23h06 + 2026-11-18). Her rules under test:
 *   1. the sequence is fixed in advance: it comes from the exam date and the priorities, never from the student;
 *   2. subjects are distributed by weeks, each with its Fórmula MedHelp page and MemoreCards;
 *   3. the seven Simulados 100Q are programmed, each with time for correction — weeks 1 to 7, Simulado N in week N;
 *      week 8 programmes no new simulado (her e-mail of 2026-11-19), and no reserve of time is computed for it;
 *   6. during the WHOLE 60D period Meu Plano adds nothing of the regular course to the day — no mini simulado, no
 *      Revisão, no content — in every week, whether its Simulado 100Q is available or pending (2026-11-19, 01h12);
 *   4. a material not delivered yet is shown as pending, in its place — nothing is removed or reordered silently;
 *   5. every item has a stable key, so the manual checklist survives a new delivery.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildCronograma, d60Position, matchFormulaPages, orderUnits, d60SettingsOf, d60Duration,
  DEFAULT_D60_SETTINGS, type D60Unit, type D60SimuladoInput,
} from "@/lib/medhelp60/cronograma";
import { DEFAULT_PLAN_SETTINGS, PLAN_SETTING_FIELDS, settingsFromRow } from "@/lib/study-plan/settings";

const unit = (id: number, over: Partial<D60Unit> = {}): D60Unit => ({
  topicId: id, name: `Tema ${String(id).padStart(3, "0")}`, specialtyName: "Cardiologia", frequency: 100 - id, tier: "A",
  formula: { pageId: 1000 + id, href: `/app/cardiologia/t${id}-formula` }, memore: null, ...over,
});
const UNITS = Array.from({ length: 20 }, (_, i) => unit(i + 1));
const SIMS: D60SimuladoInput[] = Array.from({ length: 7 }, (_, i) => ({
  n: i + 1, title: `Simulado ${i + 1}`, href: `/app/geral/simulado-100q-${i + 1}`, questions: 100,
}));
const build = (over: Partial<Parameters<typeof buildCronograma>[0]> = {}) =>
  buildCronograma({ examKey: "2027-05-30", units: UNITS, simulados: SIMS, settings: DEFAULT_D60_SETTINGS, ...over });

test("calendar: 60 days before the exam — eight weeks of seven days; four days remain after week 8", () => {
  const c = build();
  assert.equal(c.startKey, "2027-03-31");
  assert.equal(c.endKey, "2027-05-29");
  assert.equal(c.weeks.length, 8);
  assert.deepEqual([c.weeks[0].startKey, c.weeks[0].endKey], ["2027-03-31", "2027-04-06"]);
  assert.deepEqual([c.weeks[7].startKey, c.weeks[7].endKey], ["2027-05-19", "2027-05-25"]);
  assert.deepEqual(c.lastDays, { startKey: "2027-05-26", endKey: "2027-05-29", days: 4 });
});

test("sequence: fixed by priority — highest frequency first, the same for every student", () => {
  const shuffled = [...UNITS].reverse();
  const a = build(); const b = build({ units: shuffled });
  assert.deepEqual(a.weeks.map((w) => w.items.map((i) => i.key)), b.weeks.map((w) => w.items.map((i) => i.key)));
  const firstFormula = a.weeks[0].items.filter((i) => i.kind === "formula").map((i) => i.title);
  assert.deepEqual(firstFormula, ["Tema 001", "Tema 002", "Tema 003"], "20 topics over 8 weeks: 3, 3, 3, 3, 2, 2, 2, 2");
  assert.deepEqual(a.weeks.map((w) => w.items.filter((i) => i.kind === "formula").length), [3, 3, 3, 3, 2, 2, 2, 2]);
});

test("sequence: a page that matches no topic comes last; ties in frequency go by name", () => {
  const ordered = orderUnits([
    unit(1, { topicId: null, name: "Bioestatística", frequency: 0 }),
    unit(2, { name: "Zika", frequency: 5 }), unit(3, { name: "Asma", frequency: 5 }), unit(4, { name: "Pneumonia", frequency: 9 }),
  ]);
  assert.deepEqual(ordered.map((u) => u.name), ["Pneumonia", "Asma", "Zika", "Bioestatística"]);
});

test("simulados: Simulado N in week N, weeks 1 to 7, each followed by its correction; week 8 has no new simulado", () => {
  const c = build();
  const w8 = c.weeks[7];
  assert.equal(w8.items.some((i) => i.kind === "sim" || i.kind === "sim-correcao"), false, "week 8 programmes no new simulado");
  assert.equal(w8.hasSimulado, false);
  assert.deepEqual(w8.items.map((i) => i.kind), ["formula", "formula"], "week 8 keeps its topics");
  assert.equal(w8.minutes, 10, "week 8's load is its topics only: 2 × 5 min");
  assert.equal("freeMinutes" in w8, false, "no fixed reserve of time is attached to week 8");
  for (let w = 1; w <= 7; w++) {
    const items = c.weeks[w - 1].items;
    const sim = items.find((i) => i.kind === "sim")!; const cor = items.find((i) => i.kind === "sim-correcao")!;
    assert.equal(sim.key, `sim:${w}`);
    assert.equal(cor.key, `sim-correcao:${w}`);
    assert.equal(sim.title, `Simulado 100Q — Simulado ${w}`);
    assert.equal(items.indexOf(cor), items.indexOf(sim) + 1, "the correction comes right after its simulado");
    assert.equal(sim.minutes, 250, "100 questions × 2.5 min");
    assert.equal(cor.minutes, 100, "100 questions × 1 min of correction");
    assert.equal(c.weeks[w - 1].hasSimulado, true);
  }
  assert.equal(c.weeks.flatMap((w) => w.items).filter((i) => i.kind === "sim").length, 7);
});

test("pending: a simulado without questions stays in its place, marked pending, and counts no time", () => {
  const sims = SIMS.map((s) => (s.n === 3 ? s : { ...s, questions: 0 }));
  const c = build({ simulados: sims });
  const all = c.weeks.flatMap((w) => w.items);
  assert.equal(all.filter((i) => i.kind === "sim").length, 7, "nothing is removed");
  assert.deepEqual(all.filter((i) => i.kind === "sim" && !i.pending).map((i) => i.key), ["sim:3"]);
  const w1 = c.weeks[0];
  assert.equal(w1.items.find((i) => i.key === "sim:1")!.pending, true, "the space of a simulado not delivered yet is in week 1 too");
  assert.equal(w1.items.find((i) => i.key === "sim:1")!.href, null);
  assert.equal(w1.items.find((i) => i.key === "sim:1")!.detail, "Material pendente");
  assert.equal(w1.hasSimulado, false);
  assert.equal(w1.minutes, 15, "only the three Fórmula pages count: 3 × 5 min");
  assert.equal(c.weeks[2].hasSimulado, true, "week 3 holds Simulado 3");
  assert.equal(c.weeks[3].hasSimulado, false);
  assert.equal(c.weeks[7].items.some((i) => i.kind === "sim"), false, "no space for a simulado in week 8");
  assert.equal(c.totals.pendingItems, 12);
});

test("pending → delivered: the keys do not move, so the checklist is kept", () => {
  const before = build({ simulados: SIMS.map((s) => ({ ...s, questions: 0 })) });
  const after = build();
  assert.deepEqual(before.weeks.map((w) => w.items.map((i) => i.key)), after.weeks.map((w) => w.items.map((i) => i.key)));
});

test("moving the simulados one week earlier keeps every tick: the keys are the simulado's number, not its week", () => {
  const keys = new Set(build().weeks.flatMap((w) => w.items).map((i) => i.key));
  // every key a student could have ticked under the previous distribution (weeks 2 to 8) still exists
  for (let n = 1; n <= 7; n++) { assert.ok(keys.has(`sim:${n}`)); assert.ok(keys.has(`sim-correcao:${n}`)); }
  for (const u of UNITS) assert.ok(keys.has(`formula:${1000 + u.topicId!}`));
  assert.equal(keys.size, 20 + 14, "20 Fórmula pages + 7 simulados + 7 corrections: nothing added, nothing dropped");
});

test("materials: Fórmula and MemoreCards of a topic sit together; a topic with neither is not in the schedule", () => {
  const units = [
    unit(1, { memore: { pageId: 501, href: "/app/memorecards/cardiologia?tema=t1", cards: 6 } }),
    unit(2, { formula: null, memore: { pageId: 502, href: "/app/memorecards/cardiologia?tema=t2", cards: 1 } }),
    unit(3, { formula: null, memore: null }),
  ];
  const c = build({ units });
  const keys = c.weeks.flatMap((w) => w.items).filter((i) => i.kind === "formula" || i.kind === "memore").map((i) => i.key);
  assert.deepEqual(keys, ["formula:1001", "memore:501", "memore:502"]);
  const m = c.weeks[0].items.find((i) => i.key === "memore:501")!;
  assert.equal(m.minutes, 6, "6 cards × 60 s");
  assert.equal(m.detail, "MemoreCards · 6 cartões");
  assert.equal(c.weeks[1].items.find((i) => i.key === "memore:502")!.detail, "MemoreCards · 1 cartão");
  assert.equal(c.totals.units, 2);
  assert.equal(c.totals.memorecards, 7);
});

test("position: before the 60 days, each week, the days after week 8 and the exam day", () => {
  const c = build();
  assert.deepEqual(d60Position(c, "2027-03-30"), { phase: "before", week: null });
  assert.deepEqual(d60Position(c, "2027-03-31"), { phase: "week", week: 1 });
  assert.deepEqual(d60Position(c, "2027-04-07"), { phase: "week", week: 2 });
  assert.deepEqual(d60Position(c, "2027-05-25"), { phase: "week", week: 8 });
  assert.deepEqual(d60Position(c, "2027-05-26"), { phase: "last-days", week: null });
  assert.deepEqual(d60Position(c, "2027-05-30"), { phase: "over", week: null });
});

test("Fórmula pages are matched to topics by address; what matches nothing is reported, never dropped", () => {
  const topics = [{ id: 1, slug: "asma" }, { id: 2, slug: "hernias" }, { id: 3, slug: "prostata" }, { id: 4, slug: "fistulas-urinarias" }];
  const topicPages = [{ topicId: 2, slug: "hernia-revalida-up" }, { topicId: 3, slug: "urologia-quiz" }, { topicId: 4, slug: "urologia-quiz" }];
  const pages = [{ slug: "asma-formula" }, { slug: "hernia-formula" }, { slug: "urologia-formula" }, { slug: "bioestatistica-formula" }];
  const { byTopic, unmatched } = matchFormulaPages(pages, topics, topicPages);
  assert.equal(byTopic.get(1)!.slug, "asma-formula", "the topic's own slug");
  assert.equal(byTopic.get(2)!.slug, "hernia-formula", "the stem of the topic's Revalida Up page");
  assert.equal(byTopic.get(3)!.slug, "urologia-formula");
  assert.equal(byTopic.get(4)!.slug, "urologia-formula", "one page can serve the topics that share a section");
  assert.deepEqual(unmatched.map((p) => p.slug), ["bioestatistica-formula"]);
});

test("Fórmula page whose address was typed differently from its topic's is still that topic's page (Karina 2026-11-18)", () => {
  // Production: the page is "…-vias-areas-formula", the topic "…-vias-aereas". It showed at the end, as a page without topic.
  const { byTopic, unmatched } = matchFormulaPages(
    [{ slug: "trauma-atendimento-inicial-e-vias-areas-formula" }],
    [{ id: 131, slug: "trauma-atendimento-inicial-e-vias-aereas" }], []);
  assert.equal(byTopic.get(131)!.slug, "trauma-atendimento-inicial-e-vias-areas-formula");
  assert.equal(unmatched.length, 0);
});

test("settings: defaults, range check, and the patch's column defaults match the code", () => {
  assert.deepEqual(d60SettingsOf(DEFAULT_PLAN_SETTINGS), DEFAULT_D60_SETTINGS, "the plan's defaults are the schedule's defaults");
  const s = d60SettingsOf(settingsFromRow({
    minutes_per_question: 3, d60_minutes_per_formula_page: "8", d60_seconds_per_memorecard: 0, d60_correction_minutes_per_question: 2,
  }));
  assert.deepEqual(s, { minutesPerFormulaPage: 8, secondsPerMemorecard: 60, minutesPerQuestion: 3, correctionMinutesPerQuestion: 2 });
  const sql = readFileSync(path.join(process.cwd(), "..", "schema-patch-medhelp60-cronograma.sql"), "utf8");
  const d60Fields = PLAN_SETTING_FIELDS.filter((f) => f.column.startsWith("d60_"));
  assert.equal(d60Fields.length, 3);
  for (const f of d60Fields) {
    const m = sql.match(new RegExp(`${f.column}\\s+\\S+\\s+NOT NULL DEFAULT ([0-9.]+)`));
    assert.ok(m, `column ${f.column} missing from the patch`);
    assert.equal(Number(m![1]), DEFAULT_PLAN_SETTINGS[f.key], `${f.column} default`);
  }
  assert.match(sql, /medhelp60_checks ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON medhelp60_checks FROM PUBLIC, anon, authenticated/);
});

test("durations are written the way the student reads them", () => {
  assert.equal(d60Duration(30), "30 min");
  assert.equal(d60Duration(90), "1 h 30 min");
  assert.equal(d60Duration(480), "8 h");
});

// ── Meu Plano × MedHelp 60D: one availability, the 60D first, nothing listed twice ─────────────────────────────
import { withFrozenTime, MORNING_BRT } from "./helpers/freeze-time";
import {
  derivePlan, defaultPrefs,
  type StudyPlanPrefs, type Signals, type TopicRow, type PageRow, type TopicContentRow, type SpecialtyRow,
} from "@/lib/study-plan/derive";

// MORNING_BRT is Tuesday 2026-07-28. With the exam on 2026-08-30 the 60 days began on 2026-07-01:
// week 4 = 22/07 to 28/07 (today is its last day), week 5 = 29/07 to 04/08.
const EXAM = "2026-08-30";
const SPECIALTIES: SpecialtyRow[] = [{ id: 1, name: "Cardiologia", slug: "cardiologia" }];
const PAGES: PageRow[] = []; const TOPICS: TopicRow[] = []; const CONTENT: TopicContentRow[] = [];
for (let i = 1; i <= 30; i++) {
  PAGES.push({ id: 100 + i, slug: `q${i}`, title: `Q${i}`, type: "h5p-quiz", specialty_id: 1, track_id: null, content_module_id: null, view: "quiz" });
  TOPICS.push({ id: i, name: `Tema${i}`, slug: `t${i}`, specialty_id: 1, source_page_id: 100 + i, incidence_count: 100 - i, priority_tier: "A", is_pinned: false });
  CONTENT.push({ topic_id: i, resource_type: "quiz", page_id: 100 + i, question_filter: null });
}
type Weeks = NonNullable<NonNullable<Signals["sixtyD"]>["weeks"]>;
const week = (n: number, startKey: string, endKey: string, pendingMinutes: number, hasSimulado = false): Weeks[number] =>
  ({ n, startKey, endKey, pendingMinutes, pendingItems: pendingMinutes > 0 ? 3 : 0, hasSimulado });
function plan(weeks: Weeks | null, prefs: Partial<StudyPlanPrefs> = {}) {
  return withFrozenTime(MORNING_BRT, () => derivePlan({
    prefs: { ...defaultPrefs(), pace_mode: "standard", preferred_content_types: ["quiz"], ...prefs },
    cohort: { test_date: EXAM },
    specialties: SPECIALTIES, pages: PAGES, topics: TOPICS, topicContent: CONTENT,
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0, lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map(Array.from({ length: 30 }, (_, i) => [101 + i, 40])),
      sixtyD: weeks ? { weeks } : null,
    },
  }));
}
const placed = (d: { review: number; simulado: number; content: number }) => d.review + d.simulado + d.content;

// Outside the 60 days the plan is its own. A far exam: 2027-05-30 (the 60 days begin on 2027-03-31).
function farPlan(prefs: Partial<StudyPlanPrefs> = {}) {
  return withFrozenTime(MORNING_BRT, () => derivePlan({
    prefs: { ...defaultPrefs(), pace_mode: "standard", preferred_content_types: ["quiz"], ...prefs },
    cohort: { test_date: "2027-05-30" },
    specialties: SPECIALTIES, pages: PAGES, topics: TOPICS, topicContent: CONTENT,
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0, lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map(Array.from({ length: 30 }, (_, i) => [101 + i, 40])),
    },
  }));
}

test("Meu Plano: before the 60 days the day is the plan's own, with no 60D block", () => {
  const p = farPlan();
  assert.equal(p.inD60Period, false);
  assert.equal(p.items.some((i) => i.href === "/app/medhelp-60d"), false);
  assert.equal(p.todayBudgetMinutes, 60);
  assert.equal(p.totalEstimatedMinutes, 60);
});

test("Meu Plano: inside the 60D the day shows ONE 60D block and nothing of the regular course (Karina 2026-11-19)", () => {
  const p = plan([week(4, "2026-07-22", "2026-07-28", 30), week(5, "2026-07-29", "2026-08-04", 210)]);
  assert.equal(p.inD60Period, true);
  assert.equal(p.items.length, 1, "only the 60D block — the rest of the day is not filled");
  const block = p.items[0];
  assert.equal(block.title, "MedHelp 60D — semana 4");
  assert.equal(block.href, "/app/medhelp-60d");
  assert.equal(block.estimatedMinutes, 30, "the 30 unticked minutes fall on today, the week's last day");
  assert.equal(block.lines![1], "Hoje: cerca de 30 min");
  assert.equal(p.totalEstimatedMinutes, 30);
  assert.equal(p.todayBudgetMinutes, 30, "what is programmed today: the 60D's share, not the whole availability");
  assert.equal(p.dayComplete, false);
  // every day from today to the eve of the exam: the plan's own queue places nothing
  assert.ok(p.scheduleDays.length > 20);
  for (const d of p.scheduleDays) assert.equal(placed(d), 0, `${d.key}: ${placed(d)}`);
});

test("Meu Plano: the rule holds in EVERY 60D week — Simulado 100Q available, pending, or none (week 8) — and after week 8", () => {
  const all = { preferred_content_types: defaultPrefs().preferred_content_types, simulado_frequency: 1 as const, daily_minutes: 180 };
  for (const weeks of [
    [week(4, "2026-07-22", "2026-07-28", 0, true), week(5, "2026-07-29", "2026-08-04", 0, false), week(6, "2026-08-05", "2026-08-11", 60, false)],
    [week(8, "2026-07-22", "2026-07-28", 20, false)],
    null, // the schedule could not be read: the plan still adds nothing inside the 60 days
  ] as (Weeks | null)[]) {
    const p = plan(weeks, all);
    assert.equal(p.inD60Period, true);
    assert.equal(p.items.some((i) => i.kind === "simulado"), false, "no mini simulado");
    assert.equal(p.items.filter((i) => i.href !== "/app/medhelp-60d").length, 0, "no regular-course activity");
    for (const d of p.scheduleDays) {
      assert.equal(d.simulado, 0, `${d.key}: mini simulado`);
      assert.equal(d.content, 0, `${d.key}: content`);
      assert.equal(d.review, 0, `${d.key}: Revisão`);
    }
  }
});

test("Meu Plano: with everything of the week ticked (or in the days after week 8) the day is empty, and it is not 'time used up'", () => {
  for (const weeks of [null, [week(4, "2026-07-22", "2026-07-28", 0), week(5, "2026-07-29", "2026-08-04", 0)]]) {
    const p = plan(weeks);
    assert.equal(p.inD60Period, true);
    assert.equal(p.items.length, 0);
    assert.equal(p.totalEstimatedMinutes, 0);
    assert.equal(p.dayComplete, false, "the page shows the 60D notice, not 'Meta de hoje concluída'");
  }
});

test("Meu Plano: when the 60D week does not fit, the block says so and nothing is removed", () => {
  const p = plan([week(4, "2026-07-22", "2026-07-28", 500)]);
  const block = p.items[0];
  assert.equal(block.estimatedMinutes, 60, "the 60D takes the whole day, never more than the student's time");
  assert.equal(p.totalEstimatedMinutes, 60);
  assert.equal(p.todayBudgetMinutes, 60);
  assert.match(block.lines!.join(" "), /A carga desta semana é maior que o seu tempo de estudo até 28\/07\. Nenhuma atividade foi retirada\./);
  assert.match(block.lines![0], /3 atividades por concluir nesta semana/);
});

test("Meu Plano: the forecast counts the regular course only up to the day the 60D begins", () => {
  // 30 topics × 40 questions × 2.5 min = 50 h. Exam 2027-05-30, today 2026-07-28: far more than 50 h before 31/03.
  const far = farPlan();
  assert.ok(far.forecast, "an exam ahead has a forecast");
  const last = far.scheduleDays.filter((d) => placed(d) > 0).map((d) => d.key).sort().pop()!;
  assert.ok(last < "2027-03-31", `the last day with a regular activity (${last}) is before the 60D`);
  for (const d of far.scheduleDays.filter((x) => x.key >= "2027-03-31")) assert.equal(placed(d), 0, d.key);
  // a short daily time: what does not fit before the 60D is "não previsto", never pushed into the 60 days
  const short = farPlan({ daily_minutes: 10 });
  assert.ok(short.forecast!.expectedTopics < short.forecast!.pendingTopics);
  for (const d of short.scheduleDays.filter((x) => x.key >= "2027-03-31")) assert.equal(placed(d), 0, d.key);
});

test("Meu Plano page: the 60D notice is the sentence agreed, and no number of 'free minutes' is shown", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "app", "app", "plano", "plano-client.tsx"), "utf8").replace(/\s+/g, " ");
  assert.ok(src.includes("Durante o MedHelp 60D, o Meu Plano programa somente as atividades do cronograma do MedHelp 60D. Os recursos do curso regular continuam disponíveis para você usar quando quiser."));
  assert.equal(/ficam livres/.test(src), false);
});

test("the schedule's presentation is her text, with no separate 'reta final' (Karina 2026-11-19)", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "components", "content", "medhelp-60d-cronograma.tsx"), "utf8");
  const text = src.replace(/\s+/g, " ");
  assert.ok(text.includes("Sequência definida para os 60 dias antes da prova, organizada em oito semanas. Os temas seguem a ordem de prioridade (os mais cobrados primeiro). Marque cada atividade ao concluir."));
  const rendered = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  assert.equal(/reta final/i.test(rendered), false, "no 'reta final' on the schedule");
});
