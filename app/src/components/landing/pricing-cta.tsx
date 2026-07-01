"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Check, Clock, Lock, Unlock } from "lucide-react";
import type { CohortProduct } from "@/types/supabase";
import { getCohortTiming, defaultCohortTagline } from "@/lib/cohort-timing";
import { SiteText } from "./site-text";

// The generic 60D feature line states the rule ("liberado 60 dias antes"); the
// selected turma's live unlock status is shown separately below the price.
const INCLUDED = [
  "Estudo por Questões",
  "Resumos Narrativos",
  "MedVoice",
  "Fórmula MedHelp",
  "Audiocards",
  "MedHelp 60D — liberado 60 dias antes",
  "Acesso em celular, tablet e computador",
  "Atualizações contínuas",
];

export function PricingCTA({ cohorts }: { cohorts: CohortProduct[] }) {
  const ref = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  const cohort = cohorts[selected] ?? cohorts[0];
  // Date-driven copy for the selected turma; recomputed client-side each render
  // so the countdown / 60D status is always current (the page itself is ISR).
  const timing = cohort ? getCohortTiming(cohort) : null;

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
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // No cohorts on sale → "coming soon" instead of an empty card.
  if (cohorts.length === 0) {
    return (
      <section
        id="precos"
        className="relative overflow-hidden px-5 py-24 md:px-8 md:py-32"
        style={{ background: "var(--lp-base)", borderTop: "1px solid var(--lp-border)" }}
      >
        <div className="relative mx-auto max-w-xl text-center">
          <div
            className="mb-8 text-sm uppercase tracking-[0.25em]"
            style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
          >
            <SiteText as="span" k="pricing.soon.eyebrow" fallback="Inscrições" />
          </div>
          <h2
            className="text-[clamp(2.2rem,5vw,3.5rem)] font-black leading-[1.05] tracking-[-0.03em]"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            <SiteText as="span" k="pricing.soon.headline" fallback="Inscrições abertas em breve" />
          </h2>
          <p className="mt-4 text-base" style={{ color: "var(--lp-fg-40)" }}>
            <SiteText as="span" multiline k="pricing.soon.body" fallback="Estamos preparando a próxima turma. Volte em breve para garantir sua vaga." />
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      id="precos"
      className="lp-cin-block relative overflow-hidden px-5 py-24 md:px-8 md:py-32"
      style={{ background: "var(--lp-base)", borderTop: "1px solid var(--lp-border)" }}
    >
      {/* Brand glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 100%, var(--lp-glow), transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div
            className="mb-8 text-sm uppercase tracking-[0.25em]"
            style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
          >
            <SiteText as="span" k="pricing.eyebrow" fallback="Comece sua preparação" />
          </div>
          <h2
            className="text-[clamp(2.8rem,6vw,5rem)] font-black leading-[1.0] tracking-[-0.03em]"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            <SiteText as="span" k="pricing.headline" fallback="Escolha sua turma." />
          </h2>
          <p className="mt-4 text-base" style={{ color: "var(--lp-fg-40)" }}>
            <SiteText as="span" multiline k="pricing.subhead" fallback="O sistema é o mesmo — a turma define o seu calendário de preparação." />
          </p>
        </div>

        {/* Single card */}
        <div
          className="rounded-2xl p-6 md:p-8"
          style={{ border: "1px solid var(--lp-border)", background: "var(--lp-fg-05)" }}
        >
          {/* Cohort selector — only when there's a choice to make */}
          {cohorts.length > 1 && (
            <div className="mb-6">
              <div
                className="mb-3 text-[10px] uppercase tracking-[0.2em]"
                style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
              >
                <SiteText as="span" k="pricing.cohortPrompt" fallback="Qual é a sua prova?" />
              </div>
              <div className="flex flex-wrap gap-2">
                {cohorts.map((c, i) => (
                  <button
                    key={c.slug}
                    onClick={() => setSelected(i)}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-all"
                    style={
                      selected === i
                        ? {
                            background: "var(--brand)",
                            color: "#ffffff",
                            boxShadow: "0 0 20px var(--lp-glow)",
                          }
                        : {
                            background: "var(--lp-fg-05)",
                            border: "1px solid var(--lp-border)",
                            color: "var(--lp-fg-40)",
                          }
                    }
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Exam countdown chip for the selected turma (urgent = brand-tinted) */}
          {timing?.examChip && (
            <div className="mb-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
                style={
                  timing.examChip.urgent
                    ? { background: "var(--lp-glow)", color: "var(--brand)" }
                    : { border: "1px solid var(--lp-border)", color: "var(--lp-fg-40)" }
                }
              >
                <Clock className="h-3 w-3" />
                {timing.examChip.text}
              </span>
            </div>
          )}

          {/* Price — animates on cohort switch */}
          <div className="mb-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={selected}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="text-[clamp(2.8rem,6vw,4rem)] font-bold leading-none tracking-[-0.03em]"
                style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg)" }}
              >
                {cohort.priceLabel}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mb-5 text-xs" style={{ color: "var(--lp-fg-25)" }}>
            <SiteText as="span" k="pricing.installments" fallback="ou parcele em até 12x no cartão" />
          </div>

          {/* Per-turma tagline (editable per slug; honest time-tradeoff default) +
              live MedHelp 60D status for the selected turma. */}
          {timing && (
            <div className="mb-8 flex flex-col gap-3">
              <p className="text-sm leading-relaxed" style={{ color: "var(--lp-fg-55)" }}>
                <SiteText
                  as="span"
                  multiline
                  k={`pricing.tagline.${cohort.slug}`}
                  fallback={defaultCohortTagline(timing)}
                />
              </p>
              <span
                className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{
                  border: "1px solid color-mix(in srgb, var(--brand) 30%, transparent)",
                  background: "var(--lp-glow)",
                  color: "var(--brand)",
                }}
              >
                {timing.is60dUnlocked ? (
                  <Unlock className="h-4 w-4 shrink-0" />
                ) : (
                  <Lock className="h-4 w-4 shrink-0" />
                )}
                {timing.unlock60dLabel}
              </span>
            </div>
          )}

          {/* Feature list */}
          <ul className="mb-8 flex flex-col gap-2.5">
            {INCLUDED.map((item, i) => (
              <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--lp-fg-55)" }}>
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--brand)" }} />
                <SiteText as="span" k={`pricing.included.${i}`} fallback={item} />
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Link
            href={`/checkout?cohort=${cohort.slug}`}
            className="block w-full rounded-xl py-4 text-center text-base font-bold text-white transition-all hover:opacity-85 active:scale-95"
            style={{
              background: "var(--brand)",
              boxShadow: "0 0 32px var(--lp-glow)",
            }}
          >
            <SiteText as="span" k="pricing.cta" fallback="Comprar Agora →" />
          </Link>
        </div>

        {/* Trust signals */}
        <div
          className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[11px]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
        >
          <SiteText as="span" k="pricing.trust1" fallback="✓ Acesso imediato" />
          <SiteText as="span" k="pricing.trust2" fallback="✓ Garantia incondicional de 7 dias" />
          <SiteText as="span" k="pricing.trust3" fallback="✓ Pagamento 100% seguro · PagBank" />
        </div>

        {/* Free-questions door — lower-commitment downsell for visitors who reach
            pricing but aren't ready to buy. Ghost styling so it never competes with
            the primary "Comprar Agora" CTA above. Relocated from the removed
            TransparencyBand; utm_medium=pricing_downsell tags this placement. */}
        <div className="mt-10 border-t pt-8 text-center" style={{ borderColor: "var(--lp-border)" }}>
          <Link
            href="/questoes-revalida?utm_source=site&utm_medium=pricing_downsell&utm_campaign=home"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border px-6 py-3 text-sm font-semibold transition-all hover:-translate-y-px active:scale-95"
            style={{ borderColor: "var(--lp-border)", color: "var(--lp-fg-55)", background: "var(--lp-fg-05)" }}
          >
            <SiteText as="span" k="pricing.free_cta" fallback="Prefere testar antes? Faça 15 questões grátis →" />
          </Link>
          <p className="mt-3 text-xs" style={{ color: "var(--lp-fg-40)" }}>
            <SiteText as="span" k="pricing.free_cta_sub" fallback="Questões comentadas da 1ª etapa. As 5 primeiras sem nem pedir e-mail." />
          </p>
        </div>
      </div>
    </section>
  );
}
