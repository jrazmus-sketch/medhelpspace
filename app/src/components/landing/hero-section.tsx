"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { WordCycle } from "./word-cycle";
import { AppMockup } from "./app-mockup";

// Floating specialty chips that drift gently on either side of the hero content.
// Only visible on xl screens where there's enough horizontal space.
const LEFT_CHIPS = [
  { label: "Cardiologia", color: "var(--c-spec-1)", style: { top: "12%", left: "2%" }, anim: "lp-float-a", dur: "5.8s" },
  { label: "Neurologia", color: "var(--c-spec-6)", style: { top: "38%", left: "0.5%" }, anim: "lp-float-c", dur: "7.2s" },
  { label: "Pediatria", color: "var(--c-spec-9)", style: { top: "62%", left: "3%" }, anim: "lp-float-b", dur: "6.4s" },
  { label: "Obstetrícia", color: "var(--c-spec-7)", style: { top: "82%", left: "1%" }, anim: "lp-float-d", dur: "5.2s" },
];
const RIGHT_CHIPS = [
  { label: "Pneumologia", color: "var(--c-spec-2)", style: { top: "8%", right: "2%" }, anim: "lp-float-b", dur: "6.6s" },
  { label: "Gastro", color: "var(--c-spec-5)", style: { top: "34%", right: "0.5%" }, anim: "lp-float-d", dur: "7.8s" },
  { label: "Infectologia", color: "var(--c-spec-10)", style: { top: "58%", right: "2.5%" }, anim: "lp-float-a", dur: "5.5s" },
  { label: "Nefrologia", color: "var(--c-spec-11)", style: { top: "78%", right: "1%" }, anim: "lp-float-c", dur: "6.1s" },
];

export function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);

  // Expose hero element for sticky CTA bar to observe
  useEffect(() => {
    if (heroRef.current) {
      heroRef.current.setAttribute("id", "hero-section");
    }
  }, []);

  return (
    <section ref={heroRef} className="lp-hero-mesh relative overflow-hidden px-5 pb-8 pt-12 md:px-8 md:pb-12 md:pt-16">

      {/* Floating chips — desktop only */}
      <div className="pointer-events-none hidden xl:block">
        {LEFT_CHIPS.map((chip) => (
          <div
            key={chip.label}
            className="absolute z-10 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm"
            style={{
              ...chip.style,
              color: chip.color,
              borderColor: `color-mix(in srgb, ${chip.color} 25%, transparent)`,
              animationName: chip.anim,
              animationDuration: chip.dur,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDelay: `${Math.random() * 2}s`,
            }}
          >
            {chip.label}
          </div>
        ))}
        {RIGHT_CHIPS.map((chip) => (
          <div
            key={chip.label}
            className="absolute z-10 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm"
            style={{
              ...chip.style,
              color: chip.color,
              borderColor: `color-mix(in srgb, ${chip.color} 25%, transparent)`,
              animationName: chip.anim,
              animationDuration: chip.dur,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDelay: `${Math.random() * 2}s`,
            }}
          >
            {chip.label}
          </div>
        ))}
      </div>

      {/* Centered hero content */}
      <div className="relative z-20 mx-auto max-w-3xl text-center">

        {/* Eyebrow */}
        <div
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand"
          style={{
            animationName: "lp-fade-up",
            animationDuration: "0.6s",
            animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
            animationFillMode: "both",
          }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          Revalida 2026.2 · 2027.1
        </div>

        {/* Headline */}
        <div
          style={{
            animationName: "lp-fade-up",
            animationDuration: "0.7s",
            animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
            animationFillMode: "both",
            animationDelay: "80ms",
          }}
        >
          <h1
            className="text-[2.5rem] font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-[3.4rem] md:text-[4rem]"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            É mais do que um{" "}
            <span className="text-brand">
              <WordCycle />
            </span>
            .
            <br />
            <span className="text-foreground/85">
              É um{" "}
              <span className="lp-underline-draw text-foreground">
                sistema
              </span>{" "}
              de aprovação.
            </span>
          </h1>
        </div>

        {/* Subtext */}
        <p
          className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-foreground/60 sm:text-lg"
          style={{
            animationName: "lp-fade-up",
            animationDuration: "0.7s",
            animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
            animationFillMode: "both",
            animationDelay: "160ms",
          }}
        >
          Aqui o foco não é acumular conteúdo — é marcar ponto no Revalida.
          Treino do jeito que a prova cobra: raciocínio, pegadinha e conduta na cabeça.
        </p>

        {/* CTAs */}
        <div
          className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          style={{
            animationName: "lp-fade-up",
            animationDuration: "0.7s",
            animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
            animationFillMode: "both",
            animationDelay: "240ms",
          }}
        >
          <Link
            href="/loja"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-8 py-4 text-base font-bold text-white shadow-lg shadow-brand/25 transition-all hover:bg-brand/85 hover:shadow-brand/35 hover:-translate-y-0.5 active:scale-95"
          >
            Comprar Agora
            <span aria-hidden>→</span>
          </Link>
          <a
            href="#sistema"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-8 py-4 text-base font-semibold text-foreground/70 transition-all hover:border-brand/40 hover:text-foreground hover:bg-accent"
          >
            Ver o sistema
            <span aria-hidden>↓</span>
          </a>
        </div>

        {/* Stat chips */}
        <div
          className="mt-6 flex flex-wrap items-center justify-center gap-2"
          style={{
            animationName: "lp-fade-up",
            animationDuration: "0.7s",
            animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
            animationFillMode: "both",
            animationDelay: "320ms",
          }}
        >
          {[
            { value: "204", label: "simulados" },
            { value: "3.506", label: "flashcards" },
            { value: "12", label: "especialidades" },
            { value: "94", label: "áudios MedVoice" },
            { value: "220+", label: "aulas" },
          ].map((chip) => (
            <div
              key={chip.label}
              className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium backdrop-blur-sm"
            >
              <span className="font-bold text-brand">{chip.value}</span>
              {" "}
              <span className="text-foreground/50">{chip.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Browser-frame app preview */}
      <div
        className="relative z-20 mx-auto mt-10 max-w-4xl"
        style={{
          animationName: "lp-fade-up",
          animationDuration: "0.9s",
          animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
          animationFillMode: "both",
          animationDelay: "480ms",
        }}
      >
        {/*
          SCREENSHOT PLACEHOLDER — hero browser mockup
          Replace <AppMockup variant="dashboard" /> with:
          <Image src="/screenshots/dashboard.png" alt="MedHelpSpace dashboard" width={1200} height={480}
            className="w-full rounded-b-xl" />
          and update the lp-browser-chrome to real URL: medhelpspace.com.br/app
        */}
        <AppMockup variant="dashboard" />
      </div>

      {/* Bottom fade to next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
