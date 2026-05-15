"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Heading2, Heading3,
  List, ListOrdered, Minus, Undo, Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
