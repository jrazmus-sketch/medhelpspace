import { Mark, mergeAttributes } from "@tiptap/core";

// Approved text-color palette for the page editor. Each entry maps to a
// theme-aware CSS class (`.prose-color-<key>`) defined in globals.css — NOT an
// inline style — so colors shift correctly between light/dark and survive the
// `.dark .prose-content [style*="color"]` override. `swatch` is the light-mode
// hex used only to paint the toolbar dot. Keep keys in sync with globals.css.
export type ApprovedColor = { key: string; label: string; swatch: string };

export const APPROVED_COLORS: ApprovedColor[] = [
  { key: "brand", label: "Roxo", swatch: "#7a1d91" },
  { key: "green", label: "Verde", swatch: "#15803d" },
  { key: "red", label: "Vermelho", swatch: "#dc2626" },
  { key: "amber", label: "Âmbar", swatch: "#b45309" },
];

const CLASS_PREFIX = "prose-color-";
const VALID_KEYS = new Set(APPROVED_COLORS.map((c) => c.key));

function colorKeyFromEl(el: HTMLElement): string | null {
  const cls = Array.from(el.classList).find((c) => c.startsWith(CLASS_PREFIX));
  if (!cls) return null;
  const key = cls.slice(CLASS_PREFIX.length);
  return VALID_KEYS.has(key) ? key : null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textColor: {
      /** Apply an approved color by key; no-op for unknown keys. */
      setTextColor: (key: string) => ReturnType;
      /** Remove any color from the selection (back to default foreground). */
      unsetTextColor: () => ReturnType;
    };
  }
}

// A mark whose only job is to carry one approved color as a class. Default
// `excludes` (same-type) means setting a new color replaces the old one, so a
// selection never accumulates two color marks.
export const TextColor = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => colorKeyFromEl(el as HTMLElement),
        renderHTML: (attrs) =>
          attrs.color ? { class: `${CLASS_PREFIX}${attrs.color}` } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span",
        getAttrs: (el) => (colorKeyFromEl(el as HTMLElement) ? {} : false),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextColor:
        (key) =>
        ({ commands }) =>
          VALID_KEYS.has(key)
            ? commands.setMark("textColor", { color: key })
            : false,
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark("textColor"),
    };
  },
});
