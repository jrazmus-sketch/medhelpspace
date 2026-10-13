"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";

// "Por trás da MedHelpSpace" (Karina 2026-10-09; text v3 + look 2026-10-12) — replaces
// the old quote block ("Criar o MedHelpSpace foi uma decisão…" + "Equipe MedHelpSpace"
// + the three counters, which already appear higher on the page). Her personal note,
// read as a quiet pause between the platform tour and the pricing: one centred reading
// column, left-aligned, no photo, no cards. Not all white (her ask): the title ends in
// the page's lilac like the hero headline, her two bold phrases are lilac, a lilac rule
// runs beside the text and a faint lilac glow sits behind the title.
// The id is the GA4 view_founder_section target.
export const FOUNDER_SECTION_ID = "por-tras";

const LILAC = "var(--brand-text)"; // #c084e8 on the dark sales page — the hero's lilac

/** Her bold phrases: lilac + semibold, inline. */
function Hl({ k, text }: { k: string; text: string }) {
  return (
    <strong className="font-semibold" style={{ color: LILAC }}>
      <SiteText as="span" multiline k={k} fallback={text} />
    </strong>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--lp-fg-75)" }}>{children}</p>;
}

export function FounderSection() {
  const ref = useReveal(0.15);

  return (
    <section
      id={FOUNDER_SECTION_ID}
      className="relative isolate scroll-mt-16 overflow-hidden bg-[var(--lp-alt-bg)] px-5 py-20 md:px-8 md:py-28"
    >
      {/* Faint lilac glow behind the title — atmosphere, not a card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 45% at 30% 12%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 70%)",
        }}
      />

      <div ref={ref} className="lp-reveal mx-auto max-w-[38rem]">
        <div aria-hidden className="mb-6 h-[3px] w-12 rounded-full" style={{ background: `linear-gradient(to right, var(--brand), ${LILAC})` }} />

        <h2
          className="text-[clamp(1.9rem,4.4vw,3rem)] font-black leading-[1.08] tracking-[-0.025em]"
          style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
        >
          <SiteText as="span" k="behind.title" fallback="Por trás da" />{" "}
          <span style={{ color: LILAC }}>
            <SiteText as="span" k="behind.title_hl" fallback="MedHelpSpace" />
          </span>
        </h2>

        <p
          className="mt-8 text-xl font-semibold leading-snug md:text-[1.375rem]"
          style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
        >
          <SiteText as="span" multiline k="behind.lead" fallback="Sou Karina, médica formada na Argentina e fundadora da MedHelpSpace." />
        </p>

        {/* Reading column with a lilac rule down its left edge. */}
        <div className="relative mt-8 space-y-6 pl-5 text-left text-[1.0625rem] leading-[1.75] md:pl-7 md:text-lg md:leading-[1.8]">
          <div
            aria-hidden
            className="absolute bottom-1 left-0 top-1 w-[2px] rounded-full"
            style={{ background: `linear-gradient(to bottom, ${LILAC}, color-mix(in srgb, var(--brand) 55%, transparent) 55%, transparent)` }}
          />
          <Para>
            <SiteText as="span" multiline k="behind.p1a" fallback="Acredito que compartilhar conhecimento também é saber torná-lo compreensível. Meu objetivo é" />{" "}
            <Hl k="behind.p1_hl" text="explicar conteúdos médicos de forma clara e acessível" />
            <SiteText as="span" multiline autoSpace k="behind.p1b" fallback=", ajudando você a entender o raciocínio, conectar as informações e aplicar o que aprendeu." />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.p2" fallback="Foi dessa visão que nasceu a MedHelpSpace. Criei a plataforma para unir esse cuidado com a forma de ensinar a uma preparação orientada pelo que o Revalida exige: compreender as situações apresentadas, reconhecer as informações importantes e tomar decisões com mais segurança." />
          </Para>
          <Para>
            <Hl k="behind.p3_hl" text="Meu trabalho começa pelas próprias provas." />
            <SiteText as="span" multiline autoSpace k="behind.p3b" fallback="Analiso os temas cobrados ao longo dos anos, comparo como aparecem em diferentes questões e observo quais informações são decisivas para chegar à resposta. Essa análise orienta o que priorizar, como explicar cada conteúdo e o que retomar nas revisões." />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.p4" fallback="Foi com esse cuidado que reuni questões, recursos visuais, áudios e revisão ativa. Cada formato tem um propósito: ajudar você a compreender, testar o que aprendeu e revisitar um mesmo tema por caminhos diferentes. Assim, você pode adaptar o estudo à sua rotina e trabalhar as dificuldades que identifica ao longo da preparação." />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.p5" fallback="Sei que o Revalida carrega expectativas que vão muito além de uma prova. Por isso, dedico a este projeto o cuidado que uma etapa tão importante da sua trajetória merece — com respeito ao seu tempo, ao seu esforço e ao que você deseja conquistar." />
          </Para>
        </div>

        {/* Signature */}
        <div className="mt-12">
          <div aria-hidden className="mb-5 h-px w-16" style={{ background: `linear-gradient(to right, ${LILAC}, transparent)` }} />
          <div
            className="text-xl font-bold tracking-[-0.01em] md:text-2xl"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            <SiteText as="span" k="behind.sign_name" fallback="Karina Razmus" />
          </div>
          <div className="mt-1 text-[0.9375rem] font-medium" style={{ color: LILAC }}>
            <SiteText as="span" k="behind.sign_role" fallback="Fundadora da MedHelpSpace" />
          </div>
        </div>
      </div>
    </section>
  );
}
