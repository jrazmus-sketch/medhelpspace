// Headings whose LEVEL changed between the stored HTML and the edited HTML.
//
// Karina 2026-11-13: five saves in the admin page editor each turned the FIRST heading of the
// text into an <h4> (Revalida Up "CaiuNaProva – …" H2 → H4; AudioCards "Card 1" H3 → H4) while
// she only changed one word further down. A heading command run while the cursor still sits at
// the start of the text does exactly that, silently. The page editor now names any such change
// and asks before saving (edit-client.tsx). Pure, so it is unit-tested.

export type HeadingLevelChange = { text: string; from: number; to: number };

const HEADING_RE = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function levelsByText(html: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const m of (html ?? "").matchAll(HEADING_RE)) {
    const text = plain(m[2]);
    if (!text) continue;
    const list = out.get(text) ?? [];
    list.push(Number(m[1]));
    out.set(text, list);
  }
  return out;
}

/**
 * Same heading text, different level. A heading that was only added, removed or reworded is
 * not reported — those are visible edits; a level change is the one that hides in plain sight.
 */
export function headingLevelChanges(before: string, after: string): HeadingLevelChange[] {
  const b = levelsByText(before);
  const a = levelsByText(after);
  const changes: HeadingLevelChange[] = [];
  for (const [text, beforeLevels] of b) {
    const afterLevels = [...(a.get(text) ?? [])];
    if (afterLevels.length === 0) continue;
    const leftBefore: number[] = [];
    for (const lv of beforeLevels) {
      const i = afterLevels.indexOf(lv);
      if (i >= 0) afterLevels.splice(i, 1);
      else leftBefore.push(lv);
    }
    for (let i = 0; i < Math.min(leftBefore.length, afterLevels.length); i++) {
      changes.push({ text, from: leftBefore[i], to: afterLevels[i] });
    }
  }
  return changes;
}
