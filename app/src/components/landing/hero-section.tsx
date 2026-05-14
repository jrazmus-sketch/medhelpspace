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
      style={{ background: "var(--lp-base)" }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 45%, var(--lp-glow), transparent 65%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <div
          className="mb-8 text-xs uppercase tracking-[0.22em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
        >
          Revalida 2026.2 · 2027.1
        </div>

        <h1
          className="max-w-4xl text-[clamp(3rem,7.5vw,6.5rem)] font-black leading-[1.01] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
        >
          É um sistema<br className="hidden sm:block" /> de aprovação.
        </h1>

        <p
          className="mt-7 max-w-md text-base leading-relaxed sm:text-lg"
          style={{ color: "var(--lp-fg-40)" }}
        >
          Não é curso. Não é videoaula.<br />
          É o método que treina o raciocínio que o Revalida cobra.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/loja"
            className="rounded-xl px-8 py-4 text-base font-bold text-white transition-all hover:opacity-85 hover:-translate-y-px active:scale-95"
            style={{
              background: "var(--brand)",
              boxShadow: "0 0 48px var(--lp-glow)",
            }}
          >
            Comprar Agora →
          </Link>
          <a
            href="#features"
            className="text-sm font-medium transition-colors"
            style={{ color: "var(--lp-fg-25)" }}
          >
            Ver o sistema ↓
          </a>
        </div>

        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs"
          style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
        >
          <span>Acesso imediato</span>
          <span className="hidden sm:block">·</span>
          <span>Garantia de 7 dias</span>
          <span className="hidden sm:block">·</span>
          <span>Pagamento via PagBank</span>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div
          className="flex h-10 w-6 items-start justify-center rounded-full border"
          style={{ borderColor: "var(--lp-border)" }}
        >
          <div
            className="mt-2 h-1.5 w-1 rounded-full"
            style={{
              background: "var(--lp-fg-25)",
              animation: "lp-scroll-dot 1.8s cubic-bezier(0.45,0,0.55,1) infinite",
            }}
          />
        </div>
      </div>
    </section>
  );
}
