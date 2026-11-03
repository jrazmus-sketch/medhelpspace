import { Extension, Mark, Node } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { safe } from "@/lib/sanitize";
import { RAW_STYLE_ATTR } from "@/lib/rich-text-fidelity";
import { TextColor } from "./text-color-mark";

// The vocabulary the content already uses, taught to the editor so a one-word edit can't
// rewrite it (Karina 2026-11-02 — Questão 96 of fibromialgia lost its h4 titles and its
// ul.pega / ul.certo / ul.resumo lists). What is still unknown is caught by the fidelity
// check in rich-text-editor.tsx (lib/rich-text-fidelity.ts), never silently dropped.

/** `class` survives on paragraphs, headings and lists: p.quiz-source, ul.pega/certo/resumo, p.ac-q… */
export const PreservedClass = Extension.create({
  name: "preservedClass",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "bulletList", "orderedList"],
        attributes: {
          class: {
            default: null,
            // Enter at the end of "ENARE | Questão 27" must not make the next line a source line too.
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute("class"),
            renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
          },
        },
      },
    ];
  },
});

/**
 * ProseMirror writes `style` through `dom.style.cssText`, so the browser hands it back
 * re-spelled (`color: #b046e9` → `color: rgb(176, 70, 233)`) — and the member renderers'
 * INLINE_PURPLE_RE only knows the hex. The raw string rides along as data-rte-style;
 * normalizeEditorHtml (lib/rich-text-fidelity.ts) puts it back as the stored `style`.
 */
export function rawStyle(style: string | null | undefined): Record<string, string> {
  return style ? { style, [RAW_STYLE_ATTR]: style } : {};
}

/** Internal links keep their page id (bare-slug lookup) and the legacy inline colour. */
export const PreservedLinkAttrs = Extension.create({
  name: "preservedLinkAttrs",
  addGlobalAttributes() {
    return [
      {
        types: ["link"],
        attributes: {
          "data-page-id": {
            default: null,
            parseHTML: (el) => el.getAttribute("data-page-id"),
            renderHTML: (attrs) => (attrs["data-page-id"] ? { "data-page-id": attrs["data-page-id"] } : {}),
          },
          style: {
            default: null,
            parseHTML: (el) => el.getAttribute("style"),
            renderHTML: (attrs) => rawStyle(attrs.style as string | null),
          },
        },
      },
    ];
  },
});

/** `<sup>` (units, references in the question stems). */
export const Superscript = Mark.create({
  name: "superscript",
  parseHTML: () => [{ tag: "sup" }],
  renderHTML: ({ HTMLAttributes }) => ["sup", HTMLAttributes, 0],
});

/**
 * Any other <span> keeps its style/class as written — the legacy WordPress lessons carry
 * ~1,700 lilac `color: #7e04bf` / `#b046e9` spans (and Notion's `font-weight: 400`). Ranked
 * below TextColor, whose prose-color-* spans stay the toolbar's own colours. `excludes: ""`
 * lets nested spans coexist instead of the inner one replacing the outer.
 */
export const PreservedSpan = Mark.create({
  name: "preservedSpan",
  excludes: "",
  addAttributes() {
    return {
      style: {
        default: null,
        parseHTML: (el) => el.getAttribute("style"),
        renderHTML: (attrs) => rawStyle(attrs.style as string | null),
      },
      class: { default: null, parseHTML: (el) => el.getAttribute("class") },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span",
        priority: 40,
        getAttrs: (el) => {
          const e = el as HTMLElement;
          if (Array.from(e.classList).some((c) => c.startsWith("prose-color-"))) return false;
          return e.getAttribute("style") || e.getAttribute("class") ? {} : false;
        },
      },
    ];
  },
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
});

// An inert <template> (scripts don't run, images don't load) — used for what getHTML()
// serialises, which must keep the stored markup as it is.
function elementFromHtml(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return (t.content.firstElementChild as HTMLElement | null) ?? document.createElement("div");
}

// ProseMirror's serializer takes a [tag, attrs, ...children] spec, not a DOM node.
type Spec = string | [string, Record<string, string>, ...Spec[]];
function specFromElement(el: Element): Spec {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) Object.assign(attrs, a.name === "style" ? rawStyle(a.value) : { [a.name]: a.value });
  const children: Spec[] = [];
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 1) children.push(specFromElement(c as Element));
    else if (c.nodeType === 3 && c.textContent) children.push(c.textContent);
  }
  return [el.tagName.toLowerCase(), attrs, ...children];
}

/**
 * Typed tables (div.quiz-table-wrap > table.quiz-table) and figures (figure.quiz-figure /
 * figure.resumo-figure) are kept byte-for-byte as one protected block: shown as the member
 * sees them, movable and deletable as a whole, edited inside only through "Código HTML".
 */
export const PreservedBlock = Node.create<{ label: string }>({
  name: "preservedBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { label: "" };
  },

  addAttributes() {
    return {
      html: {
        default: "",
        parseHTML: (el) => el.outerHTML,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      { tag: "div.quiz-table-wrap", priority: 100 },
      { tag: "figure", priority: 100 },
      { tag: "table", priority: 100 },
    ];
  },

  renderHTML({ node }) {
    return specFromElement(elementFromHtml(node.attrs.html as string)) as [string, Record<string, string>];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.contentEditable = "false";
      dom.className = "rte-preserved-block";
      if (this.options.label) dom.dataset.label = this.options.label;
      // The preview IS attached to the page: sanitised exactly like the member render.
      dom.appendChild(elementFromHtml(safe(node.attrs.html as string)));
      return { dom };
    };
  },
});

/** The admin editor's whole schema — one list, so the fidelity check tests what the editor runs. */
export function richTextExtensions(opts: { placeholder: string; preservedBlockLabel: string }) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      codeBlock: false,
      horizontalRule: { HTMLAttributes: { class: "my-4 border-border" } },
      // Links keep exactly what they were written with (bare-slug hrefs included) — the
      // default would stamp target="_blank" rel="noopener…" onto every one.
      link: { openOnClick: false, HTMLAttributes: { target: null, rel: null, class: null } },
    }),
    Placeholder.configure({ placeholder: opts.placeholder }),
    TextColor,
    PreservedSpan,
    PreservedLinkAttrs,
    PreservedClass,
    Superscript,
    PreservedBlock.configure({ label: opts.preservedBlockLabel }),
  ];
}
