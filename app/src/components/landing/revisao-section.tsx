"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";
import { ForgettingCurve } from "./concepts/forgetting-curve";

/* The #1 differentiator: Revisão (spaced repetition), made visible with the
   forgetting curve. */
export function RevisaoSection() {
  const ref = useReveal(0.12);

  return (
    <section
      className="px-5 py-24 md:px-8 md:py-32"
      style={{ background: "var(--lp-alt)", borderTop: "1px solid var(--lp-border)" }}
    >
      <div ref={ref} className="lp-reveal mx-auto max-w-3xl text-center">
        <div className="mb-8 text-[10px] uppercase tracking-[0.25em]" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--c-questoes)" }}>
          <SiteText as="span" k="revisao.eyebrow" fallback="O que ninguém mais tem no Revalida" />
        </div>
        <h2 className="text-[clamp(2rem,5vw,3.6rem)] font-black leading-[1.06] tracking-[-0.025em]" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
          <SiteText as="span" multiline k="revisao.headline" fallback="Quase ninguém é reprovado por não ter estudado. É por ter esquecido." />
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--lp-fg-40)" }}>
          <SiteText as="span" multiline k="revisao.body" fallback="Toda questão que você responde e todo flashcard que você vira entram numa fila de revisão. A repetição espaçada traz cada conteúdo de volta no momento exato antes de você esquecer — e o que você erra volta primeiro." />
        </p>
      </div>

      {/* The forgetting curve */}
      <div className="mx-auto mt-12 max-w-3xl rounded-2xl p-5 sm:p-7" style={{ background: "var(--lp-base)", border: "1px solid var(--lp-border)" }}>
        <ForgettingCurve />
      </div>

      {/* Modes + kicker */}
      <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-5">
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {["Revisar hoje", "Só as que errei", "Pontos fracos"].map((m) => (
            <span
              key={m}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--c-questoes)",
                background: "color-mix(in srgb, var(--c-questoes) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--c-questoes) 30%, transparent)",
              }}
            >
              {m}
            </span>
          ))}
        </div>
        <p className="max-w-md text-center text-sm" style={{ color: "var(--lp-fg-40)" }}>
          <SiteText as="span" multiline k="revisao.kicker" fallback="É a mesma lógica dos cursões de R$6 mil — só que feita para o Revalida e já inclusa." />
        </p>
      </div>
    </section>
  );
}
