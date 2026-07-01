"use client";

import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Bold, Italic, List, Link2, Link2Off } from "lucide-react";
import { EmailVariable, StylePassthrough } from "@/lib/tiptap/email-variable";
import {
  hydrateTemplateHtml,
  serializeEditorHtml,
} from "@/lib/email-template-editing";

type Props = {
  /** Template body_html with `{{tag}}` text — hydrated into pills on mount. */
  value: string;
  /** Fires on every edit with the serialized body_html (pills → `{{tag}}`). */
  onChange: (html: string) => void;
  /**
   * Called once the editor is ready with an `insert(tag)` function so the
   * parent's shared variable-chip row can drop pills at the cursor.
   */
  onInsertReady?: (insert: (tag: string) => void) => void;
};

export function EmailBodyEditor({ value, onChange, onInsertReady }: Props) {
  const { t } = useTranslation();

  const editor = useEditor({
    immediatelyRender: false, // Next SSR: build the editor on the client only.
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        blockquote: false,
        strike: false,
        // Off so an existing link's `text-decoration:underline` inline style isn't
        // promoted into a redundant <u> wrapper on load. StylePassthrough keeps the
        // underline via the preserved style attribute instead.
        underline: false,
        link: {
          openOnClick: false,
          autolink: false,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
          // Allow `{{tag}}` and relative hrefs to survive parse + setLink.
          isAllowedUri: () => true,
          shouldAutoLink: () => false,
        },
      }),
      StylePassthrough,
      EmailVariable,
    ],
    content: hydrateTemplateHtml(value),
    editorProps: {
      attributes: {
        class: "email-editor-surface",
        "aria-label": t("emailTemplates.editor.ariaLabel"),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(serializeEditorHtml(editor.getHTML()));
    },
  });

  // Hand the parent an insert function so its variable chips write into us.
  useEffect(() => {
    if (!editor || !onInsertReady) return;
    onInsertReady((tag: string) =>
      editor.chain().focus().insertEmailVariable(tag).run(),
    );
  }, [editor, onInsertReady]);

  if (!editor) {
    return (
      <div className="min-h-[220px] rounded-lg border border-border bg-surface-1" />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="email-prose px-3 py-3" />
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const isLink = editor.isActive("link");

  const openLink = useCallback(() => {
    setLinkUrl((editor.getAttributes("link").href as string) ?? "");
    setLinkOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    const url = linkUrl.trim();
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkOpen(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  }, [editor]);

  return (
    <div className="border-b border-border">
      <div className="flex flex-wrap items-center gap-1 p-1.5">
        <ToolbarButton
          label={t("emailTemplates.editor.bold")}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("emailTemplates.editor.italic")}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("emailTemplates.editor.bulletList")}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolbarButton
          label={t("emailTemplates.editor.link")}
          active={isLink || linkOpen}
          onClick={openLink}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        {isLink && (
          <ToolbarButton
            label={t("emailTemplates.editor.unlink")}
            active={false}
            onClick={removeLink}
          >
            <Link2Off className="h-4 w-4" />
          </ToolbarButton>
        )}
      </div>

      {linkOpen && (
        <div className="flex flex-col gap-2 border-t border-border p-2 sm:flex-row sm:items-center">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setLinkOpen(false);
              }
            }}
            placeholder={t("emailTemplates.editor.linkPlaceholder")}
            className="w-full rounded-md border border-border bg-surface-0 px-2 py-1.5 text-sm outline-none focus:border-brand/50"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={applyLink}
              className="min-h-[36px] rounded-md bg-brand px-3 py-1 text-sm font-medium text-brand-fg hover:opacity-90"
            >
              {t("emailTemplates.editor.linkApply")}
            </button>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="min-h-[36px] rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Keep the editor selection while clicking the button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        // 44px tap target on mobile (WCAG 2.5.5); compact on desktop.
        "flex h-11 min-w-[44px] items-center justify-center rounded-md px-2 transition-colors sm:h-9 sm:min-w-[36px]",
        active
          ? "bg-brand/15 text-brand"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
