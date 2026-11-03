"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import {
  Bold, Italic, Heading2, Heading3, Heading4,
  List, ListOrdered, Minus, Undo, Redo, Baseline, CodeXml, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { keepsFormatting, normalizeEditorHtml } from "@/lib/rich-text-fidelity";
import { APPROVED_COLORS } from "./text-color-mark";
import { richTextExtensions } from "./rich-text-extensions";

/** A list look the author can pick for the bullet list under the cursor (ul.pega, ul.certo…). */
export type ListStyle = { className: string | null; label: string; marker: string };

type Props = {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** Classes the member render wraps this text in (e.g. "quiz-explanation"), so the editor shows the same look. */
  contentClassName?: string;
  listStyles?: ListStyle[];
};

type ToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
};

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={cn(
        // 44px squares on a phone (tap targets), the compact 26px from sm up.
        "inline-flex h-11 w-11 items-center justify-center rounded transition-colors sm:h-auto sm:w-auto sm:p-1.5",
        active
          ? "bg-brand/15 text-brand"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "opacity-30 pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

// Text-color picker: a trigger + a small swatch popover. Colors are restricted
// to the approved palette (APPROVED_COLORS) and applied as theme-aware classes
// via the TextColor mark — no free color input, no inline styles.
function ColorMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const active = editor.isActive("textColor");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        title={t("richText.textColor")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded transition-colors sm:h-auto sm:w-auto sm:p-1.5",
          active
            ? "bg-brand/15 text-brand"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Baseline className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 flex max-w-[14rem] flex-wrap items-center gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          {APPROVED_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="menuitem"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().setTextColor(c.key).run();
                setOpen(false);
              }}
              title={c.label}
              aria-label={c.label}
              className={cn(
                "h-7 w-7 rounded-full border transition-transform hover:scale-110",
                editor.isActive("textColor", { color: c.key })
                  ? "border-foreground ring-1 ring-foreground"
                  : "border-border",
              )}
              style={{ backgroundColor: c.swatch }}
            />
          ))}
          <div className="mx-0.5 h-6 w-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().unsetTextColor().run();
              setOpen(false);
            }}
            title={t("richText.textColorReset")}
            className="flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("richText.textColorDefault")}
          </button>
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({
  content, onChange, placeholder, minHeight = "160px", contentClassName, listStyles,
}: Props) {
  const { t } = useTranslation();
  // "visual" = TipTap; "html" = the stored markup in a textarea. A text the visual editor
  // cannot carry without losing something opens as "html" (see onCreate) — never rewritten.
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [lossy, setLossy] = useState(false);
  const [html, setHtml] = useState(content);

  const editor = useEditor({
    extensions: richTextExtensions({
      placeholder: placeholder ?? t("richText.placeholder"),
      preservedBlockLabel: t("richText.preservedBlock"),
    }),
    content,
    onCreate: ({ editor }) => {
      if (!keepsFormatting(content, normalizeEditorHtml(editor.getHTML()))) {
        setLossy(true);
        setMode("html");
      }
    },
    onUpdate: ({ editor }) => {
      const next = normalizeEditorHtml(editor.getHTML());
      setHtml(next);
      onChange(next);
    },
    editorProps: {
      attributes: {
        class: cn("prose-content focus:outline-none min-h-[var(--editor-min-h)] px-4 py-3", contentClassName),
      },
    },
    immediatelyRender: false,
    // v3 only re-renders on content changes by default; the toolbar (active marks, the list
    // looks under the cursor) has to follow the selection too.
    shouldRerenderOnTransaction: true,
  });

  if (!editor) return null;

  // Back from "Código HTML": only if the visual editor can carry what was typed there.
  function showVisual() {
    if (!editor) return;
    editor.commands.setContent(html, { emitUpdate: false });
    if (!keepsFormatting(html, normalizeEditorHtml(editor.getHTML()))) {
      setLossy(true);
      return;
    }
    setLossy(false);
    setMode("visual");
  }

  const activeList = listStyles && editor.isActive("bulletList")
    ? ((editor.getAttributes("bulletList").class as string | null | undefined) ?? null)
    : undefined;

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-background focus-within:border-brand/60 focus-within:ring-1 focus-within:ring-brand/30"
      style={{ "--editor-min-h": minHeight } as React.CSSProperties}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title={t("richText.bold")}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title={t("richText.italic")}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title={t("richText.h2")}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title={t("richText.h3")}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          active={editor.isActive("heading", { level: 4 })}
          title={t("richText.h4")}
        >
          <Heading4 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title={t("richText.bulletList")}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title={t("richText.orderedList")}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title={t("richText.divider")}
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ColorMenu editor={editor} />

        {activeList !== undefined && (
          <>
            <div className="mx-1 h-4 w-px bg-border" />
            {listStyles!.map((ls) => (
              <button
                key={ls.className ?? "plain"}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().updateAttributes("bulletList", { class: ls.className }).run();
                }}
                title={ls.label}
                aria-pressed={activeList === ls.className}
                className={cn(
                  "flex h-11 min-w-11 items-center justify-center gap-1 rounded px-1.5 text-xs transition-colors sm:h-7 sm:min-w-0",
                  activeList === ls.className
                    ? "bg-brand/15 text-brand"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span aria-hidden>{ls.marker}</span>
                <span className="hidden sm:inline">{ls.label}</span>
              </button>
            ))}
          </>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title={t("richText.undo")}
          >
            <Undo className="h-3.5 w-3.5" />
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title={t("richText.redo")}
          >
            <Redo className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-1 h-4 w-px bg-border" />

          <ToolbarButton
            onClick={() => (mode === "html" ? showVisual() : setMode("html"))}
            active={mode === "html"}
            title={mode === "html" ? t("richText.visualMode") : t("richText.htmlMode")}
          >
            <CodeXml className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      </div>

      {lossy && mode === "html" && (
        <p className="flex items-start gap-2 border-b border-border bg-surface-2 px-4 py-2 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          {t("richText.lossyWarning")}
        </p>
      )}

      <div className={mode === "html" ? "hidden" : undefined}>
        <EditorContent editor={editor} />
      </div>
      {mode === "html" && (
        <textarea
          value={html}
          onChange={(e) => {
            setHtml(e.target.value);
            onChange(e.target.value);
          }}
          aria-label={t("richText.htmlMode")}
          spellCheck={false}
          rows={Math.min(30, Math.max(8, html.split("\n").length + 2))}
          className="block min-h-[var(--editor-min-h)] w-full resize-y bg-background px-4 py-3 font-mono text-xs leading-relaxed outline-none"
        />
      )}
    </div>
  );
}
