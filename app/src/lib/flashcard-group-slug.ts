// Stable, shareable per-group identifier for the flashcard deck's ?grupo= deep link.
// Derived from the group label (accent-stripped) with a position fallback. Shared by
// the deck renderer (which builds the links) and the study plan (which deep-links a
// topic to its own group — R1), so both always produce the same slug.
export function flashcardGroupSlug(label: string | null, position = 0): string {
  if (!label) return `grupo-${position}`;
  const base = label
    .normalize("NFD")
    // Drop combining diacritical marks (U+0300–U+036F) so "Congênita" → "congenita".
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code < 0x0300 || code > 0x036f;
    })
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `grupo-${position}`;
}
