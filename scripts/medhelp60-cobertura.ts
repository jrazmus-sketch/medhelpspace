/**
 * MedHelp 60D — coverage of the schedule against the platform's content, and how much of it fits in the 60 days
 * (Karina 2026-11-18, 19h40). READ-ONLY. Uses the same pure builder as the page (app/src/lib/medhelp60/cronograma.ts).
 *
 *   node --import ./app/tests/helpers/alias-hook.mjs scripts/medhelp60-cobertura.ts [<DATABASE_URL>] [--exame 2027-04-25] [--json out.json]
 *
 * What it answers:
 *   1. topics: how many of the platform's topics have a 60D material (Fórmula MedHelp and/or MemoreCards), each once;
 *   2. questions: how many originals of the bank (2020 → 2026.1) belong to those topics. This is a match BY TOPIC —
 *      it does not say that the material covers each point the questions charged;
 *   3. the same by frequency of charging (1, 2, 3, 4–5, 6–8, 9 or more);
 *   4. load: the schedule with the materials available today and with the full planned structure (seven Simulados
 *      100Q + corrections), and how much of it fits with a given daily time, 5 or 6 days a week, in the eight weeks
 *      (the final days of the 60 hold no new item and are left free).
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import {
  buildCronograma, d60SettingsOf, matchFormulaPages, d60Duration, D60_SIMULADOS, D60_SIMULADO_QUESTIONS, D60_WEEKS,
  type D60Unit, type D60SimuladoInput,
} from "@/lib/medhelp60/cronograma";
import { settingsFromRow } from "@/lib/study-plan/settings";

const require = createRequire(import.meta.url);
const postgres = require("postgres");
const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const url = args.find((a) => /^postgres(ql)?:\/\//.test(a)) ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = postgres(url, { max: 1, prepare: false, ssl: /127\.0\.0\.1|localhost/.test(url) ? false : "require" });
const exam = arg("--exame") ?? "2027-04-25";

const BANDS: { label: string; test: (n: number) => boolean }[] = [
  { label: "1 vez", test: (n) => n === 1 },
  { label: "2 vezes", test: (n) => n === 2 },
  { label: "3 vezes", test: (n) => n === 3 },
  { label: "4 ou 5 vezes", test: (n) => n === 4 || n === 5 },
  { label: "6 a 8 vezes", test: (n) => n >= 6 && n <= 8 },
  { label: "9 vezes ou mais", test: (n) => n >= 9 },
];
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

async function main() {
  const data = await sql.begin("read only", async (tx: typeof sql) => ({
    topics: await tx`select t.id, t.name, t.slug, t.incidence_count n, t.priority_tier tier, s.name spec from topics t left join specialties s on s.id = t.specialty_id`,
    links: await tx`select c.topic_id, c.resource_type kind, p.id page_id, p.slug, s.slug spec from topic_content c join pages p on p.id = c.page_id and p.status = 'publish' left join specialties s on s.id = p.specialty_id`,
    formula: await tx`select p.id, p.slug, p.title, s.slug spec, s.name spec_name from pages p left join specialties s on s.id = p.specialty_id
                      where p.view = 'formula' and p.type <> 'blurb-nav-hub' and p.status = 'publish' and p.slug <> 'formula-medhelp'`,
    memore: await tx`select topic_page_id page_id, count(*)::int cards from memorecard_items group by 1`,
    sims: await tx`select p.slug, p.title, (select count(*)::int from quiz_questions q where q.page_id = p.id) n from pages p
                   where p.content_module_id = 1 and p.view = 'simulados' and p.type = 'h5p-quiz' and p.status = 'publish' and p.slug like 'simulado-100q-%' order by p.slug`,
    settings: (await tx`select * from study_plan_settings limit 1`)[0] ?? null,
  }));
  await sql.end();
  const num = (v: unknown) => Number(v);
  const topics = data.topics.map((t: Record<string, unknown>) => ({ id: num(t.id), name: String(t.name), slug: String(t.slug), n: num(t.n), tier: t.tier as string | null, spec: String(t.spec ?? "") }));
  type Topic = (typeof topics)[number];
  const topicPages = data.links.map((l: Record<string, unknown>) => ({ topicId: num(l.topic_id), slug: String(l.slug) }));
  const ruOf = new Map<number, { pageId: number; slug: string; spec: string }>();
  for (const l of data.links) if (l.kind === "revalida_up" && !ruOf.has(num(l.topic_id))) ruOf.set(num(l.topic_id), { pageId: num(l.page_id), slug: String(l.slug), spec: String(l.spec ?? "geral") });
  const formula = data.formula.map((f: Record<string, unknown>) => ({ id: num(f.id), slug: String(f.slug), title: String(f.title), spec: String(f.spec ?? "geral"), specName: String(f.spec_name ?? "") }));
  const { byTopic, unmatched } = matchFormulaPages(formula, topics, topicPages);
  const cards = new Map<number, number>(data.memore.map((m: Record<string, unknown>) => [num(m.page_id), num(m.cards)]));
  const memoreOf = (t: Topic) => { const ru = ruOf.get(t.id); const c = ru ? cards.get(ru.pageId) ?? 0 : 0; return ru && c > 0 ? { ru, c } : null; };
  const hasFormula = (t: Topic) => byTopic.has(t.id);
  const covered = (t: Topic) => hasFormula(t) || !!memoreOf(t);

  // ── 1 + 2 + 3: topics and questions ────────────────────────────────────────────────────────────────────────
  const withQ = topics.filter((t: Topic) => t.n > 0);
  const bank = withQ.reduce((s: number, t: Topic) => s + t.n, 0);
  const cov = topics.filter(covered);
  const covQ = cov.filter((t: Topic) => t.n > 0);
  const out_ = topics.filter((t: Topic) => !covered(t));
  const row = (list: Topic[]) => ({
    temas: list.length, contemplados: list.filter(covered).length, comFormula: list.filter(hasFormula).length, comMemoreCards: list.filter((t) => !!memoreOf(t)).length,
    questoes: list.reduce((s, t) => s + t.n, 0), questoesContempladas: list.filter(covered).reduce((s, t) => s + t.n, 0),
  });
  const bands = BANDS.map((b) => { const list = withQ.filter((t: Topic) => b.test(t.n)); const r = row(list); return { faixa: b.label, ...r, pctTemas: pct(r.contemplados, r.temas), pctQuestoes: pct(r.questoesContempladas, r.questoes) }; });
  const specs = [...new Set(topics.map((t: Topic) => t.spec))].sort((a, b) => String(a).localeCompare(String(b), "pt")).map((s) => {
    const list = topics.filter((t: Topic) => t.spec === s); const r = row(list); return { especialidade: s, ...r, pctTemas: pct(r.contemplados, r.temas), pctQuestoes: pct(r.questoesContempladas, r.questoes) };
  });

  // ── 4: load ───────────────────────────────────────────────────────────────────────────────────────────────
  const units: D60Unit[] = topics.map((t: Topic) => {
    const f = byTopic.get(t.id) as (typeof formula)[number] | undefined; const m = memoreOf(t);
    return {
      topicId: t.id, name: t.name, specialtyName: t.spec, frequency: t.n, tier: t.tier,
      formula: f ? { pageId: f.id, href: `/app/${f.spec}/${f.slug}` } : null,
      memore: m ? { pageId: m.ru.pageId, href: `/app/memorecards/${m.ru.spec}`, cards: m.c } : null,
    };
  });
  for (const f of unmatched as (typeof formula)) units.push({ topicId: null, name: f.title.replace(/\s+F[oó]rmula$/i, ""), specialtyName: f.specName, frequency: 0, tier: null, formula: { pageId: f.id, href: `/app/${f.spec}/${f.slug}` }, memore: null });
  const settings = d60SettingsOf(settingsFromRow(data.settings));
  const simsToday: D60SimuladoInput[] = data.sims.map((s: Record<string, unknown>) => ({ n: Number(String(s.slug).replace("simulado-100q-", "")), title: String(s.title), href: `/app/geral/${s.slug}`, questions: num(s.n) }));
  const simsFull: D60SimuladoInput[] = Array.from({ length: D60_SIMULADOS }, (_, i) => ({ n: i + 1, title: `Simulado ${i + 1}`, href: "", questions: D60_SIMULADO_QUESTIONS }));
  const load = (sims: D60SimuladoInput[]) => {
    const c = buildCronograma({ examKey: exam, units, simulados: sims, settings });
    const kind = (k: string) => c.weeks.flatMap((w) => w.items).filter((i) => i.kind === k && !i.pending);
    const part = (k: string) => Math.round(kind(k).reduce((s, i) => s + i.minutes, 0));
    const weeks = c.weeks.map((w) => Math.round(w.minutes));
    const total = weeks.reduce((s, m) => s + m, 0);
    // How much fits: the student follows the sequence with `minutes` a day on `days` days of each of the eight weeks;
    // what does not fit in a week is carried to the next. The final days of the 60 are left free.
    const fit = [60, 90, 120, 150, 180].flatMap((minutes) => [5, 6].map((days) => {
      const capacity = minutes * days * D60_WEEKS; let left = 0; let doneWeeks = 0; let done = 0;
      for (let w = 0; w < weeks.length; w++) { left += weeks[w]; const did = Math.min(left, minutes * days); left -= did; done += did; if (left <= 0.5) doneWeeks = w + 1; }
      return { minutosPorDia: minutes, diasPorSemana: days, capacidadeMin: capacity, percorridoMin: Math.round(done), pct: pct(done, total), semanasEmDia: doneWeeks, faltamMin: Math.round(left) };
    }));
    const needed = [5, 6].map((days) => {
      // Smallest daily time (5-minute steps) with which nothing is left after week 8.
      let m = 5; for (; m <= 600; m += 5) { let left = 0; for (const w of weeks) left = Math.max(0, left + w - m * days); if (left <= 0.5) break; }
      return { diasPorSemana: days, minutosPorDia: m, mediaSimples: Math.ceil(total / (days * D60_WEEKS)), semanaMaisPesadaMin: Math.max(...weeks) };
    });
    return {
      atividades: c.totals.items, pendentes: c.totals.pendingItems, totalMin: total, total: d60Duration(total),
      formula: { paginas: kind("formula").length, min: part("formula") }, memorecards: { temas: kind("memore").length, cartoes: c.totals.memorecards, min: part("memore") },
      simulados: { disponiveis: kind("sim").length, min: part("sim") }, correcoes: { min: part("sim-correcao") }, semanasMin: weeks, cabe: fit, necessario: needed,
      retaFinalDias: c.finalStretch.days,
    };
  };

  const out = {
    exam, settings,
    temas: { plataforma: topics.length, comQuestoes: withQ.length, contemplados: cov.length, pct: pct(cov.length, topics.length), contempladosComQuestoes: covQ.length, pctComQuestoes: pct(covQ.length, withQ.length),
      comFormula: topics.filter(hasFormula).length, comMemoreCards: topics.filter((t: Topic) => !!memoreOf(t)).length, comOsDois: topics.filter((t: Topic) => hasFormula(t) && !!memoreOf(t)).length,
      paginasFormula: formula.length, paginasFormulaSemTema: (unmatched as (typeof formula)).map((f) => f.title) },
    questoes: { banco: bank, contempladas: covQ.reduce((s: number, t: Topic) => s + t.n, 0), pct: pct(covQ.reduce((s: number, t: Topic) => s + t.n, 0), bank),
      comFormula: topics.filter(hasFormula).reduce((s: number, t: Topic) => s + t.n, 0), comMemoreCards: topics.filter((t: Topic) => !!memoreOf(t)).reduce((s: number, t: Topic) => s + t.n, 0) },
    faixas: bands, especialidades: specs,
    fora: out_.sort((a: Topic, b: Topic) => b.n - a.n || a.name.localeCompare(b.name, "pt")).map((t: Topic) => ({ tema: t.name, especialidade: t.spec, vezes: t.n, faixa: t.tier })),
    simulados100q: simsToday.map((s) => ({ n: s.n, questoes: s.questions })),
    cargaHoje: load(simsToday), cargaCompleta: load(simsFull),
  };
  console.log(`Temas: ${out.temas.contemplados} de ${out.temas.plataforma} (${out.temas.pct}%) | com questões: ${out.temas.contempladosComQuestoes} de ${out.temas.comQuestoes} (${out.temas.pctComQuestoes}%) | Fórmula ${out.temas.comFormula}, MemoreCards ${out.temas.comMemoreCards}, os dois ${out.temas.comOsDois}`);
  console.log(`Questões: ${out.questoes.contempladas} de ${out.questoes.banco} (${out.questoes.pct}%)`);
  for (const b of bands) console.log(`  ${b.faixa}: temas ${b.contemplados}/${b.temas} (${b.pctTemas}%) · questões ${b.questoesContempladas}/${b.questoes} (${b.pctQuestoes}%)`);
  for (const [k, c] of [["HOJE", out.cargaHoje], ["COMPLETA", out.cargaCompleta]] as const) {
    console.log(`Carga ${k}: ${c.total} — Fórmula ${c.formula.paginas} pág. ${d60Duration(c.formula.min)} · MemoreCards ${c.memorecards.cartoes} cartões ${d60Duration(c.memorecards.min)} · Simulados ${c.simulados.disponiveis} ${d60Duration(c.simulados.min)} · correções ${d60Duration(c.correcoes.min)} | semanas ${c.semanasMin.join(", ")}`);
    for (const f of c.cabe) console.log(`    ${f.minutosPorDia} min × ${f.diasPorSemana} dias: ${f.pct}% (${d60Duration(f.percorridoMin)}), semanas em dia ${f.semanasEmDia}, faltam ${d60Duration(f.faltamMin)}`);
    for (const n of c.necessario) console.log(`    necessário ${n.diasPorSemana} dias/semana: ${n.minutosPorDia} min por dia (média ${n.mediaSimples}; semana mais pesada ${d60Duration(n.semanaMaisPesadaMin)})`);
  }
  console.log(`Fora (${out.fora.length}): com questões ${out.fora.filter((t) => t.vezes > 0).length} | páginas de Fórmula sem tema: ${out.temas.paginasFormulaSemTema.length}`);
  const j = arg("--json"); if (j) writeFileSync(j, JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
