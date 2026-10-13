/**
 * Cenário clínico — where the case happens (Karina, 2026-10-12/13).
 *
 * A metadatum of its own, independent of FORMATO, ESPECIALIDADE and TEMA: one
 * main scenario per case. Stored as a stable slug (`clinact_cases.scenario`,
 * CHECK-constrained to these six); shown with her names. Atenção Primária /
 * Atenção Básica / UBS are scenarios, NEVER specialties.
 *
 * Pure (no server imports): the importer, the admin, the library filters and
 * the tests all share it.
 */
export const SCENARIOS = [
  { slug: "atencao_primaria", label: "Atenção Primária / UBS", short: "APS / UBS" },
  { slug: "ambulatorio", label: "Ambulatório / Consultório", short: "Ambulatório" },
  { slug: "urgencia", label: "Urgência", short: "Urgência" },
  { slug: "emergencia", label: "Emergência", short: "Emergência" },
  { slug: "hospital", label: "Hospital / Enfermaria", short: "Hospital" },
  { slug: "maternidade", label: "Maternidade / Centro Obstétrico", short: "Maternidade" },
] as const;

export type Scenario = (typeof SCENARIOS)[number]["slug"];

export const SCENARIO_SLUGS: readonly Scenario[] = SCENARIOS.map((s) => s.slug);

export function isScenario(v: unknown): v is Scenario {
  return typeof v === "string" && (SCENARIO_SLUGS as readonly string[]).includes(v);
}

export function scenarioLabel(slug: string | null | undefined): string | null {
  return SCENARIOS.find((s) => s.slug === slug)?.label ?? null;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * What an author may write after `CENÁRIO:` — the full name, the chip name,
 * the slug, or either half of a "A / B" name ("UBS", "Consultório",
 * "Enfermaria", "Centro Obstétrico"), plus APS / Atenção Básica. Accents,
 * case and punctuation are ignored.
 */
const ALIASES: Record<string, Scenario> = (() => {
  const out: Record<string, Scenario> = {};
  for (const s of SCENARIOS) {
    for (const v of [s.slug.replace(/_/g, " "), s.label, s.short, ...s.label.split("/")]) out[norm(v)] = s.slug;
  }
  // Only unambiguous extras: a guess that files a case under the wrong
  // scenario is worse than the import error that asks the author.
  Object.assign(out, {
    aps: "atencao_primaria",
    "atencao basica": "atencao_primaria",
  } satisfies Record<string, Scenario>);
  return out;
})();

/**
 * Read a `CENÁRIO:` value. Unknown text is an ERROR, never a silent null
 * (Karina 2026-10-13: "prefiro erro explícito a permitir que o caso perca
 * silenciosamente sua classificação").
 */
export function parseScenario(raw: string): { ok: true; slug: Scenario } | { ok: false; message: string } {
  const slug = ALIASES[norm(raw)];
  if (slug) return { ok: true, slug };
  return {
    ok: false,
    message: `CENÁRIO "${raw.trim()}" não reconhecido. Use um destes: ${SCENARIOS.map((s) => s.label).join("; ")}.`,
  };
}
