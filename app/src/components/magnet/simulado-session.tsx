"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { safe } from "@/lib/sanitize";
import { saveSimuladoProgress, trackLeadEvent } from "@/actions/magnet";
import { PlatformPeek } from "@/components/magnet/platform-peek";
import { SiteText } from "@/components/landing/site-text";
import type { SessionOffer } from "@/components/magnet/flashcards-session";
import type { SimuladoQuestion, SimuladoProgress } from "@/lib/magnet/simulado";

// The post-magic-link 100-question simulado for /simulado-revalida/acesso.
// 5 blocos of 20 by grande área; one question at a time; immediate short feedback
// (right/wrong + gabarito — the full comentário is the member-gated upsell); every
// answer persists via saveSimuladoProgress so the SAME link resumes at the next
// unanswered question. Ends in the diagnostic report: score /100, per-área bars,
// locked-comentários teaser, platform pitch + turma offer. Mirrors
// FlashcardsSession's persistence + reward discipline.

function htmlProps(html: string): React.HTMLAttributes<HTMLDivElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

type Bloco = {
  key: string;
  label: string;
  start: number; // index of its first question in `questions`
  size: number;
};

export function SimuladoSession({
  questions,
  firstName,
  cohortLabel,
  offer,
  storeCoupon,
  token,
  initialProgress,
  initialCompleted = false,
}: {
  questions: SimuladoQuestion[];
  firstName: string | null;
  cohortLabel: string;
  offer: SessionOffer | null;
  storeCoupon?: { code: string; percent: number; url: string } | null;
  // Magic-link token (leads.result_token) — auth for the progress-save action.
  token: string;
  // Saved progress so the same link resumes at the next unanswered question.
  initialProgress?: SimuladoProgress;
  initialCompleted?: boolean;
}) {
  const blocos = useMemo<Bloco[]>(() => {
    const out: Bloco[] = [];
    questions.forEach((q, i) => {
      const last = out[out.length - 1];
      if (!last || last.key !== q.blocoKey) out.push({ key: q.blocoKey, label: q.blocoLabel, start: i, size: 1 });
      else last.size++;
    });
    return out;
  }, [questions]);

  // Resume state, computed ONCE at mount: keep only answers for ids still in the
  // set; start at the first unanswered question.
  const [resume] = useState(() => {
    const ids = new Set(questions.map((q) => q.id));
    const r: SimuladoProgress = {};
    for (const [k, v] of Object.entries(initialProgress ?? {})) {
      if (ids.has(Number(k)) && typeof v?.a === "number" && typeof v?.c === "boolean") r[k] = v;
    }
    const firstUnanswered = questions.findIndex((q) => !(String(q.id) in r));
    const allAnswered = firstUnanswered === -1 && questions.length > 0;
    return { progress: r, startIdx: allAnswered ? 0 : Math.max(0, firstUnanswered), allAnswered };
  });

  const [idx, setIdx] = useState(resume.startIdx);
  const [progress, setProgress] = useState<SimuladoProgress>(resume.progress);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(initialCompleted || resume.allAnswered);
  // Bloco intro interstitials: shown once per bloco, before its first question.
  // Blocos with any saved answer are pre-marked seen so a resume lands on the question.
  const [introSeen, setIntroSeen] = useState<Set<string>>(() => {
    const seen = new Set<string>();
    for (const b of blocos) {
      for (let i = b.start; i < b.start + b.size; i++) {
        if (String(questions[i].id) in resume.progress) {
          seen.add(b.key);
          break;
        }
      }
    }
    return seen;
  });
  const resumedFromSave = Object.keys(resume.progress).length > 0 && !initialCompleted && !resume.allAnswered;

  const question = questions[idx];
  const answeredCount = Object.keys(progress).length;
  const correctCount = Object.values(progress).filter((p) => p.c).length;
  const bloco = useMemo(
    () => blocos.find((b) => idx >= b.start && idx < b.start + b.size) ?? blocos[0],
    [blocos, idx],
  );

  // ── Debounced, best-effort progress persistence (fire-and-forget) ─────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (next: SimuladoProgress, isDone: boolean) => {
      if (!token) return;
      void saveSimuladoProgress({ token, answered: next, done: isDone });
    },
    [token],
  );
  const scheduleSave = useCallback(
    (next: SimuladoProgress, isDone: boolean) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (isDone) {
        persist(next, true); // flush the completion immediately
        return;
      }
      saveTimer.current = setTimeout(() => persist(next, false), 1200);
    },
    [persist],
  );
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const choose = useCallback(
    (answerIdx: number) => {
      if (!question || revealed) return;
      const isCorrect = Boolean(question.answers[answerIdx]?.correct);
      const next = { ...progress, [String(question.id)]: { a: answerIdx, c: isCorrect } };
      setProgress(next);
      setRevealed(true);
      scheduleSave(next, Object.keys(next).length >= questions.length);
    },
    [question, revealed, progress, questions.length, scheduleSave],
  );

  const advance = useCallback(() => {
    if (answeredCount >= questions.length) {
      setDone(true);
      return;
    }
    setRevealed(false);
    setIdx((i) => Math.min(i + 1, questions.length - 1));
  }, [answeredCount, questions.length]);

  // Per-área breakdown for the report (client-recomputed from local progress —
  // matches what the finalize save wrote server-side).
  const byArea = useMemo(() => {
    return blocos.map((b) => {
      let correct = 0;
      let answered = 0;
      for (let i = b.start; i < b.start + b.size; i++) {
        const p = progress[String(questions[i].id)];
        if (!p) continue;
        answered++;
        if (p.c) correct++;
      }
      return { key: b.key, label: b.label, correct, answered, total: b.size };
    });
  }, [blocos, questions, progress]);

  if (questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 text-center text-muted-foreground">
        Simulado em preparação. Tente novamente em instantes.
      </div>
    );
  }

  // ── Diagnostic report ─────────────────────────────────────────────────────────
  if (done) {
    const pct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    const weakest = [...byArea]
      .filter((a) => a.answered > 0)
      .sort((a, b) => a.correct / Math.max(1, a.answered) - b.correct / Math.max(1, b.answered))
      .slice(0, 2);
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
          {/* Score header */}
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-wider text-brand">
              <SiteText as="span" k="sim.report.eyebrow" fallback="Seu relatório de desempenho" />
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              {firstName ? `Simulado concluído, ${firstName}!` : "Simulado concluído!"}
            </h1>
            <div className="mt-5 inline-flex items-baseline gap-1.5 rounded-2xl border border-border bg-surface-1 px-6 py-4">
              <span className="font-display text-5xl font-extrabold tabular-nums text-brand">{correctCount}</span>
              <span className="text-xl text-muted-foreground">/{answeredCount}</span>
              <span className="ml-2 self-center rounded-full bg-brand-muted/50 px-2.5 py-1 text-xs font-semibold text-brand">
                {pct}% de acerto
              </span>
            </div>
            <p className="mx-auto mt-3 max-w-md text-xs text-muted-foreground">
              <SiteText
                as="span"
                multiline
                k="sim.report.context"
                fallback="Todas as questões são de provas reais do Revalida (INEP, 2020–2025). Seu desempenho aqui é o retrato mais honesto da sua distância até a aprovação."
              />
            </p>
          </div>

          {/* Per-área breakdown */}
          <div className="mt-8 rounded-2xl border border-border bg-surface-1/50 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <SiteText as="span" k="sim.report.areas_label" fallback="Desempenho por grande área" />
            </p>
            <div className="mt-3 space-y-2.5">
              {byArea.map((a) => {
                const rate = a.answered > 0 ? Math.round((a.correct / a.answered) * 100) : 0;
                return (
                  <div key={a.key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm text-foreground sm:w-44">{a.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={`h-full rounded-full ${rate >= 70 ? "bg-emerald-500" : rate >= 40 ? "bg-brand" : "bg-amber-500"}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {a.correct}/{a.answered}
                    </span>
                  </div>
                );
              })}
            </div>
            {weakest.length > 0 && (
              <p className="mt-4 border-t border-border/60 pt-3 text-sm text-foreground">
                <SiteText as="span" k="sim.report.priority_prefix" fallback="Prioridade de estudo:" />{" "}
                <strong>{weakest.map((a) => a.label).join(" e ")}</strong>{" "}
                <SiteText
                  as="span"
                  k="sim.report.priority_suffix"
                  fallback="— foi onde você deixou mais pontos na mesa."
                />
              </p>
            )}
          </div>

          {/* Locked comentários — the member-gated layer of THESE 100 questions. */}
          <div className="mt-6 rounded-2xl border border-brand/25 bg-brand-muted/10 p-5">
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-0.5 text-xl">🔒</span>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
                  <SiteText as="span" k="sim.report.locked_eyebrow" fallback="Comentários completos" />
                </p>
                <p className="mt-1.5 text-sm text-foreground">
                  <SiteText
                    as="span"
                    multiline
                    k="sim.report.locked_body"
                    fallback="Cada uma dessas 100 questões tem um comentário completo na plataforma: por que a resposta certa está certa, por que cada alternativa erra, e o que a banca queria testar. É assim que um erro vira ponto na próxima prova."
                  />
                </p>
              </div>
            </div>
          </div>

          {/* Platform pitch + offer */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface-1">
            <div className="border-b border-border/60 p-5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
                <SiteText as="span" k="sim.report.pitch_eyebrow" fallback="O próximo passo" />
              </p>
              <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
                <SiteText as="span" k="sim.report.pitch_title" fallback="Transforme esse diagnóstico em aprovação" />
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                <SiteText
                  as="span"
                  multiline
                  k="sim.report.pitch_body"
                  fallback="A plataforma completa tem milhares de questões comentadas, simulados no padrão da banca, flashcards e AudioCards com revisão espaçada, resumos, MedVoice e um plano de estudos que prioriza exatamente as áreas onde você mais errou — ajustado até a data da sua prova."
                />
              </p>
            </div>
            <div className="border-b border-border/60 p-5">
              <PlatformPeek showDeviceToggle />
            </div>
            <div className="p-5">
              {offer ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm text-muted-foreground">{offer.cohortName} ·</span>
                    {offer.compareAtLabel && (
                      <span className="text-sm text-muted-foreground line-through">{offer.compareAtLabel}</span>
                    )}
                    <span className="font-display text-2xl font-bold text-foreground">{offer.priceLabel}</span>
                  </div>
                  {offer.couponCode && offer.couponPercent && (
                    <p className="mt-1.5 text-sm text-brand">
                      Cupom de boas-vindas{" "}
                      <strong className="rounded bg-brand-muted/50 px-1.5 py-0.5 font-mono">{offer.couponCode}</strong>{" "}
                      — {offer.couponPercent}% de desconto para a {cohortLabel}.
                    </p>
                  )}
                  <a
                    href={offer.checkoutUrl}
                    className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-opacity hover:opacity-95"
                  >
                    Garantir minha vaga com {offer.couponPercent ? `${offer.couponPercent}% OFF` : "desconto"} →
                  </a>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Acesso imediato · Pix ou cartão · 7 dias de garantia
                  </p>
                </>
              ) : storeCoupon ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Você escolhe a turma quando quiser — e leva um desconto de boas-vindas.
                  </p>
                  <p className="mt-1.5 text-sm text-brand">
                    Cupom{" "}
                    <strong className="rounded bg-brand-muted/50 px-1.5 py-0.5 font-mono">{storeCoupon.code}</strong>{" "}
                    — {storeCoupon.percent}% de desconto em qualquer turma.
                  </p>
                  <a
                    href={storeCoupon.url}
                    className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-opacity hover:opacity-95"
                  >
                    Ver turmas com {storeCoupon.percent}% OFF →
                  </a>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Acesso imediato · Pix ou cartão · 7 dias de garantia
                  </p>
                </>
              ) : (
                <Link
                  href="/loja"
                  className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg transition-opacity hover:opacity-95"
                >
                  Conhecer a plataforma completa →
                </Link>
              )}

              {/* Secondary escape valve for the info-seeker half (mirrors the flashcards
                  reward). New tab keeps the offer alive behind them; UTM-tagged for GA4;
                  per-lead event feeds the /admin/leads activity drawer. */}
              <a
                href="/?utm_source=sim-reward&utm_medium=funnel&utm_campaign=ver-todos-recursos"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  void trackLeadEvent({ token, event: "clicked_ver_recursos" });
                }}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-1 px-5 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-surface-2"
              >
                Ver todos os recursos da plataforma →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Bloco intro interstitial ──────────────────────────────────────────────────
  if (question && idx === bloco.start && !introSeen.has(bloco.key) && !revealed) {
    const blocoNumber = blocos.findIndex((b) => b.key === bloco.key) + 1;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <div className="w-full max-w-md text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-brand">
            Bloco {blocoNumber} de {blocos.length}
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">{bloco.label}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            <SiteText
              as="span"
              multiline
              k="sim.session.bloco_intro"
              fallback="{n} questões reais do Revalida. Responda no seu ritmo — seu progresso fica salvo a cada resposta e você pode voltar pelo mesmo link."
              vars={{ n: bloco.size }}
            />
          </p>
          {answeredCount > 0 && (
            <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
              {answeredCount}/{questions.length} respondidas até aqui · {correctCount} certas
            </p>
          )}
          <button
            type="button"
            onClick={() => setIntroSeen((s) => new Set(s).add(bloco.key))}
            className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-all hover:opacity-95 active:scale-[0.99]"
          >
            {blocoNumber === 1 ? "Começar o simulado →" : `Começar ${bloco.label} →`}
          </button>
        </div>
      </div>
    );
  }

  // ── Question view ─────────────────────────────────────────────────────────────
  if (!question) return null;
  const chosen = progress[String(question.id)];
  const questionInBloco = idx - bloco.start + 1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold tracking-tight">
            MedHelp<span className="text-brand">Space</span>
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {answeredCount}/{questions.length} · {correctCount} certas
          </span>
        </div>

        {/* Resume banner — shown when they came back to saved progress. */}
        {resumedFromSave && idx === resume.startIdx && !revealed && (
          <div className="mb-4 rounded-xl border border-brand/25 bg-brand-muted/15 px-4 py-2.5 text-sm text-foreground">
            👋 Bem-vindo de volta! Continuando de onde você parou —{" "}
            <strong>
              {Object.keys(resume.progress).length} de {questions.length}
            </strong>{" "}
            já respondidas.
          </div>
        )}

        {/* Progress */}
        <div className="mb-5 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium">{bloco.label}</span>
              <span className="ml-1.5">
                Questão {questionInBloco} de {bloco.size}
              </span>
            </span>
            <span className="tabular-nums">{idx + 1}/100</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand transition-all duration-300"
              style={{ width: `${(answeredCount / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Enunciado (real INEP question — the "Questão NN · Revalida 20xx" header is
            part of the migrated HTML and stays: it IS the authenticity proof). */}
        <div className="rounded-2xl border border-border bg-surface-1 p-5 sm:p-6">
          {question.media_url && (
            <div className="mb-4 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={question.media_url}
                alt=""
                className="max-h-72 w-full bg-white object-contain dark:bg-neutral-100"
              />
            </div>
          )}
          <div
            className="prose-content text-[15px] leading-relaxed text-foreground [&_h3]:mb-3 [&_h3]:text-xs [&_h3]:font-mono [&_h3]:uppercase [&_h3]:tracking-wider [&_h3]:text-brand [&_p]:mb-3"
            {...htmlProps(safe(question.question))}
          />
        </div>

        {/* Alternatives */}
        <div className="mt-4 space-y-2.5">
          {question.answers.map((a, i) => {
            const isChosen = chosen?.a === i;
            const showCorrect = revealed && a.correct;
            const showWrong = revealed && isChosen && !a.correct;
            return (
              <button
                key={i}
                type="button"
                disabled={revealed}
                onClick={() => choose(i)}
                className={`flex min-h-[52px] w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  showCorrect
                    ? "border-green-500/60 bg-green-500/10"
                    : showWrong
                      ? "border-red-500/60 bg-red-500/10"
                      : revealed
                        ? "border-border bg-surface-1 opacity-60"
                        : "border-border bg-surface-1 hover:border-brand hover:bg-brand-muted/20"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    showCorrect
                      ? "bg-green-500 text-white"
                      : showWrong
                        ? "bg-red-500 text-white"
                        : "bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {LETTERS[i] ?? "?"}
                </span>
                <span
                  className="prose-content flex-1 text-sm leading-snug text-foreground [&_p]:m-0"
                  {...htmlProps(safe(a.text))}
                />
              </button>
            );
          })}
        </div>

        {/* Short feedback + advance. Full comentário stays member-gated. */}
        {revealed && (
          <div className="mt-4">
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                chosen?.c
                  ? "border-green-500/40 bg-green-500/10 text-green-400"
                  : "border-red-500/40 bg-red-500/10 text-red-400"
              }`}
            >
              {chosen?.c ? (
                <SiteText as="span" k="sim.session.feedback_correct" fallback="✓ Você acertou." />
              ) : (
                <SiteText
                  as="span"
                  k="sim.session.feedback_wrong"
                  fallback="✗ Não foi dessa vez — o gabarito está marcado em verde."
                />
              )}
              <span className="mt-1 block text-xs text-muted-foreground">
                🔒{" "}
                <SiteText
                  as="span"
                  k="sim.session.locked_note"
                  fallback="O comentário completo desta questão está disponível na plataforma."
                />
              </span>
            </div>
            <button
              type="button"
              onClick={advance}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-all hover:opacity-95 active:scale-[0.99]"
            >
              {answeredCount >= questions.length ? "Ver meu relatório →" : "Próxima questão →"}
            </button>
          </div>
        )}

        {/* Same-link reassurance — progress is saved automatically. */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          💾{" "}
          <SiteText
            as="span"
            k="sim.session.resume_note"
            fallback="Seu progresso fica salvo a cada resposta. Pode fechar quando quiser — o mesmo link do e-mail te traz de volta."
          />
        </p>
      </div>
    </div>
  );
}
