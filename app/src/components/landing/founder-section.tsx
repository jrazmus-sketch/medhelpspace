"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";

// "Por trás da MedHelpSpace" (Karina, 2026-10-09) — replaces the old quote block
// ("Criar o MedHelpSpace foi uma decisão…" + "Equipe MedHelpSpace" + the three
// counters, which already appear higher on the page). A personal note from the
// founder, read as a quiet pause between the platform tour and the pricing: one
// centred reading column, left-aligned text, no photo, no cards. The hero's founder
// line links here, so the id is fixed (also the GA4 view_founder_section target).
export const FOUNDER_SECTION_ID = "por-tras";

const PARAGRAPHS = [
  {
    k: "behind.p1",
    text: "Criei a plataforma com o propósito de repensar o jeito de estudar para o Revalida. Sei que essa preparação carrega expectativas que vão muito além da prova — e que estudar por horas sem saber o que priorizar ou se você está no caminho certo pode ser desgastante.",
  },
  {
    k: "behind.p2",
    text: "Analiso as provas dos últimos anos, comparo como os temas são cobrados e observo o raciocínio que cada questão exige. É a partir dessa análise que defino o que precisa ser priorizado e como cada tema pode ser melhor explicado.",
  },
  {
    k: "behind.p3",
    text: "Por isso, combinei diferentes formas de estudar: recursos visuais, áudios e revisão ativa para que você possa retomar um mesmo tema por caminhos diferentes, fixar o que importa e adaptar a preparação à sua rotina.",
  },
  {
    k: "behind.p4",
    text: "Dedico a este projeto o cuidado que uma etapa tão importante da sua trajetória merece. Quero que você chegue à prova mais preparado para reconhecer o raciocínio que cada questão exige e mais confiante para decidir.",
  },
];

export function FounderSection() {
  const ref = useReveal(0.15);

  return (
    <section
      id={FOUNDER_SECTION_ID}
      className="scroll-mt-16 bg-[var(--lp-alt-bg)] px-5 py-20 md:px-8 md:py-28"
    >
      <div ref={ref} className="lp-reveal mx-auto max-w-[38rem]">
        <div aria-hidden className="mb-6 h-[3px] w-12 rounded-full" style={{ background: "linear-gradient(to right, var(--brand), var(--brand-text))" }} />

        <h2
          className="text-[clamp(1.9rem,4.4vw,3rem)] font-black leading-[1.08] tracking-[-0.025em]"
          style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
        >
          <SiteText as="span" multiline k="behind.title" fallback="Por trás da MedHelpSpace" />
        </h2>

        <div className="mt-10 space-y-6 text-left text-[1.0625rem] leading-[1.75] md:text-lg md:leading-[1.8]">
          <p
            className="text-xl font-semibold leading-snug md:text-[1.375rem]"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            <SiteText as="span" multiline k="behind.lead" fallback="Sou Karina, médica formada na Argentina e fundadora da MedHelpSpace." />
          </p>
          {PARAGRAPHS.map((p) => (
            <p key={p.k} style={{ color: "var(--lp-fg-75)" }}>
              <SiteText as="span" multiline k={p.k} fallback={p.text} />
            </p>
          ))}
        </div>

        {/* Signature */}
        <div className="mt-12">
          <div
            aria-hidden
            className="mb-5 h-px w-16"
            style={{ background: "linear-gradient(to right, var(--brand-text), transparent)" }}
          />
          <div
            className="text-xl font-bold tracking-[-0.01em] md:text-2xl"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            <SiteText as="span" k="behind.sign_name" fallback="Karina Brandão" />
          </div>
          <div className="mt-1 text-[0.9375rem] font-medium" style={{ color: "var(--brand-text)" }}>
            <SiteText as="span" k="behind.sign_role" fallback="Fundadora da MedHelpSpace" />
          </div>
        </div>
      </div>
    </section>
  );
}
