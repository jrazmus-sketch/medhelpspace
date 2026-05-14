"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // Image moves down slightly as user scrolls, creating parallax depth
  const imageY = useTransform(scrollYProgress, [0, 1], ["-15%", "15%"]);

  return (
    <section
      ref={sectionRef}
      id="hero-section"
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 pb-16 pt-24 text-center md:px-8"
    >
      {/* Parallax background image */}
      <motion.div
        className="absolute inset-0"
        style={{ y: imageY, scale: 1.35 }}
        aria-hidden="true"
      >
        <Image
          src="/images/hero-hospital.jpg"
          alt=""
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
          quality={90}
        />
      </motion.div>

      {/* Dark scrim — consistent in both light and dark modes */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "rgba(0,0,0,0.58)" }}
        aria-hidden="true"
      />

      {/* Top gradient to protect nav readability */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 h-[28%]"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)" }}
        aria-hidden="true"
      />

      {/* Subtle brand glow from below */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(122,29,145,0.18), transparent 60%)",
        }}
        aria-hidden="true"
      />

      {/* Bottom fade-to-page-background */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[40%]"
        style={{
          background: "linear-gradient(to bottom, transparent, var(--lp-base))",
        }}
        aria-hidden="true"
      />

      {/* Content — always white over photo */}
      <div className="relative z-10 flex flex-col items-center">
        <div
          className="mb-8 text-xs uppercase tracking-[0.22em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.45)" }}
        >
          Revalida 2026.2 · 2027.1
        </div>

        <h1
          className="max-w-4xl text-[clamp(3rem,7.5vw,6.5rem)] font-black leading-[1.01] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-bricolage)", color: "#ffffff" }}
        >
          É um sistema<br className="hidden sm:block" /> de aprovação.
        </h1>

        <p
          className="mt-7 max-w-md text-base leading-relaxed sm:text-lg"
          style={{ color: "rgba(255,255,255,0.60)" }}
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
              boxShadow: "0 0 48px rgba(122,29,145,0.45)",
            }}
          >
            Comprar Agora →
          </Link>
          <a
            href="#features"
            className="text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.40)" }}
          >
            Ver o sistema ↓
          </a>
        </div>

        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.35)" }}
        >
          <span>Acesso imediato</span>
          <span className="hidden sm:block">·</span>
          <span>Garantia de 7 dias</span>
          <span className="hidden sm:block">·</span>
          <span>Pagamento via PagBank</span>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div
          className="flex h-10 w-6 items-start justify-center rounded-full border"
          style={{ borderColor: "rgba(255,255,255,0.20)" }}
        >
          <div
            className="mt-2 h-1.5 w-1 rounded-full"
            style={{
              background: "rgba(255,255,255,0.35)",
              animation: "lp-scroll-dot 1.8s cubic-bezier(0.45,0,0.55,1) infinite",
            }}
          />
        </div>
      </div>
    </section>
  );
}
