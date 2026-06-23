"use client";

import { useState } from "react";
import Link from "next/link";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { safe } from "@/lib/sanitize";
import { EditableText } from "@/components/admin/editable-text";
import { useEditMode } from "@/providers/edit-mode-provider";
import type { QuizQuestionData } from "./quiz-renderer";

// Builds the "Análise das alternativas incorretas:" block from each wrong
// answer's `feedback` field. Restores the WP behaviour where students saw
// why every wrong option was wrong, not just the one they clicked. Renders
// nothing if no wrong answer has feedback.
function buildDistractorAnalysisHtml(
  answers: QuizQuestionData["answers"],
): string {
  const wrongs = answers
    .map((a, i) => ({ ...a, letter: "ABCDE"[i] }))
    .filter((a) => !a.correct && a.feedback && a.feedback.trim().length > 0);
  if (wrongs.length === 0) return "";
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const items = wrongs
    .map((a) => `<p><strong>(${a.letter})</strong> ${escape(a.feedback)}</p>`)
    .join("\n");
  return `<h4>Análise das alternativas incorretas:</h4>\n${items}`;
}

// Splices the distractor-analysis block into explanation_html immediately
// before <h4>PEGA REVALIDA:</h4> or <h4>Resumo-chave:</h4> when present,
// otherwise appends. Matches the original WP ordering (Comentário →
// Análise → PEGA → Resumo).
function augmentExplanationForDisplay(
  explanationHtml: string | null,
  answers: QuizQuestionData["answers"],
): string | null {
  const analysis = buildDistractorAnalysisHtml(answers);
  if (!explanationHtml) return analysis || null;
  if (!analysis) return explanationHtml;
  const splitIdx = explanationHtml.search(/<h4>(?:PEGA REVALIDA|Resumo-chave)/);
  if (splitIdx === -1) return explanationHtml + "\n" + analysis;
  return (
    explanationHtml.slice(0, splitIdx) +
    analysis +
    "\n" +
    explanationHtml.slice(splitIdx)
  );
}

interface Props {
  questions: QuizQuestionData[];
  pageId: number;
  specialtyId: number | null;
  nextQuizHref: string | null;
  nextQuizTitle: string | null;
  specialtyHref: string;
  specialtyName: string;
}

export function QuizPlayer({
  questions,
  pageId,
  specialtyId,
  nextQuizHref,
  nextQuizTitle,
  specialtyHref,
  specialtyName,
}: Props) {
  const { active: editActive } = useEditMode();
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [activeIds, setActiveIds] = useState<number[]>(() => questions.map((q) => q.id));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<"quiz" | "summary">("quiz");

  const activeQuestions = activeIds.map((id) => questions.find((q) => q.id === id)!);
  const question = activeQuestions[currentIdx];
  const answered = selectedIdx !== null;
  const isRetry = activeIds.length < questions.length;
  const correctAnswer = question?.answers.find((a) => a.correct);
  const selectedAnswer = answered ? question?.answers[selectedIdx] : null;
  // Per-distractor feedback ("why this wrong answer is wrong") is often empty in
  // legacy simulados; the canonical explanation lives on the correct answer.
  const showSelectedFeedback = Boolean(
    selectedAnswer && !selectedAnswer.correct && selectedAnswer.feedback,
  );
  const feedback = showSelectedFeedback
    ? selectedAnswer!.feedback
    : correctAnswer?.feedback || "";
  const explanationHtml = question?.explanation_html ?? null;
  // Display version includes the per-distractor "Análise das alternativas
  // incorretas:" block reconstructed from each wrong answer's feedback.
  // Admin edits remain on the raw explanation_html field (editHtml below).
  const explanationDisplayHtml = question
    ? augmentExplanationForDisplay(explanationHtml, question.answers)
    : null;

  function handleSelect(idx: number) {
    if (answered) return;
    const correct = question.answers[idx].correct;
    setSelectedIdx(idx);
    setResults((prev) => ({ ...prev, [question.id]: correct }));

    if (!USE_MOCK_DATA) {
      fetch("/api/quiz-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          pageId,
          specialtyId,
          isCorrect: correct,
        }),
      });
    }
  }

  function handleNext() {
    if (currentIdx < activeQuestions.length - 1) {
      setCurrentIdx((i) => i + 1);
      setSelectedIdx(null);
    } else {
      setPhase("summary");
      setCurrentIdx(0);
      setSelectedIdx(null);
    }
  }

  function handleRetry() {
    const wrongIds = questions.filter((q) => results[q.id] === false).map((q) => q.id);
    setActiveIds(wrongIds);
    setCurrentIdx(0);
    setSelectedIdx(null);
    setPhase("quiz");
  }

  function handleRestart() {
    setResults({});
    setActiveIds(questions.map((q) => q.id));
    setCurrentIdx(0);
    setSelectedIdx(null);
    setPhase("quiz");
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  if (phase === "summary") {
    const correctCount = Object.values(results).filter(Boolean).length;
    const total = questions.length;
    const wrongCount = questions.filter((q) => results[q.id] === false).length;
    const pct = Math.round((correctCount / total) * 100);

    return (
      <div className="space-y-6 max-w-2xl">
        {/* Score card */}
        <div className="rounded-xl border border-border bg-surface-1 p-6 text-center">
          <div className="text-5xl font-bold tabular-nums text-brand">
            {correctCount}
            <span className="text-2xl font-normal text-muted-foreground">/{total}</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">questões corretas ({pct}%)</div>
          <div className="mt-4 h-2 w-full rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Per-question results */}
        <div className="space-y-2">
          {questions.map((q) => {
            const ok = results[q.id];
            return (
              <div
                key={q.id}
                className={[
                  "flex items-start gap-3 rounded-lg border p-3 text-sm",
                  ok
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-red-500/30 bg-red-500/5",
                ].join(" ")}
              >
                <span
                  className={[
                    "shrink-0 font-bold",
                    ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
                  ].join(" ")}
                >
                  {ok ? "✓" : "✗"}
                </span>
                <div
                  className="min-w-0 flex-1 text-muted-foreground line-clamp-2 [&_h3]:inline [&_h3]:text-xs [&_h3]:font-normal [&_p]:inline [&_strong]:font-normal"
                  dangerouslySetInnerHTML={{ __html: safe(q.question) }}
                />
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Primary: continue forward */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {nextQuizHref && (
              <Link
                href={nextQuizHref}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
              >
                <span className="truncate">
                  Próxima questão{nextQuizTitle ? `: ${nextQuizTitle}` : ""}
                </span>
                <span aria-hidden>→</span>
              </Link>
            )}
            <Link
              href={specialtyHref}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-brand/40 hover:text-brand transition-colors inline-flex items-center justify-center"
            >
              ← Voltar para {specialtyName}
            </Link>
          </div>

          {/* Secondary: redo this quiz */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
            {wrongCount > 0 && (
              <button
                onClick={handleRetry}
                className="hover:text-brand underline-offset-4 hover:underline transition-colors"
              >
                Refazer as erradas ({wrongCount})
              </button>
            )}
            <button
              onClick={handleRestart}
              className="hover:text-brand underline-offset-4 hover:underline transition-colors"
            >
              Recomeçar do zero
            </button>
            <Link
              href={`/app/revisao/sessao?page=${pageId}`}
              className="hover:text-brand underline-offset-4 hover:underline transition-colors"
            >
              Revisar com repetição espaçada
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Quiz ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {isRetry && <span className="text-brand font-medium mr-1">Refazendo erradas —</span>}
            Questão {currentIdx + 1} de {activeQuestions.length}
          </span>
          <span>{Object.values(results).filter(Boolean).length} corretas</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${(currentIdx / activeQuestions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Media image (ECG strips, diagrams, etc.) */}
      {question.media_url && (
        <div className="rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.media_url}
            alt=""
            className="w-full max-h-72 object-contain bg-white dark:bg-neutral-100"
          />
        </div>
      )}

      {/* Question text */}
      <EditableText
        variant="rich"
        table="quiz_questions"
        id={question.id}
        field="question"
        className="prose-content quiz-stem"
        html={safe(question.question)}
        editHtml={question.question}
      />

      {/* Answer options */}
      <div className="space-y-2">
        {question.answers.map((answer, idx) => {
          let cls =
            "w-full text-left rounded-lg border p-3.5 text-sm transition-colors leading-snug";

          if (!answered) {
            cls += " border-border cursor-pointer hover:border-brand/50 hover:bg-surface-2";
          } else if (idx === selectedIdx) {
            cls += answer.correct
              ? " border-green-500 bg-green-500/10 cursor-default"
              : " border-red-500 bg-red-500/10 cursor-default";
          } else if (answer.correct) {
            cls += " border-green-500 bg-green-500/10 cursor-default";
          } else {
            cls += " border-border/40 opacity-50 cursor-default";
          }

          return (
            <button
              key={idx}
              className={cls}
              onClick={() => handleSelect(idx)}
              // Stay clickable in edit mode so the EditableText inside can receive clicks;
              // handleSelect already short-circuits when `answered` is true.
              disabled={answered && !editActive}
            >
              <EditableText
                variant="answer"
                questionId={question.id}
                answerIdx={idx}
                field="text"
                html={safe(answer.text)}
                editHtml={answer.text}
              />
            </button>
          );
        })}
      </div>

      {/* Feedback (per-distractor "why wrong" or correct-answer feedback).
          Edit mode rewrites the existing feedback; adding feedback to an
          answer that has none goes through the full admin editor. */}
      {answered && feedback && (
        <div className="rounded-lg border border-brand/20 bg-brand-muted p-4">
          {showSelectedFeedback ? (
            <EditableText
              variant="answer"
              questionId={question.id}
              answerIdx={selectedIdx!}
              field="feedback"
              className="prose-content text-sm"
              html={safe(selectedAnswer!.feedback)}
              editHtml={selectedAnswer!.feedback}
            />
          ) : correctAnswer ? (
            <EditableText
              variant="answer"
              questionId={question.id}
              answerIdx={question.answers.findIndex((a) => a.correct)}
              field="feedback"
              className="prose-content text-sm"
              html={safe(correctAnswer.feedback)}
              editHtml={correctAnswer.feedback}
            />
          ) : null}
        </div>
      )}

      {/* Rich explanation block (Comentário / Análise / PEGA / Resumo).
          Display HTML may include a reconstructed "Análise das alternativas
          incorretas:" section assembled from per-answer feedback; edit HTML
          is the raw explanation_html so admin edits stay scoped to one field. */}
      {answered && explanationDisplayHtml && (
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <EditableText
            variant="rich"
            table="quiz_questions"
            id={question.id}
            field="explanation_html"
            className="prose-content quiz-explanation text-sm"
            html={safe(explanationDisplayHtml)}
            editHtml={explanationHtml ?? ""}
          />
        </div>
      )}

      {/* Next / finish */}
      {answered && (
        <button
          onClick={handleNext}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity"
        >
          {currentIdx < activeQuestions.length - 1 ? "Próxima questão →" : "Ver resultado"}
        </button>
      )}
    </div>
  );
}
