"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Heading2, Heading3,
  List, ListOrdered, Minus, Undo, Redo, Baseline,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TextColor, APPROVED_COLORS } from "./text-color-mark";

type Props = {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
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
        "rounded p-1.5 transition-colors",
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
        title="Cor do texto"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "rounded p-1.5 transition-colors",
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
            title="Padrão (remover cor)"
            className="flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Padrão
          </button>
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({ content, onChange, placeholder, minHeight = "160px" }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        horizontalRule: { HTMLAttributes: { class: "my-4 border-border" } },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Escreva o conteúdo aqui…",
      }),
      TextColor,
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose-content focus:outline-none min-h-[var(--editor-min-h)] px-4 py-3",
      },
    },
    immediatelyRender: false,
  });

  if (!editor) return null;

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
          title="Negrito (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Itálico (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Título H2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Título H3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Lista com marcadores"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Lista numerada"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Linha divisória"
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ColorMenu editor={editor} />

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo className="h-3.5 w-3.5" />
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Refazer (Ctrl+Y)"
          >
            <Redo className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
