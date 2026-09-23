// MemoreCards v2 — the pure rules: shapes, ordering and the continuous sequence.
// Kept apart from lib/memorecards.ts (server-only: it reads the DB) so the viewer can
// import them in the browser and the tests can run them without Next's runtime —
// the same split as lib/clinact/library-filters.ts.

export type MemorecardCard = {
  url: string;
  width: number;
  height: number;
};

export type MemorecardTheme = {
  /** Revalida Up topic page id — also the Revisão re-read key for the theme. */
  pageId: number;
  /** Topic slug without the "-revalida-up" suffix; used in ?tema= links. */
  slug: string;
  title: string;
  cards: MemorecardCard[];
};

/** Where the student is: an index into the AVAILABLE themes, and a card inside it. */
export type SequencePosition = { theme: number; card: number };

/** "Cirrose Revalida Up" → "Cirrose": the page title carries the section name. */
export function themeTitle(pageTitle: string): string {
  return pageTitle.replace(/\s*revalida\s*up\s*$/i, "").trim() || pageTitle;
}

/** "cirrose-revalida-up" → "cirrose". */
export function themeSlug(pageSlug: string): string {
  return pageSlug.replace(/-revalida-up$/, "");
}

/** Alphabetical as a Brazilian reader expects it ("Câncer" beside "Cancer", not after "Z"). */
export function sortThemes<T extends { title: string }>(themes: T[]): T[] {
  return [...themes].sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));
}

/**
 * The study sequence: only themes that already have cards. A theme without cards
 * stays in the structure (the sidebar lists it as "em breve") but never interrupts
 * the flow — Karina's item 9.
 */
export function availableThemes(themes: MemorecardTheme[]): MemorecardTheme[] {
  return themes.filter((t) => t.cards.length > 0);
}

/**
 * One step forward. The last card of a theme leads to the FIRST card of the next
 * available theme of the same specialty (the point of the whole feature: no trip back
 * to an index). The last card of the last theme returns "end".
 */
export function nextPosition(seq: MemorecardTheme[], at: SequencePosition): SequencePosition | "end" {
  const theme = seq[at.theme];
  if (!theme) return "end";
  if (at.card < theme.cards.length - 1) return { theme: at.theme, card: at.card + 1 };
  if (at.theme < seq.length - 1) return { theme: at.theme + 1, card: 0 };
  return "end";
}

/** One step back — symmetric: the first card of a theme goes to the LAST card of the previous one. */
export function prevPosition(seq: MemorecardTheme[], at: SequencePosition): SequencePosition | null {
  if (at.card > 0) return { theme: at.theme, card: at.card - 1 };
  if (at.theme > 0) {
    const prev = seq[at.theme - 1];
    return { theme: at.theme - 1, card: prev.cards.length - 1 };
  }
  return null;
}

/** Start position for a ?tema= link: that theme's first card, or the very start when it has no cards. */
export function startPosition(seq: MemorecardTheme[], slug: string | null | undefined): SequencePosition {
  const i = slug ? seq.findIndex((t) => t.slug === slug) : -1;
  return { theme: i >= 0 ? i : 0, card: 0 };
}

/** Is this the last card of its theme? Reaching it counts the theme as studied (Revisão re-read). */
export function isThemeFinished(seq: MemorecardTheme[], at: SequencePosition): boolean {
  const theme = seq[at.theme];
  return !!theme && at.card === theme.cards.length - 1;
}
