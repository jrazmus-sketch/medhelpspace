"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { updateQuizQuestions } from "@/actions/admin";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { AlertCircle, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuizQuestionRow } from "./page";
import type { SectionEditorHandle } from "./section-editor-handle";

type QuestionDraft = {
  id: number | null;
  question: string;
  answers: { text: string; correct: boolean; feedback: string }[];
  media_url: string;
  explanation_html: string;
  position: number;
  open: boolean;
};

function emptyAnswer() {
  return { text: "", correct: false, feedback: "" };
}

// Plain regex strip — safe and works in both Node and browser
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

export const QuizEditor = forwardRef<
  SectionEditorHandle,
  { pageId: number; initial: QuizQuestionRow[] }
>(function QuizEditor({ pageId, initial }, ref) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<QuestionDraft[]>(() =>
    initial.map((q) => ({
      id: q.id,
      question: q.question,
      answers: q.answers && q.answers.length > 0 ? q.answers : [emptyAnswer(), emptyAnswer()],
      media_url: q.media_url ?? "",
      explanation_html: q.explanation_html ?? "",
      position: q.position,
      open: false,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  function addQuestion() {
    const maxPos = drafts.reduce((m, q) => Math.max(m, q.position), 0);
    setDrafts((p) => [
      ...p,
      {
        id: null,
        question: "",
        answers: [emptyAnswer(), emptyAnswer(), emptyAnswer(), emptyAnswer()],
        media_url: "",
        explanation_html: "",
        position: maxPos + 1,
        open: true,
      },
    ]);
  }

  function removeQuestion(idx: number) {
    setDrafts((p) => p.filter((_, i) => i !== idx));
  }

  function moveQuestion(idx: number, dir: "up" | "down") {
    setDrafts((prev) => {
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((q, i) => ({ ...q, position: i + 1 }));
    });
  }

  function patch(idx: number, patch: Partial<QuestionDraft>) {
    setDrafts((p) => p.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function patchAnswer(qIdx: number, aIdx: number, patch: Partial<{ text: string; correct: boolean; feedback: string }>) {
    setDrafts((p) =>
      p.map((q, i) => {
        if (i !== qIdx) return q;
        return { ...q, answers: q.answers.map((a, j) => (j === aIdx ? { ...a, ...patch } : a)) };
      }),
    );
  }

  function addAnswer(qIdx: number) {
    setDrafts((p) =>
      p.map((q, i) => (i === qIdx ? { ...q, answers: [...q.answers, emptyAnswer()] } : q)),
    );
  }

  function removeAnswer(qIdx: number, aIdx: number) {
    setDrafts((p) =>
      p.map((q, i) =>
        i === qIdx && q.answers.length > 2
          ? { ...q, answers: q.answers.filter((_, j) => j !== aIdx) }
          : q,
      ),
    );
  }

  async function save(): Promise<boolean> {
    setError(null);
    try {
      await updateQuizQuestions(
        pageId,
        drafts.map((q, i) => ({
          id: q.id,
          question: q.question,
          answers: q.answers.filter((a) => a.text.trim()),
          media_url: q.media_url || null,
          explanation_html: q.explanation_html || null,
          position: i + 1,
        })),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("quizEditor.saveError"));
      return false;
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface-1">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("quizEditor.title")}
        </h2>
        <span className="text-xs text-muted-foreground">{drafts.length}</span>
      </div>

      {drafts.length === 0 && (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          {t("quizEditor.empty")}
        </div>
      )}

      {drafts.map((q, idx) => (
        <div key={idx} className="space-y-3 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {idx + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {q.question ? stripHtml(q.question).slice(0, 80) : <span className="text-muted-foreground italic">{t("quizEditor.noPrompt")}</span>}
            </span>
            <button onClick={() => patch(idx, { open: !q.open })} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={q.open ? t("quizEditor.collapse") : t("quizEditor.expand")}>
              {q.open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => moveQuestion(idx, "up")} disabled={idx === 0} className={cn("rounded p-1.5 transition-colors", idx === 0 ? "pointer-events-none opacity-25" : "text-muted-foreground hover:bg-accent hover:text-foreground")} title={t("quizEditor.moveUp")}>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => moveQuestion(idx, "down")} disabled={idx === drafts.length - 1} className={cn("rounded p-1.5 transition-colors", idx === drafts.length - 1 ? "pointer-events-none opacity-25" : "text-muted-foreground hover:bg-accent hover:text-foreground")} title={t("quizEditor.moveDown")}>
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => removeQuestion(idx)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" title={t("quizEditor.delete")}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {q.open && (
            <div className="space-y-4 pl-7">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("quizEditor.prompt")}</label>
                <RichTextEditor
                  content={q.question}
                  onChange={(html) => patch(idx, { question: html })}
                  placeholder={t("quizEditor.promptPlaceholder")}
                  minHeight="120px"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("quizEditor.imageUrl")}</label>
                <input
                  type="text"
                  value={q.media_url}
                  onChange={(e) => patch(idx, { media_url: e.target.value })}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm outline-none focus:border-brand/60"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{t("quizEditor.answers")}</label>
                  <button onClick={() => addAnswer(idx)} className="text-xs text-brand hover:underline">{t("quizEditor.addAnswer")}</button>
                </div>
                {q.answers.map((a, aIdx) => (
                  <div key={aIdx} className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={a.correct}
                          onChange={(e) => patchAnswer(idx, aIdx, { correct: e.target.checked })}
                          className="accent-brand"
                        />
                        {t("quizEditor.correct")}
                      </label>
                      <span className="ml-auto text-xs text-muted-foreground font-mono">
                        {String.fromCharCode(65 + aIdx)}
                      </span>
                      <button
                        onClick={() => removeAnswer(idx, aIdx)}
                        disabled={q.answers.length <= 2}
                        className={cn("rounded p-1 transition-colors", q.answers.length <= 2 ? "pointer-events-none opacity-25" : "text-destructive hover:bg-destructive/10")}
                        title={t("quizEditor.deleteAnswer")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={a.text}
                      onChange={(e) => patchAnswer(idx, aIdx, { text: e.target.value })}
                      placeholder={t("quizEditor.answerPlaceholder")}
                      className="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-sm outline-none focus:border-brand/60"
                    />
                    <input
                      type="text"
                      value={a.feedback}
                      onChange={(e) => patchAnswer(idx, aIdx, { feedback: e.target.value })}
                      placeholder={t("quizEditor.feedbackPlaceholder")}
                      className="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-muted-foreground outline-none focus:border-brand/60"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("quizEditor.explanation")}</label>
                <p className="text-xs text-muted-foreground">{t("quizEditor.explanationHint")}</p>
                <RichTextEditor
                  content={q.explanation_html}
                  onChange={(html) => patch(idx, { explanation_html: html })}
                  placeholder={t("quizEditor.explanationPlaceholder")}
                  minHeight="140px"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="px-5 py-4">
        <button onClick={addQuestion} className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-brand/50 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          {t("quizEditor.addQuestion")}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        </div>
      )}
    </div>
  );
});
