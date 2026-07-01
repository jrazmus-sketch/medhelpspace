"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";
import { StudyPath } from "./concepts/study-path";

/* Plano de Estudos — the auto-deriving daily plan, shown as a climbing trilha.

   Atmosphere ("Aurora do destino"): a single cool light source anchored at the
   PROVA summit (top-right, where the trilha card and its flag sit). It lifts the
   section off flat black and washes gently toward the words, so the whole panel
   reads as lit BY the destination — the calm inverse of the Revisão section,
   which decays INTO black. One hue (--c-revalida), fully static, decorative and
   behind the content. */
export function PlanoSection() {
  const ref = useReveal(0.12);

  return (
    <section
      className="relative overflow-hidden px-5 py-24 md:px-8 md:py-32"
      style={{ background: "var(--lp-base)", borderTop: "1px solid var(--lp-border)" }}
    >
      <style>{PL_BG_CSS}</style>

      {/* Destination light — decorative, behind everything */}
      <div aria-hidden className="pl-bg" />

      <div ref={ref} className="lp-reveal relative z-10 mx-auto max-w-5xl">
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

          <div className="pl-card rounded-2xl p-5 sm:p-7" style={{ background: "var(--lp-alt)", border: "1px solid var(--lp-border)" }}>
            <StudyPath accent="var(--c-revalida)" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* Self-contained atmosphere for this section. One hue (--c-revalida) at low
   alpha; brightest at the summit (top-right), a whisper of lift behind the text,
   a faint counter-wash bottom-left so the glow isn't lopsided. Fully static. */
const PL_BG_CSS = `
.pl-bg{ position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden;
  background:
    /* destination light — blooms from the summit (top-right) */
    radial-gradient(120% 95% at 88% -8%, color-mix(in srgb, var(--c-revalida) 13%, transparent), transparent 55%),
    /* whisper of lift behind the words so the text never floats on flat black */
    radial-gradient(95% 120% at 18% 42%, color-mix(in srgb, var(--c-revalida) 4%, transparent), transparent 68%),
    /* faint counter-wash so the section isn't lopsided */
    radial-gradient(110% 110% at -8% 118%, color-mix(in srgb, var(--c-revalida) 3%, transparent), transparent 60%);
}

/* the trilha card, lit by the same summit light */
.pl-card{ position:relative;
  box-shadow:0 30px 80px -50px color-mix(in srgb, var(--c-revalida) 42%, transparent); }
.pl-card::before{ content:""; position:absolute; top:-26px; right:-26px; width:62%; height:62%;
  border-radius:50%; pointer-events:none;
  background:radial-gradient(circle at 78% 24%, color-mix(in srgb, var(--c-revalida) 16%, transparent), transparent 68%);
  filter:blur(22px); }
`;
