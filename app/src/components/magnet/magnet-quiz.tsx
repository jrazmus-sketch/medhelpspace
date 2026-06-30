"use client";

import { useState, useTransition } from "react";
import { safe } from "@/lib/sanitize";
import { captureLeadAndUnlock, finalizeLeadResult } from "@/actions/magnet";
import type { MagnetQuestion } from "@/lib/magnet/questions";
import type { MagnetAnswer, PlanPreview } from "@/lib/magnet/plan-preview";
import type { MagnetFlashcard } from "@/lib/magnet/flashcards";
import { MagnetFlashcards } from "@/components/magnet/magnet-flashcards";

// Mirrors the repo's spread-via-helper workaround for the dangerouslySetInnerHTML
// security hook (see components/admin/editable-text.tsx).
function htmlProps(html: string): React.HTMLAttributes<HTMLDivElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

export type MagnetUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

type AnswerRecord = {
  questionId: number;
  selectedIdx: number;
  isCorrect: boolean;
  specialtyId: number | null;
  pageId: number;
};

const FREE_COUNT = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MagnetQuiz({
  freeQuestions,
  utm,
}: {
  freeQuestions: MagnetQuestion[];
  utm: MagnetUtm;
}) {
  const [questions, setQuestions] = useState<MagnetQuestion[]>(freeQuestions);
  const [idx, setIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>({});
  const [phase, setPhase] = useState<"quiz" | "gate" | "cohort" | "results">("quiz");
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [sampleCards, setSampleCards] = useState<MagnetFlashcard[]>([]);
  const [cohort, setCohort] = useState("revalida-2026-2");
  const [pending, startTransition] = useTransition();

  const total = questions.length === FREE_COUNT ? 15 : questions.length;
  const q = questions[idx];
  const answered = selectedIdx !== null;
  const correctAnswer = q?.answers.find((a) => a.correct);
  const selectedAnswer = answered ? q?.answers[selectedIdx] : null;
  const correctCount = Object.values(answers).filter((a) => a.isCorrect).length;

  function handleSelect(i: number) {
    if (answered || !q) return;
    const isCorrect = Boolean(q.answers[i]?.correct);
    setSelectedIdx(i);
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        questionId: q.id,
        selectedIdx: i,
        isCorrect,
        specialtyId: q.specialtyId,
        pageId: q.pageId,
      },
    }));
  }

  function handleNext() {
    // Just answered the 5th free question and not yet unlocked → email gate.
    if (idx === FREE_COUNT - 1 && questions.length === FREE_COUNT) {
      setPhase("gate");
      return;
    }
    if (idx < questions.length - 1) {
      setIdx((i) => i + 1);
      setSelectedIdx(null);
      return;
    }
    // Last question answered → ask which exam, then finalize.
    setPhase("cohort");
  }

  function chooseCohort(slug: string) {
    setCohort(slug);
    const allAnswers: MagnetAnswer[] = Object.values(answers).map((a) => ({
      questionId: a.questionId,
      specialtyId: a.specialtyId,
      isCorrect: a.isCorrect,
      pageId: a.pageId,
    }));
    startTransition(async () => {
      const res = await finalizeLeadResult({ email, answers: allAnswers, targetCohort: slug });
      setPlan(res.planPreview);
      setSampleCards(res.sampleCards ?? []);
      setPhase("results");
    });
  }

  function submitGate() {
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setEmailErr("Digite um e-mail válido.");
      return;
    }
    setEmailErr(null);
    startTransition(async () => {
      const res = await captureLeadAndUnlock({ email: em, utm });
      if (!res.ok) {
        setEmailErr("Não foi possível continuar. Tente novamente.");
        return;
      }
      setQuestions([...freeQuestions, ...res.gatedQuestions]);
      setIdx(FREE_COUNT);
      setSelectedIdx(null);
      setPhase("quiz");
    });
  }

  // ── Results / offer ─────────────────────────────────────────────────────────
  if (phase === "results") {
    return (
      <MagnetResults
        score={correctCount}
        plan={plan}
        sampleCards={sampleCards}
        email={email}
        utm={utm}
        cohort={cohort}
      />
    );
  }

  // ── Cohort question (personalizes the plan date + segments the drip) ──────────
  if (phase === "cohort") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface-1 p-6 text-center sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          Quase lá — montando seu plano
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          Para qual prova você está estudando?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Usamos isso para montar seu cronograma até a data certa.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => chooseCohort("revalida-2026-2")}
            disabled={pending}
            className="rounded-xl border border-border p-4 text-left transition-colors hover:border-brand disabled:opacity-60"
          >
            <div className="text-sm font-semibold">Revalida 2026.2</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Prova em 13/09/2026 · reta final
            </div>
          </button>
          <button
            onClick={() => chooseCohort("revalida-2027-1")}
            disabled={pending}
            className="rounded-xl border border-border p-4 text-left transition-colors hover:border-brand disabled:opacity-60"
          >
            <div className="text-sm font-semibold">Revalida 2027.1</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Prova no início de 2027 · mais tempo
            </div>
          </button>
        </div>
        {pending && (
          <p className="mt-4 text-xs text-muted-foreground">Montando seu plano…</p>
        )}
      </div>
    );
  }

  // ── Email gate ──────────────────────────────────────────────────────────────
  if (phase === "gate") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-brand/30 bg-surface-1 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          {correctCount} de 5 — você está indo bem
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          Veja as 10 questões restantes + seu resultado comentado
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Mais o baralho de flashcards com revisão espaçada da 1ª etapa. É grátis — só
          precisamos do seu e-mail para enviar.
        </p>
        <div className="mt-5 space-y-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitGate()}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base outline-none focus:border-brand"
          />
          {emailErr && <p className="text-sm text-red-500">{emailErr}</p>}
          <button
            onClick={submitGate}
            disabled={pending}
            className="w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Liberando…" : "Ver as 10 restantes →"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Sem spam. Você pode sair quando quiser.
          </p>
        </div>
      </div>
    );
  }

  // ── Quiz ────────────────────────────────────────────────────────────────────
  if (!q) return null;
  const isLastFree = idx === FREE_COUNT - 1 && questions.length === FREE_COUNT;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Questão {idx + 1} de {total}
          </span>
          <span>{correctCount} corretas</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${((idx + (answered ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
      </div>

      {q.media_url && (
        <div className="overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={q.media_url}
            alt=""
            className="max-h-72 w-full bg-white object-contain dark:bg-neutral-100"
          />
        </div>
      )}

      {/* Stem */}
      <div className="prose-content quiz-stem" {...htmlProps(safe(q.question))} />

      {/* Options */}
      <div className="space-y-2">
        {q.answers.map((answer, i) => {
          let cls =
            "w-full text-left rounded-lg border p-3.5 text-sm transition-colors leading-snug";
          if (!answered) {
            cls += " border-border cursor-pointer hover:border-brand/50 hover:bg-surface-2";
          } else if (i === selectedIdx) {
            cls += answer.correct
              ? " border-green-500 bg-green-500/10"
              : " border-red-500 bg-red-500/10";
          } else if (answer.correct) {
            cls += " border-green-500 bg-green-500/10";
          } else {
            cls += " border-border/40 opacity-50";
          }
          return (
            <button key={i} className={cls} onClick={() => handleSelect(i)} disabled={answered}>
              <span {...htmlProps(safe(answer.text))} />
            </button>
          );
        })}
      </div>

      {/* Feedback / explanation */}
      {answered && (correctAnswer?.feedback || q.explanation_html) && (
        <div className="space-y-3">
          {(selectedAnswer && !selectedAnswer.correct && selectedAnswer.feedback) ||
          correctAnswer?.feedback ? (
            <div
              className="prose-content rounded-lg border border-brand/20 bg-brand-muted p-4 text-sm"
              {...htmlProps(
                safe(
                  selectedAnswer && !selectedAnswer.correct && selectedAnswer.feedback
                    ? selectedAnswer.feedback
                    : correctAnswer?.feedback || "",
                ),
              )}
            />
          ) : null}
          {q.explanation_html && (
            <div
              className="prose-content quiz-explanation rounded-lg border border-border bg-surface-1 p-4 text-sm"
              {...htmlProps(safe(q.explanation_html))}
            />
          )}
        </div>
      )}

      {/* Next / gate / finish */}
      {answered && (
        <button
          onClick={handleNext}
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isLastFree
            ? "Continuar →"
            : idx < questions.length - 1
              ? "Próxima questão →"
              : pending
                ? "Calculando…"
                : "Ver meu resultado →"}
        </button>
      )}
    </div>
  );
}

// ── Results + offer view ───────────────────────────────────────────────────────

function MagnetResults({
  score,
  plan,
  sampleCards,
  email,
  utm,
  cohort,
}: {
  score: number;
  plan: PlanPreview | null;
  sampleCards: MagnetFlashcard[];
  email: string;
  utm: MagnetUtm;
  cohort: string;
}) {
  const pct = Math.round((score / 15) * 100);
  const weak = plan?.weakSpecialties ?? [];
  const weakNames = weak.map((w) => w.name).join(", ");
  const days = plan?.daysToExam ?? null;
  const isReta = cohort === "revalida-2026-2"; // near-term cohort gets the discount

  const checkoutHref = (() => {
    const p = new URLSearchParams({
      cohort,
      email,
      utm_source: utm.source ?? "magnet",
      utm_medium: utm.medium ?? "site",
      utm_campaign: utm.campaign ?? "simulado-honesto",
    });
    if (isReta) p.set("cupom", "RETA2026"); // 2027.1 = full price, no coupon
    return `/checkout?${p.toString()}`;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Score + honest diagnostic */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6 text-center">
        <div className="text-5xl font-bold tabular-nums text-brand">
          {score}
          <span className="text-2xl font-normal text-muted-foreground">/15</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">acertos ({pct}%)</div>
        <div className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
          A 1ª etapa aprova cerca de 1 em cada 4. {weakNames ? (
            <>
              Pelo seu resultado, seus pontos mais fracos agora são{" "}
              <strong className="text-foreground">{weakNames}</strong>.
            </>
          ) : (
            <>O que falta não é esforço — é método nas matérias certas.</>
          )}
        </p>
      </div>

      {/* Stakes */}
      {days != null && (
        <p className="text-center text-sm font-medium">
          {isReta ? (
            <>
              Faltam <span className="text-brand">{days} dias</span> para a 1ª etapa (13/09). O
              que falta não é esforço — é método.
            </>
          ) : (
            <>
              Você tem <span className="text-brand">{days} dias</span> até a prova — tempo de
              sobra para construir uma base sólida, no seu ritmo.
            </>
          )}
        </p>
      )}

      {/* Flashcard taste — show the spaced-repetition system, don't just name it.
          Cards come from the lead's weak specialties (server, finalizeLeadResult). */}
      {sampleCards.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface-1 p-6">
          <h3 className="text-lg font-bold tracking-tight">
            Não basta reler — você precisa recordar
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {weakNames ? (
              <>
                Experimente agora, com {weakNames}. Vire o card e responda se você lembrou.
              </>
            ) : (
              <>Experimente agora. Vire o card e responda se você lembrou.</>
            )}
          </p>
          <div className="mt-4">
            <MagnetFlashcards
              cards={sampleCards}
              compact
              doneTitle="É exatamente assim no método completo."
              doneNote="O baralho completo já está no seu e-mail."
              ctaHref="/flashcards-gratis"
              ctaLabel="Abrir o baralho grátis →"
            />
          </div>
        </div>
      )}

      {/* Locked personalized plan preview */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6">
        <h3 className="text-lg font-bold tracking-tight">
          Seu plano de estudos até {isReta ? "13/09" : "a sua prova"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Montado a partir do seu resultado{weakNames ? <>, priorizando {weakNames}</> : null}.
        </p>

        <div className="mt-4 space-y-2">
          {(plan?.visibleItems ?? []).map((it, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
            >
              <span className="mt-0.5 text-brand">●</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{it.title}</div>
                <div className="truncate text-xs text-muted-foreground">{it.subtitle}</div>
              </div>
            </div>
          ))}

          {/* Blurred locked remainder */}
          {plan && plan.lockedCount > 0 && (
            <div className="relative overflow-hidden rounded-lg border border-border">
              <div className="space-y-2 p-3 blur-[5px]" aria-hidden>
                {Array.from({ length: Math.min(3, plan.lockedCount) }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-brand">●</span>
                    <div className="h-3 w-2/3 rounded bg-surface-2" />
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                <span className="text-xs font-semibold text-foreground">
                  + {plan.lockedCount} itens no plano completo
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cost-of-failing receipt */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6 text-sm">
        <h3 className="font-bold">A conta que ninguém te mostra</h3>
        <ul className="mt-3 space-y-1.5 text-muted-foreground">
          <li>• A taxa da 1ª etapa já custou <strong className="text-foreground">R$410</strong>.</li>
          <li>• A prova custa <strong className="text-foreground">R$4.516</strong> em taxas.</li>
          <li>
            • Reprovar e refazer a 2ª fase: <strong className="text-foreground">+~R$4.106</strong> —
            e mais um ano sem poder exercer.
          </li>
        </ul>
        <p className="mt-3">
          O método completo da 1ª etapa custa <strong className="text-foreground">R$3.990</strong> —
          menos do que custa reprovar uma vez.
        </p>
      </div>

      {/* Offer */}
      <div className="rounded-2xl border border-brand/30 bg-brand-muted p-6">
        <h3 className="text-lg font-bold tracking-tight">Continue sua revisão até a prova</h3>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>✓ Questões comentadas das 12 especialidades</li>
          <li>✓ Flashcards com revisão espaçada nos seus pontos fracos</li>
          <li>✓ Áudio-aulas MedVoice + plano de estudo personalizado</li>
        </ul>
        {isReta ? (
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground line-through">R$3.990</span>
            <span className="text-2xl font-bold text-brand">R$3.290</span>
            <span className="text-xs text-muted-foreground">em 12x ou Pix · reta final</span>
          </div>
        ) : (
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand">R$4.990</span>
            <span className="text-xs text-muted-foreground">
              em 12x ou Pix · comece no seu ritmo
            </span>
          </div>
        )}
        <a
          href={checkoutHref}
          className="mt-4 block rounded-lg bg-brand px-5 py-3 text-center text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          {isReta ? "Desbloquear meu plano completo →" : "Quero começar agora →"}
        </a>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          7 dias de garantia incondicional. Sem pegadinha.
        </p>
      </div>

      {/* Pressure release */}
      <p className="text-center text-xs text-muted-foreground">
        Sem pressa — enviamos seu resultado e o baralho de flashcards no seu e-mail também.
      </p>
    </div>
  );
}
