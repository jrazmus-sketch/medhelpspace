/**
 * The ClinAct library — server-only.
 *
 * Karina froze its architecture on 2026-09-02: TWO doors into ONE set of
 * cases.
 *
 *   Porta A — "como quero treinar?"  formato → especialidade → caso
 *   Porta B — "o que quero treinar?" especialidade → formato → caso
 *
 * Both doors reach the same case, the same id and the same history — there is
 * no second library and nothing is duplicated. The TEMA is deliberately NOT a
 * third public layer: it stays internal taxonomy (filters, review queue,
 * reports, Minha Evolução) and only surfaces once a case is finished.
 */

import { getClinactViewer } from "./access";
import { listPublishedCases, getCanonicalAttempts, getTaxonomy } from "./queries";
import { getDueClinactReviews } from "./review";
import { FORMATS, type CaseFormat, type CaseListRow } from "./types";

export { toFormat, filterCases } from "./library-filters";

export type LibrarySpecialty = { id: number; slug: string; name: string; count: number };

export type Library = {
  viewer: Awaited<ReturnType<typeof getClinactViewer>>;
  cases: CaseListRow[];
  done: Map<number, { score: number | null }>;
  /** Only specialties that actually have a published case, in taxonomy order. */
  specialties: LibrarySpecialty[];
  countByFormat: Record<CaseFormat, number>;
  specialtyName: (id: number | null) => string | null;
  dueReviews: CaseListRow[];
};

export async function loadLibrary(): Promise<Library> {
  const viewer = await getClinactViewer();
  const [cases, done, taxonomy, due] = await Promise.all([
    listPublishedCases(),
    getCanonicalAttempts(viewer.userId),
    getTaxonomy(),
    getDueClinactReviews(viewer.userId),
  ]);

  const byId = new Map(cases.map((c) => [c.id, c]));
  const nameById = new Map(taxonomy.specialties.map((s) => [s.id, s.name]));

  const countBySpecialty = new Map<number, number>();
  for (const c of cases) {
    if (c.specialty_id != null) countBySpecialty.set(c.specialty_id, (countBySpecialty.get(c.specialty_id) ?? 0) + 1);
  }

  const countByFormat = Object.fromEntries(FORMATS.map((f) => [f, 0])) as Record<CaseFormat, number>;
  for (const c of cases) countByFormat[c.format] += 1;

  return {
    viewer,
    cases,
    done,
    specialties: taxonomy.specialties
      .map((s) => ({ ...s, count: countBySpecialty.get(s.id) ?? 0 }))
      .filter((s) => s.count > 0),
    countByFormat,
    specialtyName: (id) => (id == null ? null : nameById.get(id) ?? null),
    // Only reviews the reader can actually open: still published, still playable.
    dueReviews: due
      .map((r) => byId.get(r.case_id))
      .filter((c): c is CaseListRow => !!c && (viewer.hasAccess || c.is_free)),
  };
}
