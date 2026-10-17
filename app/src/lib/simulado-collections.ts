// The collections inside Simulados → GERAL (Karina 2026-10-17, "Atualização dos Simulados
// Revalida"). GERAL used to be one flat grid of 20 mock exams; with the 38 "Questões Pegada
// INEP" it became two cards, each opening its own numbered grid. POR ÁREAS is untouched.
//
// A Geral simulado is a view='simulados' h5p-quiz page with specialty_id NULL and
// content_module_id NULL (the 60D Simulados 100Q share the shape and differ by module).
// Its COLLECTION is its slug prefix — no column, so nothing to migrate and nothing that can
// disagree with the slug the importer wrote:
//   simulado-geral-<n>  → Simulados Gerais     (July 2026 import)
//   pegada-inep-<n>     → Questões Pegada INEP (scripts/apply-pegada-inep.js)
//
// Pure module (no server imports): the cards, the collection page, breadcrumbs, the quiz
// page's tagline, "next simulado" and the dashboard's Continuar card all read it, and the
// tests import it directly.

export type SimuladoCollectionKey = "gerais" | "pegada-inep";

export type SimuladoCollection = {
  key: SimuladoCollectionKey;
  /** Every page of the collection has slug `${slugPrefix}<n>`. */
  slugPrefix: string;
  /** Card title, collection page heading and breadcrumb (site_content `${copyKey}.title`). */
  title: string;
  /** Card description, shown under the collection heading (site_content `${copyKey}.desc`). */
  description: string;
  /** Line under a simulado's title on its own page; null → the (editable) description. */
  tagline: string | null;
  /** Prefix of the site_content keys that let admins edit title/description inline. */
  copyKey: string;
};

// Order = display order on the GERAL row. Titles and descriptions are Karina's text
// verbatim; they are the fallbacks the site_content rows were seeded with.
export const SIMULADO_COLLECTIONS: readonly SimuladoCollection[] = [
  {
    key: "gerais",
    slugPrefix: "simulado-geral-",
    title: "Simulados Gerais",
    description: "Questões elaboradas no estilo de cobrança do Revalida.",
    // Unchanged from before the split — these ARE written for the platform.
    tagline: "Questões inéditas no padrão da banca",
    copyKey: "simcol.gerais",
  },
  {
    key: "pegada-inep",
    slugPrefix: "pegada-inep-",
    title: "Questões Pegada INEP",
    description: "Questões selecionadas de provas de outras instituições.",
    // NOT "inéditas": they come from ENARE, HCPA, UNESP, SES-GO… exams. Her description
    // already says exactly that, so the tagline follows it (and any edit to it).
    tagline: null,
    copyKey: "simcol.pegada-inep",
  },
];

/** The page that lists one collection's simulados. */
export function collectionHref(key: SimuladoCollectionKey): string {
  return `/app/estudo-por-questoes/simulados/${key}`;
}

/** Where every Geral simulado is played (the [specialty] segment is cosmetic). */
export function geralSimuladoHref(slug: string): string {
  return `/app/geral/${slug}`;
}

export function collectionByKey(key: string): SimuladoCollection | null {
  return SIMULADO_COLLECTIONS.find((c) => c.key === key) ?? null;
}

/** The collection a page belongs to, from its slug — null for every other page. */
export function collectionForSlug(slug: string): SimuladoCollection | null {
  return SIMULADO_COLLECTIONS.find((c) => new RegExp(`^${c.slugPrefix}\\d+$`).test(slug)) ?? null;
}

/** "pegada-inep-12" → 12; 0 when the slug carries no trailing number. */
export function simuladoNumber(slug: string): number {
  const m = slug.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Collection copy with the admin's site_content edits applied over the fallbacks. */
export function collectionCopy(
  c: SimuladoCollection,
  rows: Record<string, { value: string } | undefined>,
): { title: string; description: string; tagline: string } {
  const title = rows[`${c.copyKey}.title`]?.value || c.title;
  const description = rows[`${c.copyKey}.desc`]?.value || c.description;
  return { title, description, tagline: c.tagline ?? description };
}
