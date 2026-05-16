import sanitizeHtml from "sanitize-html";

// Permissive config: allows all structural HTML produced by the migration
// parser, stripping only active content (script, event handlers, iframes).
const SAFE_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img", "h1", "h2", "h3", "h4", "h5", "h6",
    "span", "div", "section", "article",
    "figure", "figcaption", "caption",
    "sup", "sub", "mark", "del", "ins",
    "colgroup", "col",
  ]),
  allowedAttributes: {
    "*": ["class", "id", "style", "dir"],
    "a": ["href", "target", "rel", "title"],
    "img": ["src", "alt", "width", "height", "loading"],
    "td": ["colspan", "rowspan", "align"],
    "th": ["colspan", "rowspan", "align", "scope"],
    "ol": ["type", "start"],
  },
  allowedSchemes: ["http", "https", "mailto", "data"],
  disallowedTagsMode: "discard",
};

export function safe(html: string): string {
  return sanitizeHtml(html, SAFE_CONFIG);
}
