// Custom TipTap extensions for the email-body visual editor.
//
//  • EmailVariable — an atomic inline node that renders a `{{tag}}` template
//    variable as a non-editable pill. You can insert or delete it whole, but you
//    can never split or mangle it — the single thing that made the raw-textarea
//    fragile for non-technical editors. Serializes to `<span data-type="email-var"
//    data-tag="…">`, which lib/email-template-editing#serializeEditorHtml turns
//    back into `{{tag}}` text.
//
//  • StylePassthrough — preserves the `style` attribute on block nodes + the link
//    mark through the round-trip. Hand-authored template paragraphs carry tuned
//    inline margins/colors; without this StarterKit would strip them on load and
//    the first save would flatten the email's spacing.

import { Node, Extension, mergeAttributes } from "@tiptap/core";
import { VAR_MARKER_TYPE } from "@/lib/email-template-editing";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emailVariable: {
      /** Insert a `{{tag}}` variable pill at the current selection. */
      insertEmailVariable: (tag: string) => ReturnType;
    };
  }
}

export const EmailVariable = Node.create({
  name: "emailVariable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      tag: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-tag") ?? "",
        renderHTML: (attrs) => (attrs.tag ? { "data-tag": attrs.tag } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[data-type="${VAR_MARKER_TYPE}"]` }];
  },

  // Empty element — the {{tag}} text is added by the node view / by the
  // serializer. Keeps getHTML() output as a clean, regex-friendly marker span.
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": VAR_MARKER_TYPE })];
  },

  // Plain-DOM node view: the visible pill inside the editor.
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.setAttribute("data-type", VAR_MARKER_TYPE);
      dom.setAttribute("data-tag", node.attrs.tag as string);
      dom.className = "email-var-pill";
      dom.textContent = `{{${node.attrs.tag}}}`;
      dom.contentEditable = "false";
      return { dom };
    };
  },

  addCommands() {
    return {
      insertEmailVariable:
        (tag: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { tag } }),
    };
  },
});

// Types whose `style` attribute must survive editing. Node names as registered by
// StarterKit; "link" is the mark name.
const STYLE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "link",
];

export const StylePassthrough = Extension.create({
  name: "stylePassthrough",
  addGlobalAttributes() {
    return [
      {
        types: STYLE_TYPES,
        attributes: {
          style: {
            default: null,
            parseHTML: (el) => el.getAttribute("style"),
            renderHTML: (attrs) => (attrs.style ? { style: attrs.style } : {}),
          },
        },
      },
    ];
  },
});
