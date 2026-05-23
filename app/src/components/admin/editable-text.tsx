"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { useEditMode } from "@/providers/edit-mode-provider";
import { updateScalarField, updateQuizAnswerField } from "@/actions/inline-edit";

// Consumers pass already-sanitized HTML (via lib/sanitize#safe).
// Server actions re-sanitize on save. This wrapper exists so we can keep the
// raw attribute name out of JSX in this file.
function htmlProps(html: string): React.HTMLAttributes<HTMLElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

type ScalarTable =
  | "pages"
  | "lessons"
  | "quiz_questions"
  | "flashcard_items"
  | "nav_items";

type Common = {
  className?: string;
  /** Element tag for the display wrapper. Defaults: plain → span, rich/answer → div. */
  as?: "span" | "div";
};

type PlainProps = Common & {
  variant: "plain";
  table: ScalarTable;
  id: number;
  field: string;
  value: string;
  /** Render a `<textarea>` instead of `<input>` for longer plain text. */
  multiline?: boolean;
};

type RichProps = Common & {
  variant: "rich";
  table: ScalarTable;
  id: number;
  field: string;
  /** Rendered/displayed HTML (consumer must sanitize). */
  html: string;
  /** Optional raw HTML to seed the contentEditable; defaults to `html`. */
  editHtml?: string;
};

type AnswerProps = Common & {
  variant: "answer";
  questionId: number;
  answerIdx: number;
  field: "text" | "feedback";
  html: string;
  editHtml?: string;
};

type Props = PlainProps | RichProps | AnswerProps;

const INHERIT_STYLE: CSSProperties = {
  font: "inherit",
  color: "inherit",
  lineHeight: "inherit",
  letterSpacing: "inherit",
};

export function EditableText(props: Props) {
  const { active } = useEditMode();
  if (!active) return <Display {...props} />;
  return <EditableInner {...props} />;
}

// ── Plain display (edit mode off, or non-admin, or mobile) ───────────────────

function Display(props: Props) {
  const Tag = props.as ?? (props.variant === "plain" ? "span" : "div");
  if (props.variant === "plain") {
    return <Tag className={props.className}>{props.value}</Tag>;
  }
  return <Tag className={props.className} {...htmlProps(props.html)} />;
}

// ── Editable wrapper (edit mode on + admin + desktop) ────────────────────────

function EditableInner(props: Props) {
  const router = useRouter();
  // `original` doubles as edit-mode flag: null = display, string = editing with that seed.
  const [original, setOriginal] = useState<string | null>(null);
  const editing = original !== null;
  const [pending, startTransition] = useTransition();
  const editRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const Tag = props.as ?? (props.variant === "plain" ? "span" : "div");

  function startEdit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOriginal(
      props.variant === "plain"
        ? props.value
        : (props.editHtml ?? props.html),
    );
  }

  function exit() {
    setOriginal(null);
  }

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      if (props.variant === "plain") {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        const el = editRef.current;
        if (!el) return;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  }, [editing, props.variant]);

  async function save() {
    let newValue: string;
    if (props.variant === "plain") {
      newValue = inputRef.current?.value ?? "";
    } else {
      newValue = editRef.current?.innerHTML ?? "";
    }

    if (newValue === original) {
      exit();
      return;
    }

    startTransition(async () => {
      try {
        if (props.variant === "answer") {
          await updateQuizAnswerField(
            props.questionId,
            props.answerIdx,
            props.field,
            newValue,
          );
        } else {
          await updateScalarField(props.table, props.id, props.field, newValue);
        }
        toast.success("Salvo");
        exit();
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao salvar";
        toast.error(msg);
      }
    });
  }

  function cancel() {
    // No DOM reset needed — exit() unmounts the input/contentEditable;
    // Display re-renders from props (unchanged since we never saved).
    exit();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    if (
      props.variant === "plain" &&
      !("multiline" in props && props.multiline) &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      void save();
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    if (props.variant === "plain") return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  // ── Display with hover affordance (edit on, not yet clicked) ────────────────
  if (!editing) {
    const affordance =
      "cursor-text rounded outline-dotted outline-1 outline-offset-2 outline-brand/40 hover:bg-brand/5 hover:outline-2 hover:outline-brand transition-colors";
    if (props.variant === "plain") {
      return (
        <Tag
          className={[props.className ?? "", affordance].join(" ")}
          onClick={startEdit}
          title="Clique para editar"
        >
          {props.value}
        </Tag>
      );
    }
    return (
      <Tag
        className={[props.className ?? "", affordance].join(" ")}
        onClick={startEdit}
        title="Clique para editar"
        {...htmlProps(props.html)}
      />
    );
  }

  // ── Active edit ─────────────────────────────────────────────────────────────
  const activeOutline =
    "outline outline-2 outline-offset-2 outline-brand rounded bg-background/95";

  if (props.variant === "plain") {
    const multiline = "multiline" in props && props.multiline;
    return (
      <Tag className={props.className}>
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            defaultValue={props.value}
            onKeyDown={onKeyDown}
            disabled={pending}
            rows={3}
            style={{ ...INHERIT_STYLE, width: "100%", resize: "vertical" }}
            className={`${activeOutline} p-1 disabled:opacity-60`}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            defaultValue={props.value}
            onKeyDown={onKeyDown}
            disabled={pending}
            style={{ ...INHERIT_STYLE, width: "100%", minWidth: "8em" }}
            className={`${activeOutline} px-1 disabled:opacity-60`}
          />
        )}
        <FloatingSaveBar
          anchorRef={inputRef as React.RefObject<HTMLElement | null>}
          onSave={save}
          onCancel={cancel}
          pending={pending}
        />
      </Tag>
    );
  }

  // rich / answer
  const seedProps = htmlProps(original ?? "");
  return (
    <Tag className={props.className}>
      <span
        ref={editRef as React.RefObject<HTMLSpanElement>}
        contentEditable={!pending}
        suppressContentEditableWarning
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className={`block ${activeOutline} p-1 focus:outline-brand`}
        style={INHERIT_STYLE}
        {...seedProps}
      />
      <FloatingSaveBar
        anchorRef={editRef as React.RefObject<HTMLElement | null>}
        onSave={save}
        onCancel={cancel}
        pending={pending}
      />
    </Tag>
  );
}

// ── Save / Cancel floating bar (portal'd to body to escape overflow-clipped parents) ──

function FloatingSaveBar({
  anchorRef,
  onSave,
  onCancel,
  pending,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
    update();
    // Capture phase on scroll catches every scrolling ancestor
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="flex items-center gap-1 rounded-md border border-border bg-popover px-1 py-1 text-xs shadow-md"
      contentEditable={false}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          if (!pending) onSave();
        }}
        disabled={pending}
        className="flex items-center gap-1 rounded bg-brand px-2 py-1 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        Salvar
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          if (!pending) onCancel();
        }}
        disabled={pending}
        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-foreground hover:bg-accent disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        Cancelar
      </button>
      <span className="hidden px-1 text-muted-foreground sm:inline">
        Esc cancela
      </span>
    </div>,
    document.body,
  );
}
