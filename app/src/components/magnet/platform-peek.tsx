"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Compact "por dentro da plataforma" slider for the funnel (idea 2 showcase + idea 3
// folded in as an inline lightbox — NEVER navigate cold traffic away to the homepage).
// Reuses the real desktop screenshots the marketing landing already ships
// (/landing/desktop/*.webp), but styled with the FUNNEL's semantic tokens (surface /
// border / brand) so it sits natively inside the quiz + reward cards instead of the
// marketing --lp-* section chrome. Two mounts:
//   • PlatformPeek      — the slider itself, inline on the reward/offer screen.
//   • PlatformPeekModal — a subtle trigger + overlay wrapping the same slider, used
//                         from the welcome step ("Ver o que tem dentro →").

type Shot = { src: string; title: string; caption: string };

const SHOTS: Shot[] = [
  {
    src: "/landing/desktop/painel.webp",
    title: "Seu painel de estudos",
    caption: "Contagem regressiva, plano do dia e todo o progresso em uma tela.",
  },
  {
    src: "/landing/desktop/questoes.webp",
    title: "Questões comentadas",
    caption: "Provas do Revalida com gabarito e o “pega” de cada questão.",
  },
  {
    src: "/landing/desktop/resumos.webp",
    title: "Resumos narrativos",
    caption: "A clínica contada como história — para fixar de verdade.",
  },
  {
    src: "/landing/desktop/medvoice.webp",
    title: "MedVoice — a clínica fala",
    caption: "Áudios por tema com transcrição, para estudar no seu ritmo.",
  },
  {
    src: "/landing/desktop/relatorio.webp",
    title: "Relatório de desempenho",
    caption: "Seus acertos, sua sequência e seus pontos fracos por área.",
  },
  {
    src: "/landing/desktop/especialidade.webp",
    title: "Tudo por especialidade",
    caption: "Questões, resumos, áudios e flashcards de cada área num lugar só.",
  },
];

export function PlatformPeek() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const total = SHOTS.length;

  const goTo = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(total - 1, i));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    },
    [total],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.max(0, Math.min(total - 1, i));
    setIdx((prev) => (prev === clamped ? prev : clamped));
  }, [total]);

  const active = SHOTS[idx];

  return (
    <div>
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          tabIndex={0}
          role="group"
          aria-roledescription="carrossel"
          aria-label="Telas do MedHelpSpace — deslize para navegar"
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
          className="flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-border outline-none [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-scrollbar]:hidden"
        >
          {SHOTS.map((shot) => (
            <div key={shot.src} className="w-full flex-shrink-0 snap-center bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.src}
                alt={`MedHelpSpace — ${shot.title}`}
                width={1731}
                height={1083}
                draggable={false}
                loading="lazy"
                className="block w-full"
                style={{ aspectRatio: "1731 / 1083", objectFit: "cover", objectPosition: "top" }}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => goTo(idx - 1)}
          disabled={idx === 0}
          aria-label="Tela anterior"
          className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur transition-opacity hover:bg-background disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goTo(idx + 1)}
          disabled={idx === total - 1}
          aria-label="Próxima tela"
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur transition-opacity hover:bg-background disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Caption — fixed min-height avoids layout shift between slides. */}
      <div className="mt-3 flex min-h-[52px] flex-col items-center text-center">
        <div className="text-sm font-bold tracking-tight text-foreground">{active.title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{active.caption}</div>
      </div>

      {/* Position dots */}
      <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden>
        {SHOTS.map((shot, i) => (
          <span
            key={shot.src}
            className="h-1.5 rounded-full bg-brand transition-all duration-300"
            style={{ width: i === idx ? 18 : 6, opacity: i === idx ? 1 : 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

// Trigger + overlay wrapper for the welcome step. Keeps the visitor ON the funnel
// (idea 3 done safely): the lightbox opens over the quiz and closes right back to it.
export function PlatformPeekModal({ label = "Ver o que tem dentro →" }: { label?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-brand underline-offset-2 hover:underline"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Por dentro da plataforma"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface-1 p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  Por dentro da plataforma
                </p>
                <h2 className="mt-0.5 text-base font-bold tracking-tight">
                  O que você recebe ao continuar
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </button>
            </div>

            <PlatformPeek />

            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
            >
              Voltar ao simulado →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
