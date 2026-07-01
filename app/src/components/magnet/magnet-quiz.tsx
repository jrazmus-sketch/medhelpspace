"use client";

import { useState, useTransition } from "react";
import { safe } from "@/lib/sanitize";
import {
  captureLeadAndUnlock,
  finalizeLeadResult,
  requestClaimCode,
  verifyClaimCode,
} from "@/actions/magnet";
import type { MagnetQuestion } from "@/lib/magnet/questions";
import type { MagnetAnswer, PlanPreview, FreeResultSummary } from "@/lib/magnet/plan-preview";
import type { MagnetFlashcard } from "@/lib/magnet/flashcards";
import { MagnetReward, scoreFraming } from "@/components/magnet/magnet-reward";
import { TurnstileWidget } from "@/components/magnet/turnstile-widget";
import { trackFunnel } from "@/lib/magnet/funnel-track";

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
  gclid?: string; // Google Ads click id — attribution + offline conversion import
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
const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

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
  const [phase, setPhase] = useState<
    "welcome" | "quiz" | "gate" | "cohort" | "resultsFree" | "reward"
  >("welcome");
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [hp, setHp] = useState(""); // honeypot — real users leave this blank
  const [summary, setSummary] = useState<FreeResultSummary | null>(null);
  const [cohort, setCohort] = useState("revalida-2026-2");
  // Reward (post-verify)
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [sampleCards, setSampleCards] = useState<MagnetFlashcard[]>([]);
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
      setSummary(res.summary);
      setPhase("resultsFree");
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
      const res = await captureLeadAndUnlock({ email: em, utm, honeypot: hp });
      if (!res.ok) {
        setEmailErr("Não foi possível continuar. Confira o e-mail e tente novamente.");
        return;
      }
      setEmail(em);
      setQuestions([...freeQuestions, ...res.gatedQuestions]);
      setIdx(FREE_COUNT);
      setSelectedIdx(null);
      setPhase("quiz");
    });
  }

  function onVerified(res: {
    plan: PlanPreview | null;
    sampleCards: MagnetFlashcard[];
  }) {
    setPlan(res.plan);
    setSampleCards(res.sampleCards);
    setPhase("reward");
  }

  // ── Reward (post-verify) ──────────────────────────────────────────────────────
  if (phase === "reward") {
    return (
      <MagnetReward
        score={summary?.score ?? correctCount}
        plan={plan}
        sampleCards={sampleCards}
        email={email}
        utm={utm}
        cohort={cohort}
        showDeliveredNote
      />
    );
  }

  // ── Free results + verify-to-claim ────────────────────────────────────────────
  if (phase === "resultsFree") {
    return (
      <MagnetResultsFree
        summary={summary}
        fallbackScore={correctCount}
        email={email}
        cohort={cohort}
        honeypot={hp}
        setHoneypot={setHp}
        onEmailCorrected={setEmail}
        onVerified={onVerified}
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
        {pending && <p className="mt-4 text-xs text-muted-foreground">Montando seu plano…</p>}
      </div>
    );
  }

  // ── Email gate (soft capture — NO email sent; the code comes at the reward) ───
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
          São questões reais de provas anteriores. Deixe seu e-mail para continuar e receber
          seu resultado no final — sem custo.
        </p>
        <div className="mt-5 space-y-3">
          {/* Honeypot: visually hidden, real users never fill it. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />
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

  // ── Welcome (step 0) — frames the experience for cold/ad traffic before Q1 ────
  // The server hero above carries the headline + SEO <h1>; this card sets honest
  // expectations (time, format, payoff) and captures a micro-commitment click.
  // If paid ads ever land here, this can be gated to paid traffic only (via a UTM
  // param) so organic/SEO visitors keep going straight to the questions.
  if (phase === "welcome") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface-1 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          Antes de começar
        </p>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Você resolve, vê o comentário na hora e, no final, a gente monta seu plano de estudo —
          focado nas matérias que você errou. Sem pegadinha.
        </p>

        <ul className="mt-5 space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-base leading-none">
              ⏱
            </span>
            <span>
              <strong className="font-semibold text-foreground">10–15 min</strong> · 15 questões
              comentadas, no seu ritmo
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-base leading-none">
              💬
            </span>
            <span>Comentário e explicação logo após cada resposta</span>
          </li>
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-base leading-none">
              🎯
            </span>
            <span>
              No final: seu nível real + um plano de estudo até{" "}
              <strong className="font-semibold text-foreground">a data da sua prova</strong>
            </span>
          </li>
        </ul>

        <button
          onClick={() => {
            trackFunnel("quiz_start", utm); // top-of-funnel: land → START → capture
            setPhase("quiz");
          }}
          className="mt-6 w-full rounded-lg bg-brand px-5 py-3.5 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          Começar agora →
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Grátis · sem cartão · as 5 primeiras sem cadastro
        </p>
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
          {/* Hide the score until there's something to count — a cold user
              starting at "0 corretas" reads like they're already failing. */}
          {Object.keys(answers).length > 0 && (
            <span>
              {correctCount} {correctCount === 1 ? "correta" : "corretas"}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${((idx + (answered ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* One-time guidance hint on Q1 — teaches the loop, then gets out of the way
          the moment they answer. Delivers the "this site guides you" feel. */}
      {idx === 0 && !answered && (
        <div className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand-muted px-3 py-2.5 text-xs text-muted-foreground">
          <span aria-hidden className="text-sm leading-none">
            💡
          </span>
          <span>
            Escolha uma alternativa. Assim que responder, você vê o comentário — e no final,
            montamos seu plano.
          </span>
        </div>
      )}

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

// ── Free results view + verify-to-claim ─────────────────────────────────────────

function reasonToMessage(reason?: string): string {
  switch (reason) {
    case "invalid_email":
      return "E-mail inválido. Confira e tente de novo.";
    case "disposable_email":
      return "Use um e-mail permanente (não um temporário) para receber seu material.";
    case "undeliverable_domain":
      return "Não conseguimos entregar nesse e-mail. Confira o endereço.";
    case "rate_limited":
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    case "too_soon":
      return "Acabamos de enviar. Aguarde alguns segundos antes de reenviar.";
    case "turnstile_failed":
      return "Não conseguimos confirmar que você não é um robô. Recarregue e tente de novo.";
    case "send_failed":
      return "Falha ao enviar o código. Tente novamente em instantes.";
    case "invalid_code":
      return "Código incorreto. Confira e digite novamente.";
    case "expired":
      return "Esse código expirou. Peça um novo.";
    case "too_many_attempts":
      return "Muitas tentativas. Peça um novo código.";
    case "no_code":
      return "Peça um código primeiro.";
    default:
      return "Algo deu errado. Tente novamente.";
  }
}

function MagnetResultsFree({
  summary,
  fallbackScore,
  email,
  cohort,
  honeypot,
  setHoneypot,
  onEmailCorrected,
  onVerified,
}: {
  summary: FreeResultSummary | null;
  fallbackScore: number;
  email: string;
  cohort: string;
  honeypot: string;
  setHoneypot: (v: string) => void;
  onEmailCorrected: (email: string) => void;
  onVerified: (res: { plan: PlanPreview | null; sampleCards: MagnetFlashcard[] }) => void;
}) {
  const score = summary?.score ?? fallbackScore;
  const pct = Math.round((score / 15) * 100);
  const weak = summary?.weakSpecialties ?? [];
  const days = summary?.daysToExam ?? null;
  const isReta = cohort === "revalida-2026-2";
  const planCount = summary?.planItemCount ?? 0;

  // Claim state
  const [stage, setStage] = useState<"intro" | "code">("intro");
  const [firstName, setFirstName] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsTurnstile = TURNSTILE_ENABLED && !turnstileToken;

  function sendCode(toEmail: string, previousEmail?: string) {
    setErr(null);
    startTransition(async () => {
      const res = await requestClaimCode({
        email: toEmail,
        previousEmail: previousEmail ?? null,
        firstName: firstName || null,
        honeypot,
        turnstileToken,
      });
      if (!res.ok) {
        setErr(reasonToMessage(res.reason));
        return;
      }
      setMaskedEmail(res.maskedEmail ?? "");
      if (previousEmail) onEmailCorrected(toEmail);
      setCorrecting(false);
      setCode("");
      setStage("code");
    });
  }

  function doVerify(codeValue: string) {
    setErr(null);
    startTransition(async () => {
      const res = await verifyClaimCode({ email, code: codeValue, firstName: firstName || null });
      if (!res.ok) {
        setErr(reasonToMessage(res.reason));
        if (res.reason === "invalid_code") setCode("");
        return;
      }
      onVerified({ plan: res.plan ?? null, sampleCards: res.sampleCards ?? [] });
    });
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !pending) doVerify(digits); // auto-submit on 6th digit
  }

  const HoneypotField = (
    <input
      type="text"
      name="company"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      value={honeypot}
      onChange={(e) => setHoneypot(e.target.value)}
      className="absolute left-[-9999px] h-0 w-0 opacity-0"
    />
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Score + adaptive framing (FREE) */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6 text-center">
        <div className="text-5xl font-bold tabular-nums text-brand">
          {score}
          <span className="text-2xl font-normal text-muted-foreground">/15</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">acertos ({pct}%)</div>
        <div className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">{scoreFraming(score)}</p>
      </div>

      {/* Missed-topics list (FREE) — so the plan feels earned, not generic */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6">
        <h3 className="text-base font-bold tracking-tight">
          {weak.length > 0 ? "O que escapou desta vez" : "Você foi bem nas áreas testadas"}
        </h3>
        {weak.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              São exatamente estas matérias que seu plano vai priorizar:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {weak.map((w) => (
                <span
                  key={w.id}
                  className="rounded-full border border-brand/30 bg-brand-muted px-3 py-1 text-xs font-medium text-foreground"
                >
                  {w.name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Nenhum ponto fraco claro nas questões de hoje — o plano completo mantém você afiado
            em todas as áreas até a prova.
          </p>
        )}
      </div>

      {/* Stakes (FREE) */}
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

      {/* Gated reward — verify-to-claim */}
      <div className="rounded-2xl border border-brand/30 bg-surface-1 p-6">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">🔒</span>
          <h3 className="text-lg font-bold tracking-tight">
            Seu plano de estudos + demonstração de flashcards
          </h3>
        </div>

        {stage === "intro" && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {planCount > 0 ? (
                <>
                  Seu plano personalizado de <strong className="text-foreground">{planCount} passos</strong>{" "}
                  até {isReta ? "13/09" : "a prova"} e uma demonstração de flashcards nas suas
                  matérias fracas estão prontos.
                </>
              ) : (
                <>
                  Seu plano de estudos personalizado e uma demonstração de flashcards nas suas
                  matérias fracas estão prontos.
                </>
              )}{" "}
              Confirme seu e-mail para desbloquear — é assim que garantimos que o material chega
              até você.
            </p>

            <div className="relative mt-4 space-y-3">
              {HoneypotField}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Como podemos te chamar?
                </label>
                <input
                  type="text"
                  autoComplete="given-name"
                  placeholder="Seu primeiro nome"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base outline-none focus:border-brand"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Vamos enviar um código de 6 dígitos para{" "}
                <strong className="text-foreground">{email}</strong>.
              </p>
              <TurnstileWidget onVerify={setTurnstileToken} />
              {err && <p className="text-sm text-red-500">{err}</p>}
              <button
                onClick={() => sendCode(email)}
                disabled={pending || needsTurnstile}
                className="w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending
                  ? "Enviando código…"
                  : needsTurnstile
                    ? "Confirme que você não é um robô"
                    : "Desbloquear meu plano + flashcards →"}
              </button>
            </div>
          </>
        )}

        {stage === "code" && (
          <div className="relative mt-3 space-y-3">
            {HoneypotField}
            <p className="text-sm text-muted-foreground">
              Enviamos um código de 6 dígitos para{" "}
              <strong className="text-foreground">{maskedEmail || email}</strong>. Digite abaixo
              para desbloquear.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="______"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-brand"
            />
            {err && <p className="text-sm text-red-500">{err}</p>}
            {pending && <p className="text-xs text-muted-foreground">Confirmando…</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                onClick={() => sendCode(email)}
                disabled={pending}
                className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
              >
                Não recebeu? Reenviar
              </button>
              <button
                onClick={() => setCorrecting((v) => !v)}
                disabled={pending}
                className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
              >
                Corrigir e-mail
              </button>
            </div>

            {correcting && (
              <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                <label className="block text-xs font-medium text-muted-foreground">
                  Qual é o e-mail certo?
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-1 px-4 py-2.5 text-sm outline-none focus:border-brand"
                />
                <button
                  onClick={() => {
                    const em = newEmail.trim().toLowerCase();
                    if (!EMAIL_RE.test(em)) {
                      setErr("Digite um e-mail válido.");
                      return;
                    }
                    sendCode(em, email);
                  }}
                  disabled={pending}
                  className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  Enviar código para o novo e-mail →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pressure release */}
      <p className="text-center text-xs text-muted-foreground">
        Seu resultado é seu. Confirmar o e-mail só libera o plano personalizado e a demonstração
        de flashcards.
      </p>
    </div>
  );
}
