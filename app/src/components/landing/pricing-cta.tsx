"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

const CHECKOUT_2026 = "https://medhelpspace.com.br/?add-to-cart=8041";
const CHECKOUT_2027 = "https://medhelpspace.com.br/?add-to-cart=8043";

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
      style={{ background: "#030303" }}
    >
      {/* Glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(139,123,255,0.09), transparent 60%)",
        }}
      />

      <div
        className="relative mx-auto max-w-5xl"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="pt-16 text-center md:pt-24">
          {/* Label */}
          <div
            className="mb-8 text-[10px] uppercase tracking-[0.25em] text-white/25"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            Comece sua preparação
          </div>

          <h2
            className="text-[clamp(2.8rem,6vw,5.5rem)] font-black leading-[1.0] tracking-[-0.03em] text-white"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            Comece agora.
          </h2>
          <p className="mt-4 text-base text-white/35">
            Escolha a turma da sua prova. Acesso imediato ao sistema completo.
          </p>
        </div>

        {/* Price cards */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 md:gap-6">
          {/* 2026.2 */}
          <div
            className="flex flex-col rounded-2xl p-6 md:p-8"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
          >
            <div
              className="mb-4 text-[10px] uppercase tracking-[0.2em] text-white/30"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              Turma · Revalida 2026.2
            </div>
            <div
              className="text-[clamp(2.5rem,5vw,3.8rem)] font-bold leading-none tracking-[-0.03em] text-white"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              R$ 3.990
            </div>
            <div className="mt-1 text-xs text-white/25">ou parcele em até 12x no cartão</div>

            <ul className="my-8 flex flex-col gap-2.5">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-white/50">
                  <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-white/25" />
                  {item}
                </li>
              ))}
            </ul>

            <a
              href={CHECKOUT_2026}
              className="mt-auto block w-full rounded-xl border py-3.5 text-center text-sm font-bold text-white transition-all hover:border-white/25 hover:bg-white/5 active:scale-95"
              style={{ borderColor: "rgba(255,255,255,0.12)" }}
            >
              Comprar 2026.2 →
            </a>
          </div>

          {/* 2027.1 — featured */}
          <div
            className="relative flex flex-col rounded-2xl p-6 md:p-8"
            style={{
              border: "1px solid rgba(139,123,255,0.35)",
              background: "rgba(139,123,255,0.04)",
              boxShadow: "0 0 60px rgba(139,123,255,0.08)",
            }}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span
                className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white"
                style={{ background: "var(--brand)", fontFamily: "var(--font-geist-mono)" }}
              >
                Mais tempo
              </span>
            </div>

            <div
              className="mb-4 text-[10px] uppercase tracking-[0.2em]"
              style={{ fontFamily: "var(--font-geist-mono)", color: "var(--brand)" }}
            >
              Turma · Revalida 2027.1
            </div>
            <div
              className="text-[clamp(2.5rem,5vw,3.8rem)] font-bold leading-none tracking-[-0.03em] text-white"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              R$ 4.990
            </div>
            <div className="mt-1 text-xs text-white/25">ou parcele em até 12x no cartão</div>

            <ul className="my-8 flex flex-col gap-2.5">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-white/55">
                  <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--brand)" }} />
                  {item}
                </li>
              ))}
            </ul>

            <a
              href={CHECKOUT_2027}
              className="mt-auto block w-full rounded-xl py-3.5 text-center text-sm font-bold text-white transition-all hover:opacity-85 active:scale-95"
              style={{
                background: "var(--brand)",
                boxShadow: "0 0 32px rgba(139,123,255,0.25)",
              }}
            >
              Comprar 2027.1 →
            </a>
          </div>
        </div>

        {/* Trust signals */}
        <div
          className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[11px] text-white/25"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          <span>✓ Acesso imediato</span>
          <span>✓ Garantia incondicional de 7 dias</span>
          <span>✓ Pagamento 100% seguro · PagBank</span>
        </div>
      </div>
    </section>
  );
}
