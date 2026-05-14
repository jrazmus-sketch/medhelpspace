"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export function HeroSection() {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (heroRef.current) heroRef.current.id = "hero-section";
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 pb-16 pt-24 text-center md:px-8"
      style={{ background: "#030303" }}
    >
      {/* Ambient purple glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 50% 45%, rgba(139,123,255,0.11), transparent 65%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Label */}
        <div
          className="mb-8 text-xs uppercase tracking-[0.22em] text-white/30"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          Revalida 2026.2 · 2027.1
        </div>

        {/* Main headline */}
        <h1
          className="max-w-4xl text-[clamp(3rem,7.5vw,6.5rem)] font-black leading-[1.01] tracking-[-0.03em] text-white"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          É um sistema<br className="hidden sm:block" /> de aprovação.
        </h1>

        {/* Sub */}
        <p
          className="mt-7 max-w-md text-base leading-relaxed text-white/45 sm:text-lg"
        >
          Não é curso. Não é videoaula.<br />
          É o método que treina o raciocínio que o Revalida cobra.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/loja"
            className="rounded-xl px-8 py-4 text-base font-bold text-white transition-all hover:opacity-85 hover:-translate-y-px active:scale-95"
            style={{
              background: "var(--brand)",
              boxShadow: "0 0 40px rgba(139,123,255,0.3)",
            }}
          >
            Comprar Agora →
          </Link>
          <a
            href="#features"
            className="text-sm font-medium text-white/35 transition-colors hover:text-white/60"
          >
            Ver o sistema ↓
          </a>
        </div>

        {/* Trust line */}
        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/25"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          <span>Acesso imediato</span>
          <span className="hidden sm:block">·</span>
          <span>Garantia de 7 dias</span>
          <span className="hidden sm:block">·</span>
          <span>Pagamento via PagBank</span>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div
          className="flex h-10 w-6 items-start justify-center rounded-full border"
          style={{ borderColor: "rgba(255,255,255,0.12)" }}
        >
          <div
            className="mt-2 h-1.5 w-1 rounded-full bg-white/30"
            style={{
              animation: "lp-scroll-dot 1.8s cubic-bezier(0.45,0,0.55,1) infinite",
            }}
          />
        </div>
      </div>
    </section>
  );
}
