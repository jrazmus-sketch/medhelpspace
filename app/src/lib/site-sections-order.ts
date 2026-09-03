/**
 * Pure section ordering — no server imports, so the pages and the tests can
 * both use it. The loader lives in lib/queries/site-sections.ts (it reaches
 * the database).
 */

export type PageLayout = {
  published: boolean;
  /** section key → visible. A key missing here means "visible". */
  visible: Record<string, boolean>;
  /** section key → position. Missing keys keep their code order. */
  position: Record<string, number>;
};

/**
 * Order the code-declared sections by the layout, dropping hidden ones.
 * A section with no row keeps its declared order — so adding a section in code
 * works without a database write.
 */
export function orderSections<T extends { key: string }>(sections: T[], layout: PageLayout): T[] {
  return sections
    .filter((s) => layout.visible[s.key] !== false)
    .map((s, i) => ({ s, at: layout.position[s.key] ?? i + 1 }))
    .sort((a, b) => a.at - b.at)
    .map(({ s }) => s);
}
