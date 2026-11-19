/**
 * MedHelp 60D — the weekly distribution of the schedule, from a database's content (READ-ONLY). The same pure builder
 * the page uses (app/src/lib/medhelp60/cronograma.ts), so what this prints is what the student sees.
 *
 *   node --import ./app/tests/helpers/alias-hook.mjs scripts/medhelp60-distribuicao.ts [<DATABASE_URL>] --exame 2027-05-30 [--json out.json]
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { buildCronograma, d60SettingsOf, matchFormulaPages, d60Duration, type D60Unit, type D60SimuladoInput } from "@/lib/medhelp60/cronograma";
import { settingsFromRow } from "@/lib/study-plan/settings";

const require = createRequire(import.meta.url);
const postgres = require("postgres");
const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const url = args.find((a) => /^postgres(ql)?:\/\//.test(a)) ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = postgres(url, { max: 1, prepare: false, ssl: /127\.0\.0\.1|localhost/.test(url) ? false : "require" });
const exam = arg("--exame") ?? "2027-05-30";

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
  const topicPages = data.links.map((l: Record<string, unknown>) => ({ topicId: num(l.topic_id), slug: String(l.slug) }));
  const ruOf = new Map<number, { pageId: number; slug: string; spec: string }>();
  for (const l of data.links) if (l.kind === "revalida_up" && !ruOf.has(num(l.topic_id))) ruOf.set(num(l.topic_id), { pageId: num(l.page_id), slug: String(l.slug), spec: String(l.spec ?? "geral") });
  const formula = data.formula.map((f: Record<string, unknown>) => ({ id: num(f.id), slug: String(f.slug), title: String(f.title), spec: String(f.spec ?? "geral"), specName: String(f.spec_name ?? "") }));
  const { byTopic, unmatched } = matchFormulaPages(formula, topics, topicPages);
  const cards = new Map<number, number>(data.memore.map((m: Record<string, unknown>) => [num(m.page_id), num(m.cards)]));
  const units: D60Unit[] = topics.map((t: (typeof topics)[number]) => {
    const f = byTopic.get(t.id) as (typeof formula)[number] | undefined; const ru = ruOf.get(t.id); const c = ru ? cards.get(ru.pageId) ?? 0 : 0;
    return {
      topicId: t.id, name: t.name, specialtyName: t.spec, frequency: t.n, tier: t.tier,
      formula: f ? { pageId: f.id, href: `/app/${f.spec}/${f.slug}` } : null,
      memore: ru && c > 0 ? { pageId: ru.pageId, href: `/app/memorecards/${ru.spec}?tema=${ru.slug.replace(/-revalida-up$/, "")}`, cards: c } : null,
    };
  });
  for (const f of unmatched as (typeof formula)) units.push({ topicId: null, name: f.title.replace(/\s+F[oó]rmula$/i, ""), specialtyName: f.specName, frequency: 0, tier: null, formula: { pageId: f.id, href: `/app/${f.spec}/${f.slug}` }, memore: null });
  const simulados: D60SimuladoInput[] = data.sims.map((s: Record<string, unknown>) => ({ n: Number(String(s.slug).replace("simulado-100q-", "")), title: String(s.title), href: `/app/geral/${s.slug}`, questions: num(s.n) }));
  const c = buildCronograma({ examKey: exam, units, simulados, settings: d60SettingsOf(settingsFromRow(data.settings)) });

  const out = {
    exam, start: c.startKey, end: c.endKey, totals: c.totals,
    weeks: c.weeks.map((w) => {
      const f = w.items.filter((i) => i.kind === "formula"); const m = w.items.filter((i) => i.kind === "memore");
      const sim = w.items.find((i) => i.kind === "sim");
      const tiers = f.map((i) => (i.detail.match(/prioridade ([A-D])/) || [])[1] ?? "—");
      const by = (k: string) => tiers.filter((t) => t === k).length;
      return {
        n: w.n, from: w.startKey, to: w.endKey, formula: f.length, memoreThemes: m.length,
        memoreCards: m.reduce((s, i) => s + Number((i.detail.match(/(\d+) cart/) || [0, 0])[1]), 0),
        simulado: sim ? (sim.pending ? `${sim.title.replace("Simulado 100Q — ", "")} (pendente)` : sim.title.replace("Simulado 100Q — ", "")) : "—",
        minutes: Math.round(w.minutes), load: d60Duration(w.minutes), tiers: { A: by("A"), B: by("B"), C: by("C"), D: by("D"), sem: by("—") },
        first: f[0]?.title ?? "", last: f[f.length - 1]?.title ?? "",
      };
    }),
    lastDays: c.lastDays,
    noTopicPages: (unmatched as (typeof formula)).map((f) => f.title),
    topicsWithout60d: topics.filter((t: (typeof topics)[number]) => t.n > 0 && !byTopic.has(t.id) && !(ruOf.get(t.id) && (cards.get(ruOf.get(t.id)!.pageId) ?? 0) > 0)).length,
  };
  for (const w of out.weeks) console.log(`Semana ${w.n} ${w.from}→${w.to} | Fórmula ${w.formula} (A ${w.tiers.A} B ${w.tiers.B} C ${w.tiers.C} D ${w.tiers.D} sem ${w.tiers.sem}) | MemoreCards ${w.memoreThemes} temas / ${w.memoreCards} cartões | ${w.simulado} | carga ${w.load} | ${w.first} … ${w.last}`);
  console.log(`Dias depois da semana 8 ${out.lastDays.startKey}→${out.lastDays.endKey} (${out.lastDays.days} dias) | total ${out.totals.items} atividades, ${out.totals.pendingItems} pendentes, ${d60Duration(out.totals.minutes)} | Fórmula ${out.totals.formulaPages} páginas | MemoreCards ${out.totals.memorecards} cartões | temas com questões sem material do 60D: ${out.topicsWithout60d}`);
  const j = arg("--json"); if (j) writeFileSync(j, JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
