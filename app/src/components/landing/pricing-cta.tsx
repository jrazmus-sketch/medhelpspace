"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";

const COHORTS = [
  {
    label: "Revalida 2026.2",
    price: "R$ 3.990",
    checkout: "/checkout?cohort=revalida-2026-2",
  },
  {
    label: "Revalida 2027.1",
    price: "R$ 4.990",
    checkout: "/checkout?cohort=revalida-2027-1",
  },
];

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

export function PricingCTA() {
  const ref = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  const cohort = COHORTS[selected];

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
            className="mb-8 text-[10px] uppercase tracking-[0.25em]"
            style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
          >
            Comece sua preparação
          </div>
          <h2
            className="text-[clamp(2.8rem,6vw,5rem)] font-black leading-[1.0] tracking-[-0.03em]"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            Escolha sua turma.
          </h2>
          <p className="mt-4 text-base" style={{ color: "var(--lp-fg-40)" }}>
            O sistema é o mesmo — a turma define o seu calendário de preparação.
          </p>
        </div>

        {/* Single card */}
        <div
          className="rounded-2xl p-6 md:p-8"
          style={{ border: "1px solid var(--lp-border)", background: "var(--lp-fg-05)" }}
        >
          {/* Cohort selector */}
          <div className="mb-6">
            <div
              className="mb-3 text-[10px] uppercase tracking-[0.2em]"
              style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
            >
              Qual é a sua prova?
            </div>
            <div className="flex gap-2">
              {COHORTS.map((c, i) => (
                <button
                  key={c.label}
                  onClick={() => setSelected(i)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold transition-all"
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
                  {c.label}
                </button>
              ))}
            </div>
          </div>

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
                {cohort.price}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mb-8 text-xs" style={{ color: "var(--lp-fg-25)" }}>
            ou parcele em até 12x no cartão
          </div>

          {/* Feature list */}
          <ul className="mb-8 flex flex-col gap-2.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--lp-fg-55)" }}>
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--brand)" }} />
                {item}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Link
            href={cohort.checkout}
            className="block w-full rounded-xl py-4 text-center text-base font-bold text-white transition-all hover:opacity-85 active:scale-95"
            style={{
              background: "var(--brand)",
              boxShadow: "0 0 32px var(--lp-glow)",
            }}
          >
            Comprar Agora →
          </Link>
        </div>

        {/* Trust signals */}
        <div
          className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[11px]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
        >
          <span>✓ Acesso imediato</span>
          <span>✓ Garantia incondicional de 7 dias</span>
          <span>✓ Pagamento 100% seguro · PagBank</span>
        </div>
      </div>
    </section>
  );
}
