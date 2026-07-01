// Pure helpers bridging the DB's `{{tag}}`-in-HTML template bodies and the
// TipTap visual editor. NO React, NO server-only — safe to import in a
// "use client" component.
//
// Two seams:
//   • hydrate  — template body_html (with {{tag}} text) → editor-ready HTML,
//                where each text-position {{tag}} becomes an atomic <span>
//                marker the EmailVariable node parses into a pill.
//   • serialize — editor HTML → template body_html: pills back to {{tag}} text,
//                plus email-safe inline styles injected into any bare <p>/<a>
//                the visual editor produced (StarterKit emits semantic markup;
//                email clients need inline styling).
//
// {{tag}} tokens that live INSIDE an attribute (e.g. <a href="{{unsubscribeUrl}}">)
// are deliberately left untouched by hydrate — only text nodes become pills, so
// a link's href token can't be mangled and round-trips as literal text.

// ── Prose vs structural classification ───────────────────────────────────────
//
// Structural templates are nested <table>-layout emails (info boxes, checklists,
// or a single generated-HTML var). A generic WYSIWYG would flatten those on load,
// so they default to the raw-HTML textarea. Everything else is a stack of <p>
// prose that round-trips cleanly → defaults to the visual editor. Unknown/new
// kinds default to raw (safe) until explicitly classified as prose here.
const PROSE_TEMPLATE_KINDS = new Set<string>([
  "60d-unlock",
  "expiry-warning-7d",
  "expiry-notice",
  "daily-plan",
  "support-ticket-reply",
  "lead-code",
  "lead-d0",
  "lead-d1",
  "lead-d2",
  "lead-d4",
  "lead-d7",
  "lead-final",
]);

// Default editor mode for a template kind. `true` → visual editor by default.
export function defaultsToVisualEditor(kind: string): boolean {
  return PROSE_TEMPLATE_KINDS.has(kind);
}

// Marker attributes the EmailVariable node parses. Kept here so hydrate/serialize
// and the node stay in lockstep.
export const VAR_MARKER_TYPE = "email-var";

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/;
const TOKEN_RE_G = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// ── Hydrate: template body_html → editor HTML (client-only; uses DOMParser) ───
//
// Walks text nodes only, replacing each {{tag}} with a marker span. Attribute
// values (hrefs) are never visited, so `href="{{unsubscribeUrl}}"` stays intact.
export function hydrateTemplateHtml(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html;
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    textNodes.push(n as Text);
  }
  for (const tn of textNodes) {
    const text = tn.nodeValue ?? "";
    if (!TOKEN_RE.test(text)) continue;
    const frag = doc.createDocumentFragment();
    // Split KEEPING the delimiters so we can rebuild text + markers in order.
    for (const part of text.split(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/)) {
      if (!part) continue;
      const m = part.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
      if (m) {
        const span = doc.createElement("span");
        span.setAttribute("data-type", VAR_MARKER_TYPE);
        span.setAttribute("data-tag", m[1]);
        frag.appendChild(span);
      } else {
        frag.appendChild(doc.createTextNode(part));
      }
    }
    tn.replaceWith(frag);
  }
  return doc.body.innerHTML;
}

// ── Serialize: editor HTML → template body_html (works client + server) ───────

// Convert every variable-marker span back to a {{tag}} text token. The markup is
// our own (produced by the node's renderHTML), so a targeted regex is safe.
function pillsToTokens(html: string): string {
  return html.replace(
    /<span\b[^>]*\bdata-type=["']email-var["'][^>]*>\s*<\/span>/g,
    (m) => {
      const tm = m.match(/data-tag=["']([a-zA-Z0-9_]+)["']/);
      return tm ? `{{${tm[1]}}}` : "";
    },
  );
}

// Inject email-safe inline styling into bare block/link elements. StarterKit
// emits semantic `<p>` / `<a>` with no inline style; existing hand-authored
// paragraphs already carry their own `style=` (StarterKit preserves it via the
// style-passthrough extension) and are skipped by the negative lookahead.
function injectEmailStyles(html: string): string {
  return html
    .replace(/<p(?![^>]*\sstyle=)/g, '<p style="margin:0 0 16px;line-height:1.65"')
    .replace(
      /<a(?![^>]*\sstyle=)([^>]*\shref=)/g,
      '<a style="color:#7a1d91;text-decoration:underline"$1',
    );
}

export function serializeEditorHtml(html: string): string {
  return injectEmailStyles(pillsToTokens(html)).trim();
}

// Tags referenced anywhere in a body string — used to seed the variable pills
// and (in the editor) to warn on unknown tokens live. Mirrors extractTags in
// email-render but scoped to a single string.
export function tokensIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE_G)) out.add(m[1]);
  return [...out];
}
