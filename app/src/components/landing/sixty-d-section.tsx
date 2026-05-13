"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useReveal } from "@/hooks/use-reveal";

const TIMELINE_STEPS = [
  {
    icon: "✅",
    label: "Compra",
    desc: "Acesso imediato ao sistema completo",
    active: true,
  },
  {
    icon: "📚",
    label: "Estudo",
    desc: "Questões, resumos, MedVoice, Fórmula e Audiocards",
    active: true,
  },
  {
    icon: "🔓",
    label: "MedHelp 60D",
    desc: "Libera automaticamente 60 dias antes da sua prova",
    highlight: true,
  },
  {
    icon: "🏆",
    label: "Prova",
    desc: "Revalida 2026.2 ou 2027.1",
    active: false,
  },
];

const INCLUDED_60D = [
  {
    title: "Revalida Up",
    desc: "Mini-resumos com padrão + decisão treinada — revisão ultrarrápida de tudo que cai.",
    color: "var(--c-pop)",
  },
  {
    title: "MemoreCards",
    desc: "Biblioteca de cards visuais de alta fixação, organizados por especialidade.",
    color: "var(--c-pop)",
  },
  {
    title: "Simulados Completos",
    desc: "100 questões por simulado para treinar o ritmo e o raciocínio do dia da prova.",
    color: "var(--c-pop)",
  },
];

export function SixtyDSection() {
  const headerRef = useReveal();
  const timelineRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = timelineRef.current;
    if (!container) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          container.classList.add("lp-visible");
          obs.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      id="medhelp60d"
      className="relative overflow-hidden px-5 py-20 md:px-8 md:py-28"
      style={{ background: "var(--lp-dark-bg)" }}
    >
      {/* Background accent */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in srgb, var(--c-pop) 12%, transparent), transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl">

        {/* Header */}
        <div ref={headerRef} className="lp-reveal mb-14 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--c-pop)]/30 bg-[var(--c-pop)]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--c-pop)]">
            🔓 Fase Final
          </div>
          <h2
            className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-[2.8rem]"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            MedHelp 60D
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg">
            A fase final do sistema. Libera automaticamente 60 dias antes da sua prova — sem precisar fazer nada.
          </p>
        </div>

        {/* Timeline */}
        <div
          ref={timelineRef}
          className="lp-band-content mb-16"
        >
          <div className="relative flex flex-col gap-0 md:flex-row md:items-start">
            {/* Connecting line — desktop */}
            <div className="absolute left-0 right-0 top-5 hidden h-px bg-white/10 md:block">
              <div
                className="lp-timeline-line h-full"
                style={{ background: `linear-gradient(to right, var(--c-pop), color-mix(in srgb, var(--c-pop) 40%, white))` }}
              />
            </div>
            {/* Connecting line — mobile */}
            <div className="absolute bottom-0 left-5 top-0 w-px bg-white/10 md:hidden" />

            {TIMELINE_STEPS.map((step, i) => (
              <div
                key={step.label}
                className="relative flex flex-1 flex-row items-start gap-4 pb-8 md:flex-col md:items-center md:gap-3 md:pb-0 md:text-center"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Icon bubble */}
                <div
                  className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 text-base md:mx-auto"
                  style={{
                    borderColor: step.highlight
                      ? "var(--c-pop)"
                      : step.active
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(255,255,255,0.12)",
                    background: step.highlight
                      ? "color-mix(in srgb, var(--c-pop) 20%, transparent)"
                      : "rgba(255,255,255,0.04)",
                    boxShadow: step.highlight
                      ? "0 0 20px color-mix(in srgb, var(--c-pop) 30%, transparent)"
                      : "none",
                  }}
                >
                  {step.icon}
                </div>
                <div className="pt-1 md:pt-0">
                  <div
                    className="mb-1 text-sm font-bold"
                    style={{ color: step.highlight ? "var(--c-pop)" : "rgba(255,255,255,0.85)" }}
                  >
                    {step.label}
                  </div>
                  <div className="text-xs leading-relaxed text-white/40 md:max-w-[140px]">
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What's included grid */}
        <div className="grid gap-4 sm:grid-cols-3">
          {INCLUDED_60D.map((item, i) => (
            <div
              key={item.title}
              className="rounded-2xl border p-5"
              style={{
                borderColor: "color-mix(in srgb, var(--c-pop) 20%, transparent)",
                background: "color-mix(in srgb, var(--c-pop) 5%, rgba(255,255,255,0.02))",
                animationName: "lp-fade-up",
                animationDuration: "0.7s",
                animationFillMode: "both",
                animationDelay: `${200 + i * 100}ms`,
                animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <div
                className="mb-1 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--c-pop)" }}
              >
                {item.title}
              </div>
              <p className="text-sm leading-relaxed text-white/55">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="mb-5 text-sm text-white/40">
            Já incluso em ambas as turmas. Não precisa pagar a mais — libera sozinho na hora certa.
          </p>
          <Link
            href="/loja"
            className="inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-bold text-white transition-all hover:-translate-y-0.5 active:scale-95"
            style={{
              background: "var(--c-pop)",
              boxShadow: "0 8px 32px color-mix(in srgb, var(--c-pop) 35%, transparent)",
            }}
          >
            Garantir minha vaga
            <span aria-hidden>→</span>
          </Link>
        </div>

      </div>
    </section>
  );
}
