"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { safe } from "@/lib/sanitize";
import { saveFlashcardsProgress } from "@/actions/magnet";
import type { MagnetFlashcard } from "@/lib/magnet/flashcards";

// The post-magic-link study session for /flashcards-revalida/acesso. Flip + self-
// assess the 50 weighted cards (tracking is session-local — no account yet), then a
// rich reward: an end-of-deck report (per-subject breakdown), an auto study guide
// (what to prioritize), a platform screenshot + sales CTA, and "estudar novamente".
// Mirrors MagnetFlashcards' flip visuals; the reward is bespoke to this funnel.

export type SessionOffer = {
  cohortName: string;
  priceLabel: string;
  compareAtLabel: string | null;
  couponCode: string | null;
  couponPercent: number | null;
  checkoutUrl: string;
};

type Result = "correct" | "incorrect";

function htmlProps(html: string): React.HTMLAttributes<HTMLDivElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

export function FlashcardsSession({
  cards,
  firstName,
  cohortLabel,
  offer,
  storeCoupon,
  token,
  initialProgress,
  initialCompleted = false,
}: {
  cards: MagnetFlashcard[];
  firstName: string | null;
  cohortLabel: string;
  offer: SessionOffer | null;
  // Shown when there's no single-turma offer (undecided lead): a general all-turma
  // coupon + a link to the store to pick a turma.
  storeCoupon?: { code: string; percent: number; url: string } | null;
  // Magic-link token (leads.result_token) — auth for the progress-save action.
  token: string;
  // Saved progress ({ "<cardId>": "correct"|"incorrect" }) so the same link resumes.
  initialProgress?: Record<string, Result>;
  initialCompleted?: boolean;
}) {
  // Compute resume state ONCE at mount from the saved progress (ignore stale card
  // ids no longer in the deck; start at the first unanswered card).
  const [resume] = useState(() => {
    const ids = new Set(cards.map((c) => c.id));
    const r: Record<number, Result> = {};
    for (const [k, v] of Object.entries(initialProgress ?? {})) {
      const id = Number(k);
      if (ids.has(id) && (v === "correct" || v === "incorrect")) r[id] = v;
    }
    const firstUnanswered = cards.findIndex((c) => !(c.id in r));
    const allAnswered = firstUnanswered === -1 && cards.length > 0;
    return { results: r, startIdx: allAnswered ? 0 : Math.max(0, firstUnanswered), allAnswered };
  });

  const [idx, setIdx] = useState(resume.startIdx);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, Result>>(resume.results);
  const [done, setDone] = useState(initialCompleted || resume.allAnswered);
  const resumedFromSave = Object.keys(resume.results).length > 0 && !initialCompleted && !resume.allAnswered;

  const card = cards[idx];
  const isLast = idx === cards.length - 1;
  const answeredCount = Object.keys(results).length;
  const correctCount = Object.values(results).filter((r) => r === "correct").length;

  // ── Debounced, best-effort progress persistence (fire-and-forget) ─────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (next: Record<number, Result>, isDone: boolean) => {
      if (!token) return;
      const answered: Record<string, Result> = {};
      for (const [id, r] of Object.entries(next)) answered[id] = r;
      void saveFlashcardsProgress({ token, answered, done: isDone });
    },
    [token],
  );
  const scheduleSave = useCallback(
    (next: Record<number, Result>, isDone: boolean) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (isDone) {
        persist(next, true); // flush the completion immediately
        return;
      }
      saveTimer.current = setTimeout(() => persist(next, false), 1500);
    },
    [persist],
  );
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const answer = useCallback(
    (result: Result) => {
      if (!card) return;
      const next = { ...results, [card.id]: result };
      setResults(next);
      scheduleSave(next, isLast);
      if (isLast) setDone(true);
      else {
        setIdx((i) => i + 1);
        setFlipped(false);
      }
    },
    [card, isLast, results, scheduleSave],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
      } else if (e.code === "ArrowLeft" && flipped) answer("incorrect");
      else if (e.code === "ArrowRight" && flipped) answer("correct");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, done, answer]);

  function restart() {
    // Local re-study only — we don't persist the reset (fc_completed_at stays set).
    setResults({});
    setIdx(0);
    setFlipped(false);
    setDone(false);
  }

  // Per-subject breakdown from the session results (grouped by specialtyName).
  const bySubject = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const c of cards) {
      const name = c.specialtyName ?? "Outros";
      const r = results[c.id];
      if (!r) continue;
      const cur = map.get(name) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (r === "correct") cur.correct += 1;
      map.set(name, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, missed: v.total - v.correct }))
      .sort((a, b) => b.missed - a.missed || b.total - a.total);
  }, [cards, results]);

  const prioritize = bySubject.filter((s) => s.missed > 0).slice(0, 3);

  if (cards.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 text-center text-muted-foreground">
        Baralho em preparação. Tente novamente em instantes.
      </div>
    );
  }

  // ── Reward ────────────────────────────────────────────────────────────────────
  if (done) {
    const pct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
          {/* Report */}
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-wider text-brand">Fim do baralho</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              {firstName ? `Mandou bem, ${firstName}!` : "Mandou bem!"}
            </h1>
            <div className="mt-5 inline-flex items-baseline gap-1.5 rounded-2xl border border-border bg-surface-1 px-6 py-4">
              <span className="font-display text-5xl font-extrabold tabular-nums text-brand">{correctCount}</span>
              <span className="text-xl text-muted-foreground">/{answeredCount}</span>
              <span className="ml-2 self-center rounded-full bg-brand-muted/50 px-2.5 py-1 text-xs font-semibold text-brand">
                {pct}% lembrados
              </span>
            </div>
          </div>

          {/* Per-subject breakdown */}
          {bySubject.length > 0 && (
            <div className="mt-8 rounded-2xl border border-border bg-surface-1/50 p-5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Seu desempenho por área
              </p>
              <div className="mt-3 space-y-2.5">
                {bySubject.map((s) => {
                  const rate = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
                  return (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-sm text-foreground sm:w-36">{s.name}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={`h-full rounded-full ${rate >= 70 ? "bg-emerald-500" : rate >= 40 ? "bg-brand" : "bg-amber-500"}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {s.correct}/{s.total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto study guide */}
          <div className="mt-6 rounded-2xl border border-brand/25 bg-brand-muted/10 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-brand">Seu mini plano</p>
            {prioritize.length > 0 ? (
              <p className="mt-2 text-sm text-foreground">
                Comece revisando{" "}
                <strong>{prioritize.map((s) => s.name).join(", ")}</strong> — foi onde você mais
                escorregou. A revisão espaçada traz esses cards de volta amanhã e vai espaçando conforme
                você acerta.
              </p>
            ) : (
              <p className="mt-2 text-sm text-foreground">
                Você lembrou de tudo neste baralho. O próximo passo é <strong>manter</strong>: a revisão
                espaçada devolve cada card no intervalo certo pra não esquecer até a prova.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {[1, 6, 15, 38].map((d, i, arr) => (
                <span key={d} className="flex items-center gap-1.5">
                  <span className="rounded-md bg-surface-1 px-2 py-1 text-[11px] font-semibold tabular-nums text-foreground ring-1 ring-border">
                    {d}d
                  </span>
                  {i < arr.length - 1 && <span aria-hidden className="text-muted-foreground">→</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Platform screenshot + sales */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface-1">
            <div className="border-b border-border/60 p-5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
                Isto foi só uma amostra
              </p>
              <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
                A plataforma completa do Revalida
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Milhares de flashcards, questões comentadas de provas anteriores, resumos, MedVoice e um
                plano de estudos que se ajusta até a data da sua prova — tudo com revisão espaçada.
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/desktop/painel.webp"
              alt="Painel da plataforma MedHelpSpace"
              className="w-full border-b border-border/60 bg-surface-2 object-cover"
              loading="lazy"
            />
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
            </div>
          </div>

          {/* Retry */}
          <button
            type="button"
            onClick={restart}
            className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-border bg-surface-1 px-6 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand-muted/20"
          >
            ↻ Estudar os 50 flashcards novamente
          </button>
        </div>
      </div>
    );
  }

  // ── Study session ───────────────────────────────────────────────────────────
  if (!card) return null;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-5 py-8 sm:py-10">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold tracking-tight">
            MedHelp<span className="text-brand">Space</span>
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {correctCount}/{answeredCount} lembrados
          </span>
        </div>

        {/* Resume banner — shown when they came back to saved progress. */}
        {resumedFromSave && (
          <div className="mb-4 rounded-xl border border-brand/25 bg-brand-muted/15 px-4 py-2.5 text-sm text-foreground">
            👋 Bem-vindo de volta! Continuando de onde você parou —{" "}
            <strong>{Object.keys(resume.results).length} de {cards.length}</strong> já respondidos.
          </div>
        )}

        {/* Progress */}
        <div className="mb-4 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Card {idx + 1} de {cards.length}
              {card.specialtyName && (
                <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium">
                  {card.specialtyName}
                </span>
              )}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand transition-all duration-300"
              style={{ width: `${(idx / cards.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Flip card */}
        <div style={{ perspective: "1400px" }}>
          <div
            key={card.id}
            className="relative w-full rounded-2xl"
            style={{
              minHeight: "15rem",
              transformStyle: "preserve-3d",
              transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
            onClick={() => !flipped && setFlipped(true)}
          >
            <div
              className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface-1 p-6 text-center transition-colors hover:border-brand/40"
              style={{ backfaceVisibility: "hidden" }}
            >
              {/* Subject leads so a card never reads out of context. */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {card.specialtyName && (
                  <span className="rounded-full bg-brand-muted/60 px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                    {card.specialtyName}
                  </span>
                )}
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Pergunta</span>
              </div>
              {card.image_url && (
                <div className="w-full overflow-hidden rounded border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.image_url} alt="" className="max-h-40 w-full bg-white object-contain dark:bg-neutral-100" />
                </div>
              )}
              <div
                className="prose-content text-foreground [&_p]:mb-2 [&_strong]:font-semibold"
                {...htmlProps(safe(card.text))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Toque para ver · <kbd className="font-sans">Espaço</kbd>
              </p>
            </div>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-brand/30 bg-surface-1 p-6 text-center"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <div className="flex flex-wrap items-center justify-center gap-2">
                {card.specialtyName && (
                  <span className="rounded-full bg-brand-muted/60 px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                    {card.specialtyName}
                  </span>
                )}
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Resposta</span>
              </div>
              <div
                className="prose-content text-foreground [&_p]:mb-2 [&_strong]:font-semibold"
                {...htmlProps(safe(card.answer))}
              />
              {card.tip && (
                <p className="mt-1 w-full border-t border-border pt-2 text-center text-xs italic text-muted-foreground">
                  {card.tip}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Self-assessment */}
        {flipped && (
          <>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => answer("incorrect")}
                className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/10 px-4 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
              >
                ← Errei
              </button>
              <button
                onClick={() => answer("correct")}
                className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-green-500/40 bg-green-500/10 px-4 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
              >
                Acertei →
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">← / → para responder com o teclado</p>
          </>
        )}

        {/* Same-link reassurance — progress is saved automatically. */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          💾 Seu progresso fica salvo. Pode fechar quando quiser — o mesmo link do e-mail te traz de volta.
        </p>
      </div>
    </div>
  );
}
