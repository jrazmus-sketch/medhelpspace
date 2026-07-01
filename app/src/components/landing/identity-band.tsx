"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";
import { JourneyMap } from "./concepts/journey-map";

/* Identity band — speaks directly to the Brazilian who studied abroad. */
export function IdentityBand() {
  const ref = useReveal(0.14);

  return (
    <section
      className="px-5 py-24 md:px-8 md:py-28"
      style={{ background: "var(--lp-alt-2)", borderTop: "1px solid var(--lp-border)" }}
    >
      <div ref={ref} className="lp-reveal mx-auto max-w-5xl">
        <div className="grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr] md:gap-16">
          <div>
            <div className="mb-6 text-sm uppercase tracking-[0.25em]" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}>
              <SiteText as="span" k="identity.eyebrow" fallback="A saga pelo CRM" />
            </div>
            <h2 className="text-[clamp(2rem,4.8vw,3.6rem)] font-black leading-[1.06] tracking-[-0.03em]" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
              <SiteText as="span" k="identity.headline1" fallback="Anos lá fora." />
              <br />
              <span style={{ color: "var(--brand)" }}>
                <SiteText as="span" k="identity.headline2" fallback="A última prova é aqui." />
              </span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed sm:text-lg" style={{ color: "var(--lp-fg-40)" }}>
              <SiteText as="span" multiline k="identity.body" fallback="Você encarou a saudade, o preconceito do “diploma de fora”, a faculdade na Bolívia, no Paraguai, na Argentina. Falta só uma coisa: passar numa prova que reprova 3 em cada 4. É pra isso que o MedHelpSpace existe." />
            </p>
          </div>

          <div className="flex justify-center">
            <JourneyMap />
          </div>
        </div>
      </div>
    </section>
  );
}
