/**
 * Does the visual editor keep a piece of HTML intact? (Karina 2026-11-02, "Correção da
 * formatação dos comentários após edição das questões".)
 *
 * The admin RichTextEditor (TipTap) rebuilds every text from its own schema, so anything
 * the schema doesn't know is dropped on the first keystroke — that is how Questão 96 of
 * fibromialgia lost its <h4> titles and its ul.pega / ul.certo / ul.resumo lists after a
 * one-word change. The editor now knows the question vocabulary, and for whatever it still
 * doesn't know it compares the text before and after a round trip with these functions and
 * opens the field as HTML code instead of silently rewriting it.
 *
 * Pure string functions (no DOM) so they run in node tests and in the browser alike.
 */

const BLOCK_END = "(?=\\s*(?:</li>|<ul[\\s>]|<ol[\\s>]))";
// A paragraph that carries only ChatGPT's paste markers (see IGNORED_ATTRS) is still a bare one.
const PASTE_ATTRS = '(?:\\s+data-(?:start|end|is-only-node|is-last-node)="[^"]*")*';

/** Where the editor carries a `style` exactly as written (see rawStyle in rich-text-extensions.ts). */
export const RAW_STYLE_ATTR = "data-rte-style";

const RE_RAW_STYLE_TAG = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)(\\s[^>]*?)?\\s${RAW_STYLE_ATTR}="([^"]*)"([^>]*)>`, "g");
const stripStyleAttr = (attrs = "") => attrs.replace(/\sstyle="[^"]*"/g, "");

/**
 * What the editor hands back, in the shape the content was authored in:
 *  - `style` restored from data-rte-style, byte for byte (the browser re-spells colours)
 *  - `<li><p>texto</p></li>` → `<li>texto</li>` (TipTap wraps every list item in a
 *    paragraph; the ❌ / ✔ / 🟣 markers sit on the li, and the stored content never has it)
 *  - trailing empty `<p></p>` dropped (TipTap's "end of document" paragraph)
 */
export function normalizeEditorHtml(html: string): string {
  return html
    .replace(RE_RAW_STYLE_TAG, (_m, tag: string, pre: string | undefined, raw: string, post: string) =>
      `<${tag}${stripStyleAttr(pre)} style="${raw}"${stripStyleAttr(post)}>`)
    .replace(new RegExp(`<li([^>]*)>\\s*<p${PASTE_ATTRS}>((?:(?!</?p[\\s>]).)*?)</p>${BLOCK_END}`, "gs"), "<li$1>$2")
    .replace(/(?:\s*<p>\s*<\/p>)+\s*$/g, "")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Same element, two spellings — the browser renders them identically.
const CANONICAL_TAG: Record<string, string> = { b: "strong", i: "em" };
// The HTML parser inserts <tbody> into every table that lacks one; never a real difference.
const IGNORED_TAGS = new Set(["tbody"]);
// Position markers ChatGPT leaves on pasted text (<li data-start="75" data-end="115">): they
// style nothing and nothing reads them. data-page-id (internal links) is NOT in this list.
const IGNORED_ATTRS = new Set(["data-start", "data-end", "data-is-only-node", "data-is-last-node"]);

// Elements the editor stores as MARKS on the text. TipTap re-nests them by its own rank
// (<strong><span>a</span></strong> comes back as <span><strong>a</strong></span>), splits
// one around a link and drops an empty one — none of which changes what the reader sees,
// so marks are compared per character, and only the other elements are counted.
const INLINE_TAGS = new Set(["strong", "em", "span", "a", "sup", "sub", "u", "s", "code"]);

type Token = { tag: string; close: boolean; desc: string } | { text: string };

// Only `<` + letter (or `</` + letter) opens a tag: "Área valvar <1 cm²" is text, as in the browser.
const RE_TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;

function tokens(html: string): Token[] {
  const out: Token[] = [];
  const src = normalizeEditorHtml(html).replace(/<!--[\s\S]*?-->/g, "");
  let last = 0;
  for (const m of src.matchAll(RE_TAG)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    last = m.index + m[0].length;
    const tag = CANONICAL_TAG[m[2].toLowerCase()] ?? m[2].toLowerCase();
    if (IGNORED_TAGS.has(tag)) continue;
    if (m[1]) { out.push({ tag, close: true, desc: `/${tag}` }); continue; }
    // A divider carries no meaning in its attributes (the editor stamps its own class on it).
    if (tag === "hr") { out.push({ tag, close: false, desc: "hr" }); continue; }
    const attrs = [...m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)]
      .filter(([, name]) => !IGNORED_ATTRS.has(name.toLowerCase()))
      .map(([, name, raw]) => {
        const value = raw === undefined ? "" : decodeEntities(raw.replace(/^["']|["']$/g, "")).trim().replace(/\s+/g, " ");
        return `${name.toLowerCase()}=${value}`;
      })
      .sort();
    out.push({ tag, close: false, desc: attrs.length ? `${tag}[${attrs.join(" ")}]` : tag });
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

/** The element skeleton: every open/close tag with its attributes, text left out. */
export function htmlStructure(html: string): string[] {
  return tokens(html).flatMap((t) => ("desc" in t ? [t.desc] : []));
}

/** The words, whitespace collapsed. A block boundary counts as a space; a mark does not. */
export function htmlText(html: string): string {
  return tokens(html)
    .map((t) => ("text" in t ? decodeEntities(t.text) : INLINE_TAGS.has(t.tag) ? "" : " "))
    .join("")
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

/** Every non-space character with the set of marks around it ("strong|span[style=…]"). */
function markedChars(html: string): string[] {
  const open: { tag: string; desc: string }[] = [];
  const out: string[] = [];
  for (const t of tokens(html)) {
    if ("text" in t) {
      const sig = [...new Set(open.map((o) => o.desc))].sort().join("|");
      for (const ch of decodeEntities(t.text)) if (!/[\s\u00a0]/.test(ch)) out.push(`${ch}\u0000${sig}`);
    } else if (INLINE_TAGS.has(t.tag)) {
      if (!t.close) open.push({ tag: t.tag, desc: t.desc });
      else {
        const i = open.map((o) => o.tag).lastIndexOf(t.tag);
        if (i >= 0) open.splice(i, 1);
      }
    }
  }
  return out;
}

function countBlocks(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens(html)) {
    if ("text" in t || t.close || INLINE_TAGS.has(t.tag)) continue;
    counts.set(t.desc, (counts.get(t.desc) ?? 0) + 1);
  }
  return counts;
}

/**
 * True when `after` is `before` with nothing lost: the same words, every character with the
 * same marks (bold, italic, spans with their style/class, links with their attributes), and
 * every other element with its classes and attributes still there. The editor may only ADD
 * plain <p> — it wraps bare text ("Your terms…", a flashcard's plain front) in a paragraph,
 * which renders the same.
 */
export function keepsFormatting(before: string, after: string): boolean {
  if (htmlText(before) !== htmlText(after)) return false;
  const ma = markedChars(before);
  const mb = markedChars(after);
  if (ma.length !== mb.length || ma.some((c, i) => c !== mb[i])) return false;
  const a = countBlocks(before);
  const b = countBlocks(after);
  for (const [tag, n] of a) if ((b.get(tag) ?? 0) < n) return false;
  for (const [tag, n] of b) if (tag !== "p" && (a.get(tag) ?? 0) !== n) return false;
  return true;
}
