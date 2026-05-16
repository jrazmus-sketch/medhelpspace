"use client";

import { useState } from "react";
import { updateQuizQuestions } from "@/actions/admin";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Check, AlertCircle, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuizQuestionRow } from "./page";

type QuestionDraft = {
  id: number | null;
  question: string;
  answers: { text: string; correct: boolean; feedback: string }[];
  media_url: string;
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

export function QuizEditor({ pageId, initial }: { pageId: number; initial: QuizQuestionRow[] }) {
  const [drafts, setDrafts] = useState<QuestionDraft[]>(() =>
    initial.map((q) => ({
      id: q.id,
      question: q.question,
      answers: q.answers && q.answers.length > 0 ? q.answers : [emptyAnswer(), emptyAnswer()],
      media_url: q.media_url ?? "",
      position: q.position,
      open: false,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateQuizQuestions(
        pageId,
        drafts.map((q, i) => ({
          id: q.id,
          question: q.question,
          answers: q.answers.filter((a) => a.text.trim()),
          media_url: q.media_url || null,
          position: i + 1,
        })),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface-1">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Questões
        </h2>
        <span className="text-xs text-muted-foreground">{drafts.length}</span>
      </div>

      {drafts.length === 0 && (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          Nenhuma questão cadastrada.
        </div>
      )}

      {drafts.map((q, idx) => (
        <div key={idx} className="space-y-3 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {idx + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {q.question ? stripHtml(q.question).slice(0, 80) : <span className="text-muted-foreground italic">Sem enunciado</span>}
            </span>
            <button onClick={() => patch(idx, { open: !q.open })} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={q.open ? "Recolher" : "Expandir"}>
              {q.open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => moveQuestion(idx, "up")} disabled={idx === 0} className={cn("rounded p-1.5 transition-colors", idx === 0 ? "pointer-events-none opacity-25" : "text-muted-foreground hover:bg-accent hover:text-foreground")} title="Mover para cima">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => moveQuestion(idx, "down")} disabled={idx === drafts.length - 1} className={cn("rounded p-1.5 transition-colors", idx === drafts.length - 1 ? "pointer-events-none opacity-25" : "text-muted-foreground hover:bg-accent hover:text-foreground")} title="Mover para baixo">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => removeQuestion(idx)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" title="Excluir">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {q.open && (
            <div className="space-y-4 pl-7">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Enunciado</label>
                <RichTextEditor
                  content={q.question}
                  onChange={(html) => patch(idx, { question: html })}
                  placeholder="Texto da questão"
                  minHeight="120px"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">URL da imagem (opcional)</label>
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
                  <label className="text-sm font-medium">Alternativas</label>
                  <button onClick={() => addAnswer(idx)} className="text-xs text-brand hover:underline">+ adicionar</button>
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
                        Correta
                      </label>
                      <span className="ml-auto text-xs text-muted-foreground font-mono">
                        {String.fromCharCode(65 + aIdx)}
                      </span>
                      <button
                        onClick={() => removeAnswer(idx, aIdx)}
                        disabled={q.answers.length <= 2}
                        className={cn("rounded p-1 transition-colors", q.answers.length <= 2 ? "pointer-events-none opacity-25" : "text-destructive hover:bg-destructive/10")}
                        title="Excluir alternativa"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={a.text}
                      onChange={(e) => patchAnswer(idx, aIdx, { text: e.target.value })}
                      placeholder="Texto da alternativa"
                      className="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-sm outline-none focus:border-brand/60"
                    />
                    <input
                      type="text"
                      value={a.feedback}
                      onChange={(e) => patchAnswer(idx, aIdx, { feedback: e.target.value })}
                      placeholder="Comentário/feedback (opcional)"
                      className="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-muted-foreground outline-none focus:border-brand/60"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="px-5 py-4">
        <button onClick={addQuestion} className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-brand/50 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          Adicionar questão
        </button>
      </div>

      <div className="flex items-center gap-3 px-5 py-4">
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            Salvo
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-fg disabled:opacity-60 hover:opacity-90"
        >
          {saving ? "Salvando…" : "Salvar questões"}
        </button>
      </div>
    </div>
  );
}
