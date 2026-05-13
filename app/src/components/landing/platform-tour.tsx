"use client";

import { useRef, useEffect } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { AppMockup, type MockupVariant } from "./app-mockup";

const TOUR_ITEMS: { variant: MockupVariant; label: string; desc: string }[] = [
  {
    variant: "dashboard",
    label: "Dashboard",
    desc: "Visão geral das 12 especialidades e progresso",
  },
  {
    variant: "questoes",
    label: "Questões",
    desc: "Questões oficiais comentadas com raciocínio clínico",
  },
  {
    variant: "resumos",
    label: "Resumos",
    desc: "Casos narrativos com conduta passo a passo",
  },
  {
    variant: "medvoice",
    label: "MedVoice",
    desc: "Áudios de decisão clínica para ouvir em qualquer lugar",
  },
  {
    variant: "formula",
    label: "Fórmula",
    desc: "Atalhos de prova, macetes e mnemônicos",
  },
  {
    variant: "audiocards",
    label: "Audiocards",
    desc: "Flashcards em áudio — revisão rápida e constante",
  },
];

export function PlatformTour() {
  const headerRef = useReveal();
  const trackRef = useRef<HTMLDivElement>(null);

  // Drag to scroll
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    const onDown = (e: MouseEvent) => {
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };
    const onUp = () => { isDown = false; };
    const onMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      el.scrollLeft = scrollLeft - (x - startX) * 1.5;
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("mousemove", onMove);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <section className="overflow-hidden px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div ref={headerRef} className="lp-reveal mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand">
              Conheça a plataforma
            </p>
            <h2
              className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              Seis ferramentas. Uma plataforma.
            </h2>
          </div>
          <p className="text-sm text-foreground/45 sm:text-right">
            Arraste para explorar →
          </p>
        </div>

      </div>

      {/* Full-bleed scroll track */}
      <div ref={trackRef} className="lp-tour-track px-5 md:px-8">
        {/* Left padding card */}
        <div className="lp-tour-card w-4 flex-shrink-0" aria-hidden />

        {TOUR_ITEMS.map((item) => (
          <div key={item.variant} className="lp-tour-card w-72 flex-shrink-0 sm:w-80">
            {/*
              SCREENSHOT PLACEHOLDER
              Replace <AppMockup variant={item.variant} /> with:
              <Image src={`/screenshots/${item.variant}.png`} alt={item.label}
                width={640} height={400} className="w-full rounded-xl shadow-lg" />
            */}
            <AppMockup variant={item.variant} />
            <div className="mt-3 px-1">
              <div className="text-sm font-bold text-foreground">{item.label}</div>
              <div className="mt-0.5 text-xs text-foreground/50">{item.desc}</div>
            </div>
          </div>
        ))}

        {/* Right padding */}
        <div className="lp-tour-card w-4 flex-shrink-0" aria-hidden />
      </div>

      {/* Scroll hint dots */}
      <div className="mt-6 flex justify-center gap-1.5">
        {TOUR_ITEMS.map((item, i) => (
          <div
            key={item.variant}
            className="h-1.5 rounded-full bg-foreground/20 transition-all"
            style={{ width: i === 0 ? "24px" : "6px" }}
          />
        ))}
      </div>
    </section>
  );
}
