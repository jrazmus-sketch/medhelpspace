/**
 * Pure library filters — no server imports, so both the pages and the tests
 * can use them. The data loader lives in ./library (it reaches auth and the DB).
 */

import { FORMATS, type CaseFormat, type CaseListRow } from "./types";
import { SCENARIOS, isScenario, type Scenario } from "./scenarios";

/** Narrow a URL segment to a real format, or null. */
export function toFormat(raw: string | undefined): CaseFormat | null {
  return FORMATS.includes(raw as CaseFormat) ? (raw as CaseFormat) : null;
}

/** Narrow a URL segment to a real scenario, or null. */
export function toScenario(raw: string | undefined): Scenario | null {
  return isScenario(raw) ? raw : null;
}

/**
 * Narrow the ONE library. Applying format-then-specialty (Porta A) and
 * specialty-then-format (Porta B) must land on the same rows — that is the
 * whole point of the two doors (Karina, 2026-09-02). The clinical scenario
 * (2026-10-13) is a third, independent criterion: all three combine.
 */
export function filterCases(
  cases: CaseListRow[],
  { format, specialtyId, scenario }: { format?: CaseFormat | null; specialtyId?: number | null; scenario?: Scenario | null },
): CaseListRow[] {
  return cases.filter(
    (c) =>
      (!format || c.format === format) &&
      (specialtyId == null || c.specialty_id === specialtyId) &&
      (!scenario || c.scenario === scenario),
  );
}

/** How many cases each scenario has within `cases` — always all six keys, so a zero chip stays in the row. */
export function scenarioCounts(cases: { scenario: string | null }[]): Record<Scenario, number> {
  const out = Object.fromEntries(SCENARIOS.map((s) => [s.slug, 0])) as Record<Scenario, number>;
  for (const c of cases) if (c.scenario && c.scenario in out) out[c.scenario as Scenario] += 1;
  return out;
}

/**
 * The free trial (Karina 2026-11-03): ONE free case per format, in the fixed
 * format order, so /clinact/gratis always reads Código Clínico → Clínica em
 * Cena → Decisão em 30 Segundos → Ponto de Virada. A format without a free
 * case is simply absent; a second free case of a format stays in the library.
 */
export function freeCaseSet<T extends Pick<CaseListRow, "format" | "is_free">>(cases: T[]): T[] {
  return FORMATS.map((f) => cases.find((c) => c.format === f && c.is_free)).filter((c): c is T => !!c);
}
