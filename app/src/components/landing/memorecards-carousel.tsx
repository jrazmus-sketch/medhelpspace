"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ════════════════════════════════════════════════════════════════════════════
   MemoreCards device — the interactive body of System-showcase row 04.
   Unlike the other rows (a single static app screenshot), this renders an
   in-app "MemoreCard viewer" screen inside the same phone frame: a slim header,
   the card full-bleed at its true 4:5, a per-card "grito da prova" strip, and
   swipe controls. Solves the 4:5-card-in-a-tall-phone problem by filling the
   extra vertical space with real app chrome. Primary control on touch is the
   native scroll-snap swipe; arrows serve desktop click-through; dots indicate
   position. Doubles as the visual spec for the not-yet-built MemoreCards page.
   ════════════════════════════════════════════════════════════════════════════ */

type Card = { src: string; title: string; specialty: string; grito: string };

// 6 teaser cards, deliberately spanning 6 specialties to sell the
// "biblioteca por especialidade" promise. `grito` lines are the conclusions
// printed on each poster (accurate, not invented).
const CARDS: Card[] = [
  {
    src: "/landing/memorecards/card-1.webp",
    title: "DRGE",
    specialty: "Gastroenterologia",
    grito: "Pirose + regurgitação + piora pós-prandial/ao deitar = pense em DRGE.",
  },
  {
    src: "/landing/memorecards/card-2.webp",
    title: "ITU na Gestação",
    specialty: "Obstetrícia",
    grito: "Gestante + urocultura positiva = não ignore; tratar protege mãe e feto.",
  },
  {
    src: "/landing/memorecards/card-3.webp",
    title: "HPV e Colo Uterino",
    specialty: "Ginecologia",
    grito: "HPV transitório é comum; persistência oncogênica = lesão precursora.",
  },
  {
    src: "/landing/memorecards/card-4.webp",
    title: "Escarlatina",
    specialty: "Pediatria",
    grito: "Febre + amigdalite purulenta + exantema em lixa = escarlatina.",
  },
  {
    src: "/landing/memorecards/card-5.webp",
    title: "Crise Hipertensiva",
    specialty: "Cardiologia",
    grito: "PA muito alta + lesão aguda de órgão-alvo = emergência hipertensiva.",
  },
  {
    src: "/landing/memorecards/card-6.webp",
    title: "Obstrução de Delgado",
    specialty: "Cirurgia",
    grito: "Obstrução de delgado + sinais de complicação = cirurgia, não observação.",
  },
];

export function MemorecardsScreen({ color }: { color: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [hintGone, setHintGone] = useState(false);
  const total = CARDS.length;

  const goTo = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(total - 1, i));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
      setHintGone(true);
    },
    [total],
  );

  // Active index follows the actual scroll position, so swipe and buttons stay
  // in sync. Rounding to the nearest page is enough with scroll-snap.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.max(0, Math.min(total - 1, i));
    setIdx((prev) => (prev === clamped ? prev : clamped));
    if (el.scrollLeft > 4) setHintGone(true);
  }, [total]);

  const card = CARDS[idx];

  return (
    <div
      className="flex select-none flex-col"
      style={{ background: "color-mix(in srgb, var(--lp-fg) 4%, var(--lp-base))" }}
    >
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-[9px] font-semibold" style={{ color: "var(--lp-fg-55)" }}>
          9:41
        </span>
        <div className="flex items-center gap-1" style={{ color: "var(--lp-fg-40)" }}>
          <div className="h-1.5 w-1.5 rounded-full bg-current" />
          <div className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
          <div className="h-1.5 w-3 rounded-sm bg-current opacity-40" />
        </div>
      </div>

      {/* Header — back chevron + card title + specialty + counter */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <ChevronLeft className="h-4 w-4 flex-shrink-0" style={{ color: "var(--lp-fg-40)" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-bold leading-tight" style={{ color: "var(--lp-fg)" }}>
            {card.title}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color }}>
              {card.specialty}
            </span>
          </div>
        </div>
        <span
          className="flex-shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold tabular-nums"
          style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
        >
          {idx + 1} / {total}
        </span>
      </div>

      {/* Card carousel — native scroll-snap (touch swipe) + keyboard */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          tabIndex={0}
          role="group"
          aria-roledescription="carrossel"
          aria-label="MemoreCards — deslize para navegar"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              goTo(idx + 1);
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              goTo(idx - 1);
            }
          }}
          className="flex snap-x snap-mandatory overflow-x-auto outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CARDS.map((c) => (
            <div key={c.src} className="w-full flex-shrink-0 snap-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.src}
                alt={`MemoreCard: ${c.title} — ${c.specialty}`}
                width={640}
                height={800}
                draggable={false}
                loading="lazy"
                className="block w-full"
                style={{ aspectRatio: "4 / 5", objectFit: "cover" }}
              />
            </div>
          ))}
        </div>

        {/* Swipe hint — fades on first interaction */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-semibold text-white transition-opacity duration-500"
          style={{ background: "rgba(0,0,0,0.55)", opacity: hintGone ? 0 : 1 }}
        >
          deslize
          <ChevronRight className="h-3 w-3" />
        </div>
      </div>

      {/* "Grito da prova" strip — the poster's own conclusion, per card */}
      <div className="flex items-start gap-1.5 px-4 py-2.5" style={{ borderTop: "1px solid var(--lp-border)" }}>
        <span className="mt-px flex-shrink-0 text-[9px]" style={{ color }} aria-hidden>
          ✦
        </span>
        <p className="text-[8px] font-medium leading-snug" style={{ color: "var(--lp-fg-55)" }}>
          <span className="font-bold" style={{ color: "var(--lp-fg)" }}>
            Grito da prova:{" "}
          </span>
          {card.grito}
        </p>
      </div>

      {/* Controls — arrows (desktop click-through) + position dots (indicators) */}
      <div className="flex items-center justify-between px-4 pb-4 pt-1">
        <button
          type="button"
          onClick={() => goTo(idx - 1)}
          disabled={idx === 0}
          aria-label="Card anterior"
          className="flex h-12 w-12 items-center justify-center rounded-full border transition-opacity disabled:opacity-25"
          style={{ borderColor: "var(--lp-border)", color: "var(--lp-fg-55)" }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5" aria-hidden>
          {CARDS.map((c, i) => (
            <span
              key={c.src}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: i === idx ? 16 : 6, background: i === idx ? color : "var(--lp-fg-25)" }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => goTo(idx + 1)}
          disabled={idx === total - 1}
          aria-label="Próximo card"
          className="flex h-12 w-12 items-center justify-center rounded-full border transition-opacity disabled:opacity-25"
          style={{ borderColor: "var(--lp-border)", color: "var(--lp-fg-55)" }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
