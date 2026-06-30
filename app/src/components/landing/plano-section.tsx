"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";
import { StudyPath } from "./concepts/study-path";

/* Plano de Estudos — the auto-deriving daily plan, shown as a climbing trilha. */
export function PlanoSection() {
  const ref = useReveal(0.12);

  return (
    <section
      className="px-5 py-24 md:px-8 md:py-32"
      style={{ background: "var(--lp-base)", borderTop: "1px solid var(--lp-border)" }}
    >
      <div ref={ref} className="lp-reveal mx-auto max-w-5xl">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <div className="mb-6 text-[10px] uppercase tracking-[0.25em]" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--c-revalida)" }}>
              <SiteText as="span" k="plano.eyebrow" fallback="Seu plano, sozinho" />
            </div>
            <h2 className="text-[clamp(1.9rem,4.4vw,3.2rem)] font-black leading-[1.08] tracking-[-0.025em]" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
              <SiteText as="span" multiline k="plano.headline" fallback="Não precisa decidir por onde começar." />
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed sm:text-lg" style={{ color: "var(--lp-fg-40)" }}>
              <SiteText as="span" multiline k="plano.body" fallback="Responda 3 perguntas — sua data de prova, suas especialidades mais fracas e quantas horas você tem. O sistema monta um plano diário com link direto para o próximo conteúdo, prioriza o que você precisa revisar e se ajusta sozinho conforme a prova chega." />
            </p>
            <p className="mt-4 max-w-md text-sm" style={{ color: "var(--lp-fg-25)" }}>
              <SiteText as="span" multiline k="plano.kicker" fallback="Plantão puxado essa semana? Pausa e retoma sem perder o ritmo." />
            </p>
          </div>

          <div className="rounded-2xl p-5 sm:p-7" style={{ background: "var(--lp-alt)", border: "1px solid var(--lp-border)" }}>
            <StudyPath accent="var(--c-revalida)" />
          </div>
        </div>
      </div>
    </section>
  );
}
