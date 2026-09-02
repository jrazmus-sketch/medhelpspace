/**
 * Pure library filters — no server imports, so both the pages and the tests
 * can use them. The data loader lives in ./library (it reaches auth and the DB).
 */

import { FORMATS, type CaseFormat, type CaseListRow } from "./types";

/** Narrow a URL segment to a real format, or null. */
export function toFormat(raw: string | undefined): CaseFormat | null {
  return FORMATS.includes(raw as CaseFormat) ? (raw as CaseFormat) : null;
}

/**
 * Narrow the ONE library. Applying format-then-specialty (Porta A) and
 * specialty-then-format (Porta B) must land on the same rows — that is the
 * whole point of the two doors (Karina, 2026-09-02).
 */
export function filterCases(
  cases: CaseListRow[],
  { format, specialtyId }: { format?: CaseFormat | null; specialtyId?: number | null },
): CaseListRow[] {
  return cases.filter(
    (c) => (!format || c.format === format) && (specialtyId == null || c.specialty_id === specialtyId),
  );
}
