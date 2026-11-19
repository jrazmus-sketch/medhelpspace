/**
 * MedHelp 60D — the schedule (Karina 2026-11-17 23h06 + 2026-11-18; simulados in weeks 1–7, 2026-11-19).
 *
 * The 60 days before the exam as a FIXED sequence organised in eight weeks (the whole 60D IS the final stretch of
 * the preparation — the page never names a separate "reta final"). Every student of a
 * turma sees the same sequence — it comes from the exam date, the topics' priorities (the consolidated survey:
 * frequency of charging, highest first) and the materials that exist; it does NOT adapt to the student. The
 * student only ticks what was done (manual checklist) and sees, week by week, whether the load fits their time.
 *
 *   - content of a week: the Fórmula MedHelp page and the MemoreCards of each topic of that week;
 *   - weeks 1 to 7: one Simulado 100Q each (Simulado N in week N), followed by its correction;
 *   - week 8: its topics and NO new simulado. The time a simulado and its correction would take stays FREE
 *     (`freeMinutes`): the student uses it to return to difficulties, finish corrections or sit a simulado they
 *     postponed — nothing fills it, neither here nor in Meu Plano;
 *   - the days after week 8: no new item — what is still unticked stays listed in its own week.
 * A material not delivered yet is shown as PENDING in its place and counts no time; when it is delivered it
 * simply becomes an ordinary item. Nothing is removed or reordered silently.
 *
 * PURE module (no server imports): the page, Meu Plano and the tests share it.
 */
import { addDaysKey, diffDaysKey } from "@/lib/br-date";

export const D60_DAYS = 60;
export const D60_WEEKS = 8;
export const D60_SIMULADOS = 7;
export const D60_SIMULADO_QUESTIONS = 100;

export type D60Settings = {
  /** Minutes to study one Fórmula MedHelp page. */
  minutesPerFormulaPage: number;
  /** Seconds per MemoreCard. */
  secondsPerMemorecard: number;
  /** Minutes to answer one question of a Simulado 100Q (the plan's own time per question). */
  minutesPerQuestion: number;
  /** Minutes to correct one question of a Simulado 100Q. */
  correctionMinutesPerQuestion: number;
};

export const DEFAULT_D60_SETTINGS: D60Settings = {
  minutesPerFormulaPage: 5,
  secondsPerMemorecard: 60,
  minutesPerQuestion: 2.5,
  correctionMinutesPerQuestion: 1,
};

/** The plan's settings (study_plan_settings, edited at /admin/plano) → the estimates the schedule uses. */
export function d60SettingsOf(s: {
  minutesPerQuestion: number; d60MinutesPerFormulaPage: number; d60SecondsPerMemorecard: number; d60CorrectionMinutesPerQuestion: number;
}): D60Settings {
  return {
    minutesPerFormulaPage: s.d60MinutesPerFormulaPage, secondsPerMemorecard: s.d60SecondsPerMemorecard,
    minutesPerQuestion: s.minutesPerQuestion, correctionMinutesPerQuestion: s.d60CorrectionMinutesPerQuestion,
  };
}

/** A topic with at least one 60D material (or a Fórmula page that matches no topic: `topicId` null). */
export type D60Unit = {
  topicId: number | null;
  name: string;
  specialtyName: string;
  /** Frequency of charging (questions of the analysed base) and its band; 0 / null for a page without topic. */
  frequency: number;
  tier: string | null;
  formula: { pageId: number; href: string } | null;
  memore: { pageId: number; href: string; cards: number } | null;
};

export type D60SimuladoInput = { n: number; title: string; href: string; questions: number };

export type D60ItemKind = "formula" | "memore" | "sim" | "sim-correcao";

export type D60Item = {
  /** Stable key of the manual checklist. */
  key: string;
  kind: D60ItemKind;
  title: string;
  /** Specialty and priority, or what the simulado item is. */
  detail: string;
  href: string | null;
  minutes: number;
  /** The material was not delivered yet: shown in its place, not tickable, counts no time. */
  pending: boolean;
};

export type D60Week = {
  n: number;
  startKey: string;
  endKey: string;
  items: D60Item[];
  /** Estimated minutes of the week's available items. */
  minutes: number;
  /** A Simulado 100Q with questions is programmed this week (no mini simulado of Meu Plano in it). */
  hasSimulado: boolean;
  /**
   * Minutes of the week left free ON PURPOSE (week 8: the space of one Simulado 100Q and its correction, with no
   * new simulado programmed). Not part of `minutes`; Meu Plano keeps it out of its own queue too.
   */
  freeMinutes: number;
};

export type D60Cronograma = {
  examKey: string;
  /** First day of the 60 (the day the module opens) and the eve of the exam. */
  startKey: string;
  endKey: string;
  weeks: D60Week[];
  /** The days after week 8, up to the eve of the exam: no block of their own on the page, no new item. */
  lastDays: { startKey: string; endKey: string; days: number };
  totals: { items: number; pendingItems: number; minutes: number; units: number; formulaPages: number; memorecards: number };
};

/** The order of the sequence: frequency of charging (highest first), then name; pages without topic last. */
export function orderUnits(units: D60Unit[]): D60Unit[] {
  return [...units].sort((a, b) =>
    (a.topicId == null ? 1 : 0) - (b.topicId == null ? 1 : 0)
    || b.frequency - a.frequency
    || a.name.localeCompare(b.name, "pt"));
}

export function buildCronograma(input: {
  examKey: string;
  units: D60Unit[];
  simulados: D60SimuladoInput[];
  settings: D60Settings;
}): D60Cronograma {
  const { examKey, settings } = input;
  const startKey = addDaysKey(examKey, -D60_DAYS);
  const endKey = addDaysKey(examKey, -1);
  const units = orderUnits(input.units.filter((u) => u.formula || u.memore)).map((u) => ({ ...u }));
  const seen = new Set<string>();
  const simulados = [...input.simulados].sort((a, b) => a.n - b.n).slice(0, D60_SIMULADOS);

  const weeks: D60Week[] = [];
  // Units are dealt in order, as evenly as the count allows: the first weeks take the extra ones.
  const base = Math.floor(units.length / D60_WEEKS);
  const extra = units.length % D60_WEEKS;
  let at = 0;
  for (let w = 1; w <= D60_WEEKS; w++) {
    const take = base + (w <= extra ? 1 : 0);
    const items: D60Item[] = [];
    for (const u of units.slice(at, at + take)) {
      // One page can serve several topics (a section shared by topics): it is listed once, with the first of them.
      if (u.formula && seen.has(`formula:${u.formula.pageId}`)) u.formula = null;
      if (u.memore && seen.has(`memore:${u.memore.pageId}`)) u.memore = null;
      if (u.formula) seen.add(`formula:${u.formula.pageId}`);
      if (u.memore) seen.add(`memore:${u.memore.pageId}`);
      const detail = [u.specialtyName, u.tier ? `prioridade ${u.tier}` : null].filter(Boolean).join(" · ");
      if (u.formula) {
        items.push({
          key: `formula:${u.formula.pageId}`, kind: "formula", title: u.name, detail: detail ? `Fórmula MedHelp · ${detail}` : "Fórmula MedHelp",
          href: u.formula.href, minutes: settings.minutesPerFormulaPage, pending: false,
        });
      }
      if (u.memore) {
        const n = u.memore.cards;
        items.push({
          key: `memore:${u.memore.pageId}`, kind: "memore", title: u.name,
          detail: `MemoreCards · ${n} ${n === 1 ? "cartão" : "cartões"}`,
          href: u.memore.href, minutes: (n * settings.secondsPerMemorecard) / 60, pending: false,
        });
      }
    }
    at += take;
    // Weeks 1 to 7: Simulado 1 to 7, each followed by its correction. Week 8 programmes no new simulado.
    const sim = w <= D60_SIMULADOS ? simulados[w - 1] : undefined;
    let hasSimulado = false;
    if (w <= D60_SIMULADOS) {
      const n = w;
      const ready = !!sim && sim.questions > 0;
      hasSimulado = ready;
      const questions = ready ? sim!.questions : D60_SIMULADO_QUESTIONS;
      items.push({
        key: `sim:${n}`, kind: "sim", title: `Simulado 100Q — ${sim?.title ?? `Simulado ${n}`}`,
        detail: ready ? `${questions} questões` : "Material pendente",
        href: ready ? sim!.href : null, minutes: ready ? questions * settings.minutesPerQuestion : 0, pending: !ready,
      });
      items.push({
        key: `sim-correcao:${n}`, kind: "sim-correcao", title: `Correção do ${sim?.title ?? `Simulado ${n}`}`,
        detail: ready ? "Revise os comentários das questões, com atenção às que errou" : "Material pendente",
        href: ready ? sim!.href : null, minutes: ready ? questions * settings.correctionMinutesPerQuestion : 0, pending: !ready,
      });
    }
    const wStart = addDaysKey(startKey, (w - 1) * 7);
    weeks.push({
      n: w, startKey: wStart, endKey: addDaysKey(wStart, 6), items, hasSimulado,
      freeMinutes: w > D60_SIMULADOS
        ? D60_SIMULADO_QUESTIONS * (settings.minutesPerQuestion + settings.correctionMinutesPerQuestion)
        : 0,
      minutes: items.reduce((s, i) => s + (i.pending ? 0 : i.minutes), 0),
    });
  }
  const fsStart = addDaysKey(startKey, D60_WEEKS * 7);
  const all = weeks.flatMap((w) => w.items);
  return {
    examKey, startKey, endKey, weeks,
    lastDays: { startKey: fsStart, endKey, days: Math.max(0, diffDaysKey(fsStart, endKey) + 1) },
    totals: {
      items: all.length, pendingItems: all.filter((i) => i.pending).length,
      minutes: weeks.reduce((s, w) => s + w.minutes, 0), units: units.length,
      formulaPages: all.filter((i) => i.kind === "formula").length,
      memorecards: units.reduce((s, u) => s + (u.memore?.cards ?? 0), 0),
    },
  };
}

/** Where a day falls: before the 60 days, in week N, in the days after week 8, or on/after the exam. */
export function d60Position(c: D60Cronograma, dayKey: string): { phase: "before" | "week" | "last-days" | "over"; week: number | null } {
  if (dayKey < c.startKey) return { phase: "before", week: null };
  if (dayKey >= c.examKey) return { phase: "over", week: null };
  const w = c.weeks.find((x) => dayKey >= x.startKey && dayKey <= x.endKey);
  return w ? { phase: "week", week: w.n } : { phase: "last-days", week: null };
}

/**
 * Fórmula MedHelp pages have no stored link to the topics: a page belongs to the topic whose address it shares —
 * the page's slug without "-formula" is the topic's slug, or the stem of one of the topic's own pages
 * (Questões section, Revalida Up, Resumo). Returns topic id → page, and the pages that match no topic.
 */
/**
 * Fórmula pages whose address was typed differently from their topic's: page stem → topic slug. Without this the
 * page still appears in the schedule, but at the end, as a page without topic, and its topic counts as not covered.
 */
const FORMULA_STEM_ALIASES: Record<string, string> = {
  "trauma-atendimento-inicial-e-vias-areas": "trauma-atendimento-inicial-e-vias-aereas",
};

export function matchFormulaPages<P extends { slug: string }>(
  pages: P[],
  topics: { id: number; slug: string }[],
  topicPages: { topicId: number; slug: string }[],
): { byTopic: Map<number, P>; unmatched: P[] } {
  const bySlug = new Map(topics.map((t) => [t.slug, t.id]));
  const byStem = new Map<string, number[]>();
  for (const tp of topicPages) {
    for (const suffix of ["-revalida-up", "-quiz", "-resumos"]) {
      if (!tp.slug.endsWith(suffix)) continue;
      const stem = tp.slug.slice(0, -suffix.length);
      const list = byStem.get(stem) ?? [];
      if (!list.includes(tp.topicId)) list.push(tp.topicId);
      byStem.set(stem, list);
    }
  }
  const byTopic = new Map<number, P>();
  const unmatched: P[] = [];
  for (const p of pages) {
    const raw = p.slug.endsWith("-formula") ? p.slug.slice(0, -"-formula".length) : p.slug;
    const stem = FORMULA_STEM_ALIASES[raw] ?? raw;
    const ids = bySlug.has(stem) ? [bySlug.get(stem)!] : byStem.get(stem) ?? [];
    const free = ids.filter((id) => !byTopic.has(id));
    if (free.length === 0) { unmatched.push(p); continue; }
    for (const id of free) byTopic.set(id, p);
  }
  return { byTopic, unmatched };
}

/** Minutes → "5 h" / "1 h 30 min" / "30 min". */
export function d60Duration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total - h * 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
