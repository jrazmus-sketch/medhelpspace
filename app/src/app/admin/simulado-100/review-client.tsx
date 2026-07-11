"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Flag, CheckCircle2, ChevronDown } from "lucide-react";
import { safe } from "@/lib/sanitize";
import { setSimuladoReviewFlag } from "@/actions/simulado-review";

// Review UI for the free 100-question simulado: every question rendered in full
// (enunciado + alternativas + gabarito + comentário) grouped by bloco, with a
// per-question "swap this one" flag + note that persists to
// simulado_review_flags. Flag data feeds scripts/build-simulado-100.js, which
// excludes flagged ids on re-run and picks replacements from the same pool.
// All strings via admin i18n (simReview.*) — pt-BR for Karina, en for Justin.

export type ReviewQuestion = {
  id: number;
  question: string;
  answers: { text: string; correct: boolean }[];
  media_url: string | null;
  explanation_html: string | null;
  edition: string | null;
  topicName: string | null;
  tier: string | null;
  flagged: boolean;
  note: string | null;
};

type Bloco = { key: string; label: string; questions: ReviewQuestion[] };

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function htmlProps(html: string): React.HTMLAttributes<HTMLDivElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

function QuestionCard({
  q,
  index,
  onChange,
}: {
  q: ReviewQuestion;
  index: number;
  onChange: (id: number, flagged: boolean, note: string | null) => void;
}) {
  const { t } = useTranslation();
  const [flagged, setFlagged] = useState(q.flagged);
  const [note, setNote] = useState(q.note ?? "");
  const [savedNote, setSavedNote] = useState(q.note ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState(false);

  function toggleFlag() {
    const next = !flagged;
    setErr(false);
    startTransition(async () => {
      const res = await setSimuladoReviewFlag({
        questionId: q.id,
        flagged: next,
        note: next ? note : null,
      });
      if (!res.ok) {
        setErr(true);
        return;
      }
      setFlagged(next);
      if (!next) {
        setNote("");
        setSavedNote("");
      }
      onChange(q.id, next, next ? note || null : null);
    });
  }

  function saveNote() {
    setErr(false);
    startTransition(async () => {
      const res = await setSimuladoReviewFlag({ questionId: q.id, flagged: true, note });
      if (!res.ok) {
        setErr(true);
        return;
      }
      setSavedNote(note);
      onChange(q.id, true, note || null);
    });
  }

  return (
    <div
      id={`q-${q.id}`}
      className={`rounded-2xl border p-4 sm:p-5 ${
        flagged ? "border-amber-500/60 bg-amber-500/5" : "border-border bg-surface-1"
      }`}
    >
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
          {t("simReview.questionN", { n: index + 1 })}
        </span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
          id {q.id}
        </span>
        {q.edition && (
          <span className="rounded bg-brand-muted/40 px-1.5 py-0.5 font-mono font-semibold text-brand">
            Revalida {q.edition}
          </span>
        )}
        {q.topicName && (
          <span className="max-w-[16rem] truncate rounded bg-surface-2 px-1.5 py-0.5 text-muted-foreground">
            {q.topicName}
          </span>
        )}
        {q.tier && q.tier !== "-" && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
            Tier {q.tier}
          </span>
        )}
      </div>

      {/* Enunciado */}
      {q.media_url && (
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={q.media_url} alt="" className="max-h-72 w-full bg-white object-contain dark:bg-neutral-100" />
        </div>
      )}
      <div
        className="prose-content mt-3 text-sm leading-relaxed text-foreground [&_h3]:mb-2 [&_h3]:text-xs [&_h3]:font-mono [&_h3]:uppercase [&_h3]:tracking-wider [&_h3]:text-brand [&_p]:mb-2"
        {...htmlProps(safe(q.question))}
      />

      {/* Alternativas com gabarito */}
      <div className="mt-3 space-y-1.5">
        {q.answers.map((a, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
              a.correct
                ? "border-green-500/50 bg-green-500/10"
                : "border-border/60 bg-background/40"
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                a.correct ? "bg-green-500 text-white" : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {LETTERS[i] ?? "?"}
            </span>
            <span className="prose-content flex-1 leading-snug [&_p]:m-0" {...htmlProps(safe(a.text))} />
          </div>
        ))}
      </div>

      {/* Comentário (collapsible) */}
      {q.explanation_html && (
        <details className="group mt-3 rounded-lg border border-border/60 bg-background/40">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            {t("simReview.showExplanation")}
          </summary>
          <div
            className="prose-content border-t border-border/60 px-3 py-3 text-sm leading-relaxed text-foreground [&_p]:mb-2"
            {...htmlProps(safe(q.explanation_html))}
          />
        </details>
      )}

      {/* Flag controls */}
      <div className="mt-4 border-t border-border/60 pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={toggleFlag}
          className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
            flagged
              ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "border-border bg-surface-1 text-foreground hover:border-amber-500/60 hover:bg-amber-500/10"
          }`}
        >
          <Flag className="h-4 w-4" />
          {flagged ? t("simReview.flagged") : t("simReview.flagAction")}
        </button>
        {flagged && (
          <div className="mt-2.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`note-${q.id}`}>
              {t("simReview.noteLabel")}
            </label>
            <textarea
              id={`note-${q.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("simReview.notePlaceholder")}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {note !== savedNote && (
              <button
                type="button"
                disabled={pending}
                onClick={saveNote}
                className="mt-1.5 flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg hover:opacity-95 disabled:opacity-60"
              >
                {pending ? "…" : t("simReview.saveNote")}
              </button>
            )}
          </div>
        )}
        {err && <p className="mt-2 text-sm text-red-500">{t("simReview.saveError")}</p>}
      </div>
    </div>
  );
}

export function SimuladoReviewClient({ blocos }: { blocos: Bloco[] }) {
  const { t } = useTranslation();
  // Live flag map for the header counter (cards own their local state; this
  // mirror only feeds the summary + bloco badges).
  const [flagMap, setFlagMap] = useState<Map<number, string | null>>(() => {
    const m = new Map<number, string | null>();
    for (const b of blocos) for (const q of b.questions) if (q.flagged) m.set(q.id, q.note);
    return m;
  });

  const total = useMemo(() => blocos.reduce((n, b) => n + b.questions.length, 0), [blocos]);

  function handleChange(id: number, flagged: boolean, note: string | null) {
    setFlagMap((prev) => {
      const next = new Map(prev);
      if (flagged) next.set(id, note);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      {/* Header + how-to */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {t("simReview.title")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("simReview.subtitle", { total })}</p>
        <div className="mt-4 rounded-2xl border border-brand/25 bg-brand-muted/10 p-4 text-sm text-foreground">
          <p className="font-semibold">{t("simReview.howTitle")}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>{t("simReview.how1")}</li>
            <li>{t("simReview.how2")}</li>
            <li>{t("simReview.how3")}</li>
          </ol>
        </div>
        <div
          className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            flagMap.size > 0
              ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
          }`}
        >
          {flagMap.size > 0 ? <Flag className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {flagMap.size > 0
            ? t("simReview.flaggedCount", { count: flagMap.size })
            : t("simReview.noneFlagged")}
        </div>
      </div>

      {/* Blocos */}
      {blocos.map((b, bi) => {
        const blocoFlags = b.questions.filter((q) => flagMap.has(q.id)).length;
        return (
          <section key={b.key} className="mt-8">
            <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                {t("simReview.blocoHeading", { n: bi + 1, label: b.label })}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {b.questions.length}
                </span>
                {blocoFlags > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {t("simReview.blocoFlagged", { count: blocoFlags })}
                  </span>
                )}
              </h2>
            </div>
            <div className="mt-4 space-y-4">
              {b.questions.map((q, qi) => (
                <QuestionCard key={q.id} q={q} index={qi} onChange={handleChange} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
