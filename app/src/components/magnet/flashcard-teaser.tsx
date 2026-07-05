"use client";

import { useState } from "react";
import { safe } from "@/lib/sanitize";
import type { MagnetFlashcard } from "@/lib/magnet/flashcards";

// A single real flashcard, flippable on tap, for the landing teaser. No assessment,
// no DB — pure "veja um card de verdade" desire-builder. Tap to flip; arrows cycle
// through the handful of preview cards. Mirrors the flip visuals of MagnetFlashcards
// for brand consistency.

function htmlProps(html: string): React.HTMLAttributes<HTMLDivElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

export function FlashcardTeaser({ cards }: { cards: MagnetFlashcard[] }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (cards.length === 0) return null;
  const card = cards[idx % cards.length];

  function go(delta: number) {
    setFlipped(false);
    // brief delay so the card faces front before swapping content
    setTimeout(() => setIdx((i) => (i + delta + cards.length) % cards.length), 120);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Amostra · card {(idx % cards.length) + 1}/{cards.length}
        </span>
        {card.specialtyName && (
          <span className="rounded-full bg-brand-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-brand">
            {card.specialtyName}
          </span>
        )}
      </div>

      <div style={{ perspective: "1400px" }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={flipped ? "Ver frente do card" : "Ver resposta do card"}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          className="relative w-full cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand"
          style={{
            minHeight: "13rem",
            transformStyle: "preserve-3d",
            transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface-1 p-6 text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-brand">Pergunta</span>
            <div
              className="prose-content text-[15px] leading-relaxed text-foreground [&_strong]:font-semibold"
              {...htmlProps(safe(card.text))}
            />
            <span className="mt-1 text-xs text-muted-foreground">Toque para ver a resposta →</span>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-brand/40 bg-gradient-to-b from-surface-1 to-brand-muted/20 p-6 text-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-brand">Resposta</span>
            <div
              className="prose-content text-[15px] leading-relaxed text-foreground [&_strong]:font-semibold"
              {...htmlProps(safe(card.answer))}
            />
          </div>
        </div>
      </div>

      {cards.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Card anterior"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
          >
            ←
          </button>
          <div className="flex gap-1.5">
            {cards.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === idx % cards.length ? "bg-brand" : "bg-surface-2"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próximo card"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
