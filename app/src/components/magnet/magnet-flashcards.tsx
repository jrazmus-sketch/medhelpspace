"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { safe } from "@/lib/sanitize";
import type { MagnetFlashcard } from "@/lib/magnet/flashcards";

// Lightweight, anonymous flashcard deck for the public funnel — mirrors the
// flip + "Errei/Acertei" + keyboard mechanic of the member FlashcardPlayer, but
// with NO DB writes, NO SM-2, and NO inline admin editing (same way MagnetQuiz
// strips down the member QuizPlayer). Used by /flashcards-gratis (full deck) and
// the magnet results view (a short, compact taste).

// Spread-via-helper workaround for the dangerouslySetInnerHTML security hook
// (see components/admin/editable-text.tsx + magnet-quiz.tsx).
function htmlProps(html: string): React.HTMLAttributes<HTMLDivElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

type Result = "correct" | "incorrect";

// Truthful spaced-repetition ladder — mirrors the member app's real SM-2 intervals
// (lib/review/sm2.ts): a card you keep getting right returns in 1 → 6 → 15 → 38
// days (ease 2.5), then all but disappears; a single miss sends it back to
// tomorrow and the ladder restarts. We SHOW the system instead of only naming it.
// FREE-FUNNEL-V2-SCOPE.md item 7 (kept honest: the real first interval is 1 day,
// not 6 — the value is the EXPANDING spacing, so that's what we visualize).
const SPACING_LADDER = [1, 6, 15, 38];

function SpacingLadder() {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand-muted/50 p-4 text-left">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">
        Como a revisão espaçada trabalha por você
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {SPACING_LADDER.map((d, i) => (
          <span key={d} className="flex items-center gap-1.5">
            <span className="rounded-md bg-surface-1 px-2 py-1 text-xs font-semibold tabular-nums text-foreground ring-1 ring-border">
              {d} {d === 1 ? "dia" : "dias"}
            </span>
            {i < SPACING_LADDER.length - 1 && (
              <span aria-hidden className="text-muted-foreground">→</span>
            )}
          </span>
        ))}
        <span aria-hidden className="text-muted-foreground">→</span>
        <span className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground">
          …e some do seu caminho
        </span>
      </div>
      <p className="mt-3 text-xs leading-snug text-muted-foreground">
        Acertando sempre, cada card volta em intervalos cada vez maiores.{" "}
        <strong className="text-foreground">Errou uma vez?</strong> Ele volta amanhã e
        recomeça a subir — o sistema garante que você não esquece na hora da prova.
      </p>
    </div>
  );
}

export function MagnetFlashcards({
  cards,
  compact = false,
  ctaHref,
  ctaLabel,
  doneTitle,
  doneNote,
  spacingViz = false,
}: {
  cards: MagnetFlashcard[];
  /** Tighter spacing + smaller summary for the inline results taste. */
  compact?: boolean;
  /** Forward CTA shown on the deck-done summary. */
  ctaHref?: string;
  ctaLabel?: string;
  doneTitle?: string;
  doneNote?: string;
  /** Show the truthful SM-2 spacing ladder on the done summary (reward payoff). */
  spacingViz?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [done, setDone] = useState(false);

  const card = cards[idx];
  const isLast = idx === cards.length - 1;
  const correctCount = Object.values(results).filter((r) => r === "correct").length;
  const answeredCount = Object.keys(results).length;

  const answer = useCallback(
    (result: Result) => {
      if (!card) return;
      setResults((prev) => ({ ...prev, [card.id]: result }));
      if (isLast) {
        setDone(true);
      } else {
        setIdx((i) => i + 1);
        setFlipped(false);
      }
    },
    [card, isLast],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
      } else if (e.code === "ArrowLeft" && flipped) {
        answer("incorrect");
      } else if (e.code === "ArrowRight" && flipped) {
        answer("correct");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, done, answer]);

  if (cards.length === 0) return null;

  // ── Deck-done summary ─────────────────────────────────────────────────────────
  if (done) {
    const pct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    return (
      <div className={compact ? "space-y-3" : "mx-auto max-w-xl space-y-5"}>
        <div className="rounded-2xl border border-border bg-surface-1 p-6 text-center">
          {doneTitle && (
            <p className="text-sm font-semibold text-foreground">{doneTitle}</p>
          )}
          <div className={`${doneTitle ? "mt-2 " : ""}text-4xl font-bold tabular-nums text-brand`}>
            {correctCount}
            <span className="text-xl font-normal text-muted-foreground">/{answeredCount}</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            que você lembrou ({pct}%)
          </div>
          {spacingViz ? (
            <div className="mx-auto mt-4 max-w-sm">
              <SpacingLadder />
            </div>
          ) : (
            <p className="mx-auto mt-3 max-w-sm text-xs leading-snug text-muted-foreground">
              É assim que a revisão espaçada funciona: o sistema traz de volta exatamente o
              que você errou, no intervalo certo para fixar.
            </p>
          )}
          {doneNote && (
            <p className="mx-auto mt-3 max-w-sm text-xs font-medium text-foreground">{doneNote}</p>
          )}
          {ctaHref && ctaLabel && (
            <Link
              href={ctaHref}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className={compact ? "space-y-4" : "mx-auto max-w-xl space-y-5"}>
      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Card {idx + 1} de {cards.length}
            {card.specialtyName && (
              <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {card.specialtyName}
              </span>
            )}
          </span>
          <span>
            {correctCount}/{answeredCount} lembrados
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${(idx / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Flip card — CSS 3D transform (matches the member FlashcardPlayer) */}
      <div style={{ perspective: "1200px" }}>
        <div
          key={card.id}
          className="relative w-full rounded-xl"
          style={{
            minHeight: compact ? "11rem" : "13rem",
            transformStyle: "preserve-3d",
            transition: "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
          onClick={() => {
            if (!flipped) setFlipped(true);
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface-1 p-6 text-center transition-colors hover:border-brand/40 hover:bg-surface-2"
            style={{ backfaceVisibility: "hidden" }}
          >
            {card.image_url && (
              <div className="w-full overflow-hidden rounded border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.image_url}
                  alt=""
                  className="max-h-40 w-full bg-white object-contain dark:bg-neutral-100"
                />
              </div>
            )}
            <div
              className="prose-content text-foreground [&_p]:mb-2 [&_strong]:font-semibold"
              {...htmlProps(safe(card.text))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Clique para ver · <kbd className="font-sans">Espaço</kbd>
            </p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-xl border border-brand/30 bg-surface-1 p-6 text-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
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
          <div className="flex gap-3">
            <button
              onClick={() => answer("incorrect")}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400"
            >
              ← Errei
            </button>
            <button
              onClick={() => answer("correct")}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-600 transition-colors hover:bg-green-500/20 dark:text-green-400"
            >
              Acertei →
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            ← / → para responder com o teclado
          </p>
        </>
      )}
    </div>
  );
}
