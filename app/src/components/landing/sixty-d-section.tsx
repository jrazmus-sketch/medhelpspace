"use client";

import { useEffect, useRef } from "react";
import { SiteText } from "./site-text";

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
      style={{ background: "var(--lp-alt-2)", borderTop: "1px solid var(--lp-border)" }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="pt-4">
          {/* Label */}
          <div className="mb-8 flex items-center gap-3">
            <span
              className="text-sm uppercase tracking-[0.25em]"
              style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
            >
              07
            </span>
            <span className="h-px w-8" style={{ background: "var(--c-pop)", opacity: 0.6 }} />
            <span
              className="text-sm uppercase tracking-[0.2em]"
              style={{ fontFamily: "var(--font-geist-mono)", color: "var(--c-pop)" }}
            >
              <SiteText as="span" k="sixtyd.eyebrow" fallback="MedHelp 60D" />
            </span>
          </div>

          {/* Headline */}
          <h3
            className="max-w-3xl text-[clamp(1.9rem,4.5vw,3.8rem)] font-black leading-[1.08] tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            <SiteText as="span" k="sixtyd.headline1" fallback="Fase final do sistema." />
            <span style={{ color: "var(--lp-fg-15)" }}> <SiteText as="span" k="sixtyd.headline2" fallback="Liberada 60 dias antes da prova." /></span>
          </h3>

          {/* Body */}
          <p
            className="mt-6 max-w-2xl text-base leading-relaxed sm:text-[1.05rem]"
            style={{ color: "var(--lp-fg-40)" }}
          >
            <SiteText as="span" multiline k="sixtyd.body" fallback="Aqui você revisa padrões recorrentes do INEP e as variações que a prova pode trazer, sem se perder em excesso. Já incluso na compra — libera automaticamente." />
          </p>

          {/* What's inside */}
          <div className="mt-10 grid gap-px sm:grid-cols-3">
            {[
              { name: "Fórmula MedHelp", desc: "Atalhos de prova: macetes, mnemônicos e frases-chave" },
              { name: "MemoreCards", desc: "Cards visuais de alta fixação por especialidade" },
              { name: "Simulados 100Q", desc: "Treino completo do dia da prova" },
            ].map((item, i) => (
              <div
                key={item.name}
                className="px-0 py-6 sm:px-6"
                style={{
                  borderRight: i < 2 ? "1px solid var(--lp-border)" : "none",
                }}
              >
                <div
                  className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em]"
                  style={{ fontFamily: "var(--font-geist-mono)", color: "var(--c-pop)" }}
                >
                  <SiteText as="span" k={`sixtyd.item${i + 1}.name`} fallback={item.name} />
                </div>
                <div className="text-sm" style={{ color: "var(--lp-fg-40)" }}>
                  <SiteText as="span" k={`sixtyd.item${i + 1}.desc`} fallback={item.desc} />
                </div>
              </div>
            ))}
          </div>

          {/* Timeline strip */}
          <div className="mt-12 flex items-center gap-0">
            {[
              { label: "Compra", sub: "Acesso imediato" },
              { label: "Estudo", sub: "Questões · Resumos · Revalida Up · MedVoice · Flashcards · Audiocards" },
              { label: "60D antes", sub: "MedHelp 60D liberado" },
              { label: "Prova", sub: "Revalida 2027.1 / 2027.2" },
            ].map((step, i) => (
              <div key={step.label} className="flex flex-1 flex-col items-center">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold"
                  style={{
                    borderColor: i === 2 ? "var(--c-pop)" : "var(--lp-border)",
                    color: i === 2 ? "var(--c-pop)" : "var(--lp-fg-25)",
                    background: i === 2 ? "rgba(6,182,212,0.08)" : "transparent",
                    boxShadow: i === 2 ? "0 0 16px rgba(6,182,212,0.15)" : "none",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {i + 1}
                </div>
                <div
                  className="mt-2 text-center text-[9px] font-bold uppercase tracking-[0.15em]"
                  style={{
                    color: i === 2 ? "var(--c-pop)" : "var(--lp-fg-25)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {step.label}
                </div>
                <div
                  className="mt-1 hidden max-w-[90px] text-center text-[8px] leading-tight sm:block"
                  style={{ color: "var(--lp-fg-15)" }}
                >
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
