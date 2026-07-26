"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSimuladoAnswers, submitSimulado } from "@/actions/simulado";
import type { SimuladoExamQuestion, SimuladoProgress } from "@/lib/magnet/simulado";
import { SiteText } from "@/components/landing/site-text";
import { SimuladoEmailCheck } from "@/components/magnet/simulado-email-check";

// The exam surface for /simulado-revalida/prova.
//
// This is deliberately NOT a study tool. It simulates the real 1ª etapa:
//   • no correctness feedback of any kind until the exam is submitted
//   • no área/tema label on any question — in the real prova nobody tells you
//     "this one is Pediatria", and recognising it is part of what's being tested
//   • answers are freely revisable, questions skippable, blanks allowed, and a
//     folha de respostas lets the candidate jump anywhere, like a paper booklet
//   • no timer. Time pressure is exactly what we do NOT want people associating
//     with studying here; the real exam's 5 hours appears once, as a reference.
//
// The gabarito is not in this component's props — grading happens server-side at
// submit, so devtools reveals nothing.

const LETTERS = ["A", "B", "C", "D"];
const VERIFY_PROMPT_AFTER = 10; // answered questions before we ask them to confirm the e-mail

export function SimuladoExam({
  questions,
  firstName,
  maskedEmail,
  emailBounced,
  emailConfirmed,
  initialAnswers,
  initialFlagged,
  minAnswers,
  startOnInstructions,
}: {
  questions: SimuladoExamQuestion[];
  firstName: string | null;
  maskedEmail: string;
  /** The resume-link email hard-bounced — this address is dead. */
  emailBounced: boolean;
  /** They already told us the link arrived (leads.sim_email_confirmed_at). */
  emailConfirmed: boolean;
  initialAnswers: SimuladoProgress;
  initialFlagged: number[];
  minAnswers: number;
  startOnInstructions: boolean;
}) {
  const router = useRouter();

  const [view, setView] = useState<"instructions" | "exam" | "sheet">(
    startOnInstructions ? "instructions" : "exam",
  );
  const [answers, setAnswers] = useState<SimuladoProgress>(initialAnswers);
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set(initialFlagged));
  const [idx, setIdx] = useState(() => {
    const firstBlank = questions.findIndex((q) => !(String(q.id) in initialAnswers));
    return firstBlank === -1 ? 0 : firstBlank;
  });
  const [confirming, setConfirming] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifyDismissed, setVerifyDismissed] = useState(false);

  const total = questions.length;
  const answeredCount = Object.keys(answers).length;
  const question = questions[idx];
  const blankCount = total - answeredCount;

  // ── Debounced autosave ─────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback((next: SimuladoProgress, nextFlagged: Set<number>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveSimuladoAnswers({ answered: next, flagged: Array.from(nextFlagged) });
    }, 1200);
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const choose = useCallback(
    (answerIdx: number) => {
      if (!question) return;
      const key = String(question.id);
      const next = { ...answers };
      // Tapping the selected alternative again clears it — blanks are legitimate.
      if (next[key]?.a === answerIdx) delete next[key];
      else next[key] = { a: answerIdx };
      setAnswers(next);
      scheduleSave(next, flagged);
    },
    [question, answers, flagged, scheduleSave],
  );

  const toggleFlag = useCallback(() => {
    if (!question) return;
    const next = new Set(flagged);
    if (next.has(question.id)) next.delete(question.id);
    else next.add(question.id);
    setFlagged(next);
    scheduleSave(answers, next);
  }, [question, flagged, answers, scheduleSave]);

  const go = useCallback(
    (to: number) => {
      setIdx(Math.max(0, Math.min(to, total - 1)));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" });
    },
    [total],
  );

  const flaggedCount = flagged.size;
  // A known-dead address is shown IMMEDIATELY — waiting for 10 answers to tell
  // someone their exam link never arrived wastes the window we still have them in.
  // Everyone else gets the routine nudge once they are invested enough to care.
  // `emailConfirmed` is server state (leads.sim_email_confirmed_at), so confirming
  // once silences it for good rather than until the next page load.
  const showVerifyPrompt =
    !verifyDismissed &&
    !emailConfirmed &&
    view === "exam" &&
    (emailBounced || answeredCount >= VERIFY_PROMPT_AFTER);

  async function doSubmit() {
    setSubmitting(true);
    setSubmitErr(null);
    // Flush any pending autosave first — the server grades from what IT has stored.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await saveSimuladoAnswers({ answered: answers, flagged: Array.from(flagged) });

    const res = await submitSimulado();
    if (res.status === "submitted" || res.status === "already_submitted") {
      router.push("/simulado-revalida/resultado");
      return;
    }
    setSubmitting(false);
    if (res.status === "too_few") {
      setSubmitErr(
        `Você respondeu ${res.answered} de ${total} questões. Responda pelo menos ${res.minimum} para liberar seu diagnóstico e o gabarito comentado.`,
      );
    } else {
      setSubmitErr("Não foi possível entregar sua prova agora. Tente novamente em instantes.");
    }
  }

  const statuses = useMemo(
    () =>
      questions.map((q) => ({
        id: q.id,
        position: q.position,
        answered: String(q.id) in answers,
        flagged: flagged.has(q.id),
      })),
    [questions, answers, flagged],
  );

  if (total === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 text-center text-muted-foreground">
        Simulado em preparação. Tente novamente em instantes.
      </div>
    );
  }

  // ── Instructions ───────────────────────────────────────────────────────────
  if (view === "instructions") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-foreground">
        <div className="w-full max-w-lg">
          <p className="font-mono text-xs uppercase tracking-wider text-brand">
            <SiteText as="span" k="sim.instructions.eyebrow" fallback="Revalida · 1ª etapa" />
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {firstName ? `Tudo pronto, ${firstName}.` : "Tudo pronto."}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            <SiteText
              as="span"
              multiline
              k="sim.instructions.intro"
              fallback="Leia antes de começar. Este simulado funciona como a prova real — você só vê o resultado no final."
            />
          </p>

          <ul className="mt-6 space-y-3 rounded-2xl border border-border bg-surface-1 p-5 text-sm">
            {[
              {
                k: "sim.instructions.item_questions",
                fallback: "**100 questões objetivas**, uma única alternativa correta em cada uma.",
              },
              {
                k: "sim.instructions.item_time",
                fallback:
                  "**Sem limite de tempo.** Na prova real você teria cinco horas para estas 100 questões — aqui, faça no seu ritmo.",
              },
              {
                k: "sim.instructions.item_feedback",
                fallback:
                  "**Você não verá acertos nem erros durante a prova.** O gabarito comentado é liberado quando você entregar.",
              },
              {
                k: "sim.instructions.item_navigation",
                fallback:
                  "Pode **pular, voltar, mudar respostas e marcar questões para revisar** — como no caderno de prova.",
              },
              {
                k: "sim.instructions.item_save",
                fallback:
                  "Seu progresso é **salvo automaticamente**. Pode fechar e voltar depois pelo link que enviamos por e-mail.",
              },
              {
                k: "sim.instructions.item_consult",
                fallback:
                  "Para o resultado valer alguma coisa, **tente responder sem consultar** resumos ou protocolos.",
              },
            ].map((item) => (
              <li key={item.k} className="flex gap-3">
                <span aria-hidden className="mt-0.5 text-brand">
                  •
                </span>
                <SiteText
                  as="span"
                  multiline
                  className="flex-1 text-foreground"
                  k={item.k}
                  fallback={item.fallback}
                />
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setView("exam")}
            className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-all hover:opacity-95 active:scale-[0.99]"
          >
            <SiteText as="span" k="sim.instructions.cta" fallback="Começar a prova →" />
          </button>
        </div>
      </div>
    );
  }

  // ── Folha de respostas ─────────────────────────────────────────────────────
  if (view === "sheet") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-5 py-8">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              Folha de respostas
            </h1>
            <button
              type="button"
              onClick={() => setView("exam")}
              className="flex min-h-[44px] items-center rounded-xl border border-border px-4 text-sm font-semibold transition-colors hover:border-brand"
            >
              Voltar à prova
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-brand" /> Respondida
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-border bg-surface-1" /> Em branco
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-surface-1 ring-2 ring-amber-500" /> Marcada
            </span>
          </div>

          <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10">
            {statuses.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  go(i);
                  setView("exam");
                }}
                aria-label={`Questão ${s.position}${s.answered ? ", respondida" : ", em branco"}${s.flagged ? ", marcada para revisar" : ""}`}
                className={`flex h-11 items-center justify-center rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                  s.answered
                    ? "bg-brand text-brand-fg"
                    : "border border-border bg-surface-1 text-muted-foreground hover:border-brand"
                } ${s.flagged ? "ring-2 ring-amber-500" : ""}`}
              >
                {s.position}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-surface-1 p-5 text-sm">
            <p className="text-foreground">
              <strong className="tabular-nums">{answeredCount}</strong> respondidas ·{" "}
              <strong className="tabular-nums">{blankCount}</strong> em branco ·{" "}
              <strong className="tabular-nums">{flaggedCount}</strong> marcadas
            </p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg transition-opacity hover:opacity-95"
            >
              Entregar a prova →
            </button>
          </div>
        </div>
        {confirming && (
          <SubmitDialog
            total={total}
            answered={answeredCount}
            blank={blankCount}
            flaggedCount={flaggedCount}
            minAnswers={minAnswers}
            submitting={submitting}
            error={submitErr}
            onCancel={() => {
              setConfirming(false);
              setSubmitErr(null);
            }}
            onConfirm={doSubmit}
          />
        )}
      </div>
    );
  }

  // ── Question view ──────────────────────────────────────────────────────────
  const chosen = answers[String(question.id)];
  const isFlagged = flagged.has(question.id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-sm font-bold tracking-tight">
            MedHelp<span className="text-brand">Space</span>
          </span>
          <button
            type="button"
            onClick={() => setView("sheet")}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition-colors hover:border-brand"
          >
            <span className="tabular-nums">
              {answeredCount}/{total}
            </span>
            <span className="text-muted-foreground">Folha de respostas</span>
          </button>
        </div>

        {/* Progress — how much is DONE, never how much is right */}
        <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${(answeredCount / total) * 100}%` }}
          />
        </div>

        {showVerifyPrompt && (
          <SimuladoEmailCheck
            mode={emailBounced ? "bounce" : "check"}
            maskedEmail={maskedEmail}
            onResolved={() => setVerifyDismissed(true)}
          />
        )}

        {/* Enunciado — no área label anywhere, by design */}
        <div className="rounded-2xl border border-border bg-surface-1 p-5 sm:p-6">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Questão {question.position} de {total}
          </p>
          {question.mediaUrl && (
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={question.mediaUrl}
                alt={`Imagem da questão ${question.position}`}
                className="max-h-80 w-full bg-white object-contain dark:bg-neutral-100"
              />
            </div>
          )}
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-foreground">
            {question.enunciado}
          </p>
        </div>

        {/* Alternatives — neutral in every state; selection is the only signal */}
        <div className="mt-4 space-y-2.5">
          {question.alternatives.map((text, i) => {
            const isChosen = chosen?.a === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => choose(i)}
                aria-pressed={isChosen}
                className={`flex min-h-[52px] w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  isChosen
                    ? "border-brand bg-brand-muted/20"
                    : "border-border bg-surface-1 hover:border-brand/60"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isChosen ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {LETTERS[i] ?? "?"}
                </span>
                <span className="flex-1 text-sm leading-snug text-foreground">{text}</span>
              </button>
            );
          })}
        </div>

        {/* Mark for review */}
        <button
          type="button"
          onClick={toggleFlag}
          className={`mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors ${
            isFlagged
              ? "border-amber-500 bg-amber-500/10 text-amber-500"
              : "border-border bg-surface-1 text-muted-foreground hover:border-brand"
          }`}
        >
          {isFlagged ? "★ Marcada para revisar" : "☆ Marcar para revisar"}
        </button>

        {/* Navigation */}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => go(idx - 1)}
            disabled={idx === 0}
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-border bg-surface-1 px-4 text-sm font-semibold transition-colors hover:border-brand disabled:opacity-40"
          >
            ← Anterior
          </button>
          {idx === total - 1 ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-95"
            >
              Entregar a prova →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(idx + 1)}
              className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-95"
            >
              Próxima →
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          💾{" "}
          <SiteText
            as="span"
            k="sim.exam.save_note"
            fallback="Seu progresso é salvo automaticamente. Pode fechar quando quiser."
          />
        </p>
      </div>

      {confirming && (
        <SubmitDialog
          total={total}
          answered={answeredCount}
          blank={blankCount}
          flaggedCount={flaggedCount}
          minAnswers={minAnswers}
          submitting={submitting}
          error={submitErr}
          onCancel={() => {
            setConfirming(false);
            setSubmitErr(null);
          }}
          onConfirm={doSubmit}
        />
      )}
    </div>
  );
}

// The hand-in-the-sheet moment: the last chance to notice blanks and flags, and
// the point where the minimum-answers rule is explained rather than just enforced.
function SubmitDialog({
  total,
  answered,
  blank,
  flaggedCount,
  minAnswers,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  total: number;
  answered: number;
  blank: number;
  flaggedCount: number;
  minAnswers: number;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const belowMinimum = answered < minAnswers;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Entregar a prova"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          Entregar a prova?
        </h2>

        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <p>
            Você respondeu <strong className="text-foreground tabular-nums">{answered}</strong> de{" "}
            {total} questões.
          </p>
          {blank > 0 && (
            <p>
              <strong className="text-foreground tabular-nums">{blank}</strong>{" "}
              {blank === 1 ? "ficou em branco" : "ficaram em branco"}.
            </p>
          )}
          {flaggedCount > 0 && (
            <p>
              <strong className="text-foreground tabular-nums">{flaggedCount}</strong>{" "}
              {flaggedCount === 1 ? "está marcada" : "estão marcadas"} para revisar.
            </p>
          )}
        </div>

        <p className="mt-4 rounded-xl border border-border bg-surface-1 px-4 py-3 text-sm text-foreground">
          {belowMinimum
            ? `Para liberar o diagnóstico e o gabarito comentado, responda pelo menos ${minAnswers} questões.`
            : "Depois de entregar, suas respostas não podem mais ser alteradas — e o gabarito comentado das 100 questões é liberado."}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || belowMinimum}
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg transition-opacity hover:opacity-95 disabled:opacity-40"
          >
            {submitting ? "Entregando…" : "Sim, entregar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-border bg-surface-1 px-6 text-base font-semibold text-foreground transition-colors hover:border-brand disabled:opacity-40"
          >
            Continuar a prova
          </button>
        </div>
      </div>
    </div>
  );
}
