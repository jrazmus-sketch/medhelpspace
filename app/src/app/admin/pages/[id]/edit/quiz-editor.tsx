"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { updateQuizQuestions } from "@/actions/admin";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { AlertCircle, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Trash2, Plus, ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseQuizText, type ParseResult } from "@/lib/quiz-bulk-parse";
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

  // ── Bulk paste ──────────────────────────────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const warningCount = preview ? preview.questions.filter((q) => q.warning).length : 0;

  function handleParse() {
    setPreview(parseQuizText(bulkText));
  }

  function handleClearBulk() {
    setBulkText("");
    setPreview(null);
  }

  function handleAddParsed() {
    if (!preview || preview.questions.length === 0) return;
    setDrafts((prev) => {
      let maxPos = prev.reduce((m, q) => Math.max(m, q.position), 0);
      const added = preview.questions.map((q) => ({
        id: null,
        question: q.question,
        answers: q.answers.length > 0 ? q.answers : [emptyAnswer(), emptyAnswer()],
        media_url: q.media_url,
        explanation_html: q.explanation_html,
        position: ++maxPos,
        // Expand only the ones needing a manual correct-answer tick so they stand out.
        open: q.warning,
      }));
      return [...prev, ...added];
    });
    setBulkText("");
    setPreview(null);
    setBulkOpen(false);
  }

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

      {/* Bulk paste — auto-format a batch of Revalida-format questions at once */}
      <div className="px-5 py-4">
        <button
          type="button"
          onClick={() => setBulkOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ClipboardPaste className="h-4 w-4 text-brand" />
            {t("quizEditor.bulkTitle")}
          </span>
          {bulkOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        {bulkOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">{t("quizEditor.bulkHint")}</p>
            <textarea
              id="quiz-bulk-paste"
              name="quiz-bulk-paste"
              aria-label={t("quizEditor.bulkTitle")}
              value={bulkText}
              onChange={(e) => {
                setBulkText(e.target.value);
                setPreview(null);
              }}
              placeholder={t("quizEditor.bulkPlaceholder")}
              rows={10}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-brand/60"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleParse}
                disabled={!bulkText.trim()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
              >
                {t("quizEditor.bulkParse")}
              </button>
              {bulkText.trim() && (
                <button
                  type="button"
                  onClick={handleClearBulk}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("quizEditor.bulkClear")}
                </button>
              )}
            </div>

            {preview && (
              <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground">
                    {t("quizEditor.bulkRecognized", { count: preview.questions.length })}
                  </span>
                  {warningCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ⚠ {t("quizEditor.bulkNeedsReview", { count: warningCount })}
                    </span>
                  )}
                  {preview.errors.length > 0 && (
                    <span className="text-xs text-destructive">
                      {t("quizEditor.bulkSkipped", { count: preview.errors.length })}
                    </span>
                  )}
                </div>

                {preview.questions.length > 0 && (
                  <ol className="space-y-1 text-xs text-muted-foreground">
                    {preview.questions.map((q, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="shrink-0 tabular-nums">{i + 1}.</span>
                        <span className="min-w-0 flex-1 truncate">
                          {stripHtml(q.question).slice(0, 90) || t("quizEditor.noPrompt")}
                          {q.warning && (
                            <span className="ml-1" title={t("quizEditor.bulkWarnTip")}>⚠</span>
                          )}
                          {q.needsImage && (
                            <span className="ml-1" title={t("quizEditor.bulkImageHint")}>🖼️</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {preview.errors.length > 0 && (
                  <ul className="space-y-1 text-xs text-destructive">
                    {preview.errors.map((er, i) => (
                      <li key={i}>
                        {er.number ? `Questão ${er.number}: ` : ""}
                        {er.reason}
                      </li>
                    ))}
                  </ul>
                )}

                {preview.questions.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleAddParsed}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("quizEditor.bulkAdd", { count: preview.questions.length })}
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("quizEditor.bulkEmpty")}</p>
                )}
              </div>
            )}
          </div>
        )}
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
