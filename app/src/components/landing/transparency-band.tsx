"use client";

import Link from "next/link";
import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";

/* Transparency band — attacks the market's universal wound (auto-renew traps,
   surprise installments, hidden prices). Framed as fairness, not cheapness. */
export function TransparencyBand() {
  const ref = useReveal(0.14);

  const points = [
    { k: "transp.p1", fallback: "Sem mensalidade e sem renovação automática" },
    { k: "transp.p2", fallback: "Sem “segunda parcela” que aparece um ano depois" },
    { k: "transp.p3", fallback: "Sem preço escondido atrás de um consultor" },
    { k: "transp.p4", fallback: "7 dias para testar tudo e pedir reembolso, sem justificar" },
  ];

  return (
    <section
      className="px-5 py-24 md:px-8 md:py-28"
      style={{ background: "var(--lp-alt)", borderTop: "1px solid var(--lp-border)" }}
    >
      <div ref={ref} className="lp-reveal mx-auto max-w-2xl text-center">
        <div className="mb-8 text-[10px] uppercase tracking-[0.25em]" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}>
          <SiteText as="span" k="transp.eyebrow" fallback="Sem pegadinha" />
        </div>
        <h2 className="text-[clamp(2rem,4.6vw,3.4rem)] font-black leading-[1.07] tracking-[-0.025em]" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
          <SiteText as="span" multiline k="transp.headline" fallback="Uma compra. Sem mensalidade. Sem surpresa no cartão." />
        </h2>

        <ul className="mx-auto mt-10 flex max-w-md flex-col gap-3 text-left">
          {points.map((p) => (
            <li key={p.k} className="flex items-start gap-3 text-sm sm:text-base" style={{ color: "var(--lp-fg-55)" }}>
              <span className="mt-0.5 flex-shrink-0 font-bold" style={{ color: "var(--brand)" }}>✓</span>
              <SiteText as="span" k={p.k} fallback={p.fallback} />
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-10 max-w-md text-sm leading-relaxed" style={{ color: "var(--lp-fg-40)" }}>
          <SiteText as="span" multiline k="transp.stakes" fallback="A prova já custa R$4.516 em taxas do INEP. Reprovar e refazer a 2ª etapa custa outros R$4.106. Do lado dessa conta, a preparação certa é o item mais barato — e o único que muda o resultado." />
        </p>

        <p
          className="mx-auto mt-6 max-w-md border-t pt-6 text-sm leading-relaxed"
          style={{ color: "var(--lp-fg-40)", borderColor: "var(--lp-border)" }}
        >
          <SiteText
            as="span"
            multiline
            k="transp.scope"
            fallback="Transparência total: o foco aqui é a 1ª etapa — a prova teórica, onde a maioria reprova. A 2ª etapa (estações práticas) é presencial e tem preparação própria; o MedHelpSpace não cobre essa parte."
          />
        </p>

        {/* "Prove it yourself" — the same honesty promise, made testable. Lands
            here because the section is already about having nothing to hide.
            utm_medium=transparencia tags this placement so we can see which
            on-page door drove each lead. */}
        <div className="mt-12 border-t pt-10" style={{ borderColor: "var(--lp-border)" }}>
          <Link
            href="/questoes-revalida?utm_source=site&utm_medium=transparencia&utm_campaign=home"
            className="inline-block rounded-xl px-7 py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 hover:-translate-y-px active:scale-95"
            style={{ background: "var(--brand)", boxShadow: "0 0 32px rgba(122,29,145,0.35)" }}
          >
            <SiteText as="span" k="transp.cta" fallback="Não acredita? Faça o simulado honesto →" />
          </Link>
          <p className="mt-3 text-xs" style={{ color: "var(--lp-fg-40)" }}>
            <SiteText
              as="span"
              k="transp.cta_sub"
              fallback="15 questões comentadas da 1ª etapa. As 5 primeiras sem nem pedir e-mail."
            />
          </p>
        </div>
      </div>
    </section>
  );
}
