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
 *
 * A section with no row goes right AFTER the section declared before it in
 * code (wherever the admin has moved that one) — so adding a section in code
 * works without a database write, and lands where it was declared even when
 * the stored positions are 1..n with no gap for it. (Its old position was its
 * code index, which TIED with the stored row already holding that number.)
 */
export function orderSections<T extends { key: string }>(sections: T[], layout: PageLayout): T[] {
  let prev = 0;
  return sections
    .map((s) => {
      const at = layout.position[s.key] ?? prev + 0.001;
      prev = at;
      return { s, at };
    })
    .filter(({ s }) => layout.visible[s.key] !== false)
    .sort((a, b) => a.at - b.at)
    .map(({ s }) => s);
}

/**
 * Validate an admin's submitted section list against the sections declared in
 * code. Returns the rows to store, or null when the list is not exactly the
 * known keys (a missing, unknown or duplicated key means a stale or tampered
 * form — refuse rather than guess). Keys in `alwaysVisible` are forced visible
 * whatever was submitted.
 */
export function normalizeSectionRows(
  knownKeys: readonly string[],
  submitted: readonly { key: string; visible: boolean }[],
  alwaysVisible: readonly string[] = [],
): { key: string; visible: boolean; position: number }[] | null {
  if (submitted.length !== knownKeys.length) return null;
  const seen = new Set<string>();
  for (const s of submitted) {
    if (!knownKeys.includes(s.key) || seen.has(s.key)) return null;
    seen.add(s.key);
  }
  return submitted.map((s, i) => ({
    key: s.key,
    visible: alwaysVisible.includes(s.key) ? true : s.visible === true,
    position: i + 1,
  }));
}
