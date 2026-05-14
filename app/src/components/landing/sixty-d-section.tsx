"use client";

import { useEffect, useRef } from "react";

export function SixtyDSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-cin-visible");
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="medhelp60d"
      className="lp-cin-block px-5 py-24 md:px-8 md:py-32"
      style={{ background: "#030303" }}
    >
      <div
        className="mx-auto max-w-5xl"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="pt-16 md:pt-24">
          {/* Label */}
          <div className="mb-8 flex items-center gap-3">
            <span
              className="text-[10px] uppercase tracking-[0.25em] text-white/20"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              06
            </span>
            <span
              className="h-px w-8"
              style={{ background: "var(--c-pop)", opacity: 0.6 }}
            />
            <span
              className="text-[10px] uppercase tracking-[0.2em]"
              style={{ fontFamily: "var(--font-geist-mono)", color: "var(--c-pop)" }}
            >
              MedHelp 60D
            </span>
          </div>

          {/* Headline */}
          <h3
            className="max-w-3xl text-[clamp(1.9rem,4.5vw,3.8rem)] font-black leading-[1.08] tracking-[-0.02em] text-white"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            Fase final do sistema.
            <span style={{ color: "rgba(255,255,255,0.2)" }}> Liberada 60 dias antes da prova.</span>
          </h3>

          {/* Body */}
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/40 sm:text-[1.05rem]">
            Aqui você revisa padrões recorrentes do INEP e as variações que a prova pode trazer,
            sem se perder em excesso. Já incluso na compra — libera automaticamente.
          </p>

          {/* What's inside */}
          <div className="mt-10 grid gap-px sm:grid-cols-3">
            {[
              { name: "Revalida Up", desc: "Mini-resumos: padrão + decisão treinada" },
              { name: "MemoreCards", desc: "Cards visuais de alta fixação por especialidade" },
              { name: "Simulados 100Q", desc: "Treino completo do dia da prova" },
            ].map((item) => (
              <div
                key={item.name}
                className="px-0 py-6 sm:px-6"
                style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div
                  className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em]"
                  style={{ fontFamily: "var(--font-geist-mono)", color: "var(--c-pop)" }}
                >
                  {item.name}
                </div>
                <div className="text-sm text-white/40">{item.desc}</div>
              </div>
            ))}
          </div>

          {/* Timeline strip */}
          <div className="mt-12 flex items-center gap-0">
            {[
              { label: "Compra", sub: "Acesso imediato" },
              { label: "Estudo", sub: "Questões · Resumos · MedVoice · Fórmula · Audiocards" },
              { label: "60D antes", sub: "MedHelp 60D liberado" },
              { label: "Prova", sub: "Revalida 2026.2 / 2027.1" },
            ].map((step, i) => (
              <div key={step.label} className="flex flex-1 flex-col items-center">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold"
                  style={{
                    borderColor: i === 2 ? "var(--c-pop)" : "rgba(255,255,255,0.15)",
                    color: i === 2 ? "var(--c-pop)" : "rgba(255,255,255,0.3)",
                    background: i === 2 ? "rgba(6,182,212,0.08)" : "transparent",
                    boxShadow: i === 2 ? "0 0 16px rgba(6,182,212,0.2)" : "none",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {i + 1}
                </div>
                <div
                  className="mt-2 text-center text-[9px] font-bold uppercase tracking-[0.15em]"
                  style={{
                    color: i === 2 ? "var(--c-pop)" : "rgba(255,255,255,0.35)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {step.label}
                </div>
                <div className="mt-1 hidden max-w-[90px] text-center text-[8px] leading-tight text-white/20 sm:block">
                  {step.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
