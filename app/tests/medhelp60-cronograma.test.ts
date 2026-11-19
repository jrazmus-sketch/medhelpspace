/**
 * MedHelp 60D — the schedule (Karina 2026-11-17 23h06 + 2026-11-18). Her rules under test:
 *   1. the sequence is fixed in advance: it comes from the exam date and the priorities, never from the student;
 *   2. subjects are distributed by weeks, each with its Fórmula MedHelp page and MemoreCards;
 *   3. the seven Simulados 100Q are programmed, each with time for correction;
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

test("calendar: 60 days before the exam — eight weeks of seven days and a final stretch of four", () => {
  const c = build();
  assert.equal(c.startKey, "2027-03-31");
  assert.equal(c.endKey, "2027-05-29");
  assert.equal(c.weeks.length, 8);
  assert.deepEqual([c.weeks[0].startKey, c.weeks[0].endKey], ["2027-03-31", "2027-04-06"]);
  assert.deepEqual([c.weeks[7].startKey, c.weeks[7].endKey], ["2027-05-19", "2027-05-25"]);
  assert.deepEqual(c.finalStretch, { startKey: "2027-05-26", endKey: "2027-05-29", days: 4 });
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

test("simulados: the seven Simulados 100Q in weeks 2 to 8, each followed by its correction, with time", () => {
  const c = build();
  assert.equal(c.weeks[0].items.some((i) => i.kind === "sim"), false, "week 1 has no simulado");
  for (let w = 2; w <= 8; w++) {
    const items = c.weeks[w - 1].items;
    const sim = items.find((i) => i.kind === "sim")!; const cor = items.find((i) => i.kind === "sim-correcao")!;
    assert.equal(sim.key, `sim:${w - 1}`);
    assert.equal(cor.key, `sim-correcao:${w - 1}`);
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
  const w2 = c.weeks[1];
  assert.equal(w2.items.find((i) => i.key === "sim:1")!.pending, true);
  assert.equal(w2.items.find((i) => i.key === "sim:1")!.href, null);
  assert.equal(w2.items.find((i) => i.key === "sim:1")!.detail, "Material pendente");
  assert.equal(w2.hasSimulado, false);
  assert.equal(w2.minutes, 15, "only the three Fórmula pages count: 3 × 5 min");
  assert.equal(c.weeks[3].hasSimulado, true, "week 4 holds Simulado 3");
  assert.equal(c.totals.pendingItems, 12);
});

test("pending → delivered: the keys do not move, so the checklist is kept", () => {
  const before = build({ simulados: SIMS.map((s) => ({ ...s, questions: 0 })) });
  const after = build();
  assert.deepEqual(before.weeks.map((w) => w.items.map((i) => i.key)), after.weeks.map((w) => w.items.map((i) => i.key)));
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

test("position: before the 60 days, each week, the final stretch and the exam day", () => {
  const c = build();
  assert.deepEqual(d60Position(c, "2027-03-30"), { phase: "before", week: null });
  assert.deepEqual(d60Position(c, "2027-03-31"), { phase: "week", week: 1 });
  assert.deepEqual(d60Position(c, "2027-04-07"), { phase: "week", week: 2 });
  assert.deepEqual(d60Position(c, "2027-05-25"), { phase: "week", week: 8 });
  assert.deepEqual(d60Position(c, "2027-05-26"), { phase: "final", week: null });
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

test("Meu Plano: outside the 60D (or with everything ticked) the day is the plan's own, with no 60D block", () => {
  for (const weeks of [null, [week(4, "2026-07-22", "2026-07-28", 0), week(5, "2026-07-29", "2026-08-04", 0)]]) {
    const p = plan(weeks);
    assert.equal(p.items.some((i) => i.href === "/app/medhelp-60d"), false);
    assert.equal(p.todayBudgetMinutes, 60);
    assert.equal(p.totalEstimatedMinutes, 60);
  }
});

test("Meu Plano: the 60D comes first in the day, as ONE block, and the plan fills the rest of the same time", () => {
  const p = plan([week(4, "2026-07-22", "2026-07-28", 30), week(5, "2026-07-29", "2026-08-04", 210)]);
  const first = p.items[0];
  assert.equal(first.title, "MedHelp 60D — semana 4");
  assert.equal(first.href, "/app/medhelp-60d");
  assert.equal(first.estimatedMinutes, 30, "the 30 unticked minutes fall on today, the week's last day");
  assert.equal(first.lines![1], "Hoje: cerca de 30 min");
  assert.equal(p.items.filter((i) => i.href === "/app/medhelp-60d").length, 1, "the activities are not listed again here");
  assert.equal(p.todayBudgetMinutes, 60, "one availability: the day is still the student's 60 minutes");
  assert.equal(p.totalEstimatedMinutes, 60);
  assert.ok(p.items.length > 1, "the plan's own queue takes the other 30 minutes");
  // week 5: 210 min over 7 study days = 30 a day for the 60D → the plan places at most 30 on each of those days
  const w5 = p.scheduleDays.filter((d) => d.key >= "2026-07-29" && d.key <= "2026-08-04");
  assert.equal(w5.length, 7);
  for (const d of w5) assert.ok(placed(d) <= 30.01, `${d.key}: ${placed(d)}`);
  // after the weeks given, the plan has the whole day again
  assert.ok(p.scheduleDays.filter((d) => d.key > "2026-08-04").some((d) => placed(d) > 50));
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

test("Meu Plano: no new mini simulado in a 60D week that holds a Simulado 100Q", () => {
  const all = { preferred_content_types: defaultPrefs().preferred_content_types, simulado_frequency: 1 as const, daily_minutes: 120 };
  const weeks = [
    week(4, "2026-07-22", "2026-07-28", 0, true), week(5, "2026-07-29", "2026-08-04", 0, true),
    week(6, "2026-08-05", "2026-08-11", 0, false),
  ];
  const withSim = plan(weeks, all);
  const without = plan(null, all);
  const sim = (p: ReturnType<typeof plan>, from: string, to: string) =>
    p.scheduleDays.filter((d) => d.key >= from && d.key <= to).reduce((s, d) => s + d.simulado, 0);
  assert.ok(sim(without, "2026-07-29", "2026-08-04") > 0, "normally that week has its mini simulado");
  assert.equal(sim(withSim, "2026-07-29", "2026-08-04"), 0, "week 5 holds a Simulado 100Q: no mini simulado");
  assert.ok(sim(withSim, "2026-08-05", "2026-08-11") > 0, "week 6 has none available: the mini simulado stays");
  assert.equal(withSim.items.some((i) => i.kind === "simulado"), false, "today is in week 4, which holds a Simulado 100Q");
});
