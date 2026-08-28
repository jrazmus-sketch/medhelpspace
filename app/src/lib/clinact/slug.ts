/**
 * Case slug from title. "You never write an address" — the title is the
 * identity for re-import, so the same title must always give the same slug.
 */
export function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Scene keys: short, no accents, no spaces (guide §7). */
export function normalizeSceneKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "");
}
