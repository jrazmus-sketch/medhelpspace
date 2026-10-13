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

// Karina's text (v2, 2026-10-12, via Justin) — verbatim, one entry per paragraph.
const LEAD = "Para mim, compartilhar conhecimento é ajudar alguém a entender de verdade.";
const PARAGRAPHS = [
  {
    k: "behind.p1",
    text: "É explicar de um jeito que faça sentido, que ajude a conectar as informações e a compreender o raciocínio por trás de uma decisão.",
  },
  {
    k: "behind.p2",
    text: "Eu sou Karina, médica formada na Argentina, e foi com esse propósito que criei a MedHelpSpace.",
  },
  {
    k: "behind.p3",
    text: "É isso que busco em cada explicação e em cada caso clínico: ajudar você a compreender o que estuda e a usar esse conhecimento com mais segurança.",
  },
  {
    k: "behind.p4",
    text: "Porque o seu tempo e o seu esforço merecem respeito. E cuidar da forma de ensinar é também cuidar de quem está aprendendo.",
  },
];
const CLOSING = "Seja muito bem-vindo à MedHelpSpace!";

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
            <SiteText as="span" multiline k="behind.lead" fallback={LEAD} />
          </p>
          {PARAGRAPHS.map((p) => (
            <p key={p.k} style={{ color: "var(--lp-fg-75)" }}>
              <SiteText as="span" multiline k={p.k} fallback={p.text} />
            </p>
          ))}
          <p className="font-medium" style={{ color: "var(--lp-fg)" }}>
            <SiteText as="span" multiline k="behind.closing" fallback={CLOSING} />
          </p>
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
