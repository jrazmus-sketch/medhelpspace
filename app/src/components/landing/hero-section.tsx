"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

function QuizCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-1 min-w-0 rounded-2xl p-4 text-left md:p-5"
      style={{
        background: "#0b0b16",
        boxShadow: "0 12px 40px rgba(0,0,0,0.50)",
      }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.40)" }}
        >
          Cardiologia · Simulado
        </span>
        <span
          className="text-[9px]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.28)" }}
        >
          3 / 12
        </span>
      </div>

      {/* Question stem */}
      <p className="mb-3.5 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.80)" }}>
        Mulher, 58 anos, dispneia progressiva aos esforços há 3 meses.
        B3, estase jugular e edema em MMII. Diagnóstico mais provável?
      </p>

      {/* Options */}
      <div className="flex flex-col gap-1.5">
        {[
          { label: "A", text: "Insuficiência cardíaca", correct: true },
          { label: "B", text: "Tromboembolismo pulmonar", correct: false },
          { label: "C", text: "Derrame pleural", correct: false },
          { label: "D", text: "Pneumonia atípica", correct: false },
        ].map((opt) => (
          <div
            key={opt.label}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs"
            style={{
              background: opt.correct
                ? "rgba(139,123,255,0.22)"
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${opt.correct ? "rgba(139,123,255,0.45)" : "rgba(255,255,255,0.07)"}`,
              color: opt.correct ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.50)",
            }}
          >
            <span
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold"
              style={{
                background: opt.correct ? "rgba(139,123,255,0.55)" : "rgba(255,255,255,0.08)",
                color: opt.correct ? "#fff" : "rgba(255,255,255,0.40)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {opt.label}
            </span>
            {opt.text}
            {opt.correct && (
              <span className="ml-auto text-[9px]" style={{ color: "rgba(139,123,255,0.90)" }}>✓ correta</span>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function MedVoiceCard() {
  const bars = Array.from({ length: 22 }, (_, i) => {
    const heights = [35, 55, 42, 70, 88, 62, 78, 45, 92, 68, 50, 80, 58, 66, 40, 72, 85, 48, 60, 75, 44, 56];
    return heights[i] ?? 50;
  });
  const filled = 13;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.50, duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-1 min-w-0 rounded-2xl p-4 text-left md:p-5"
      style={{
        background: "#0b0b16",
        boxShadow: "0 12px 40px rgba(0,0,0,0.50)",
      }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.40)" }}
        >
          MedVoice · Cardiologia
        </span>
      </div>

      {/* Track info */}
      <div className="mb-3">
        <div className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.88)" }}>
          Fibrilação Atrial
        </div>
        <div
          className="mt-0.5 text-[10px]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.35)" }}
        >
          Áudio 4 de 19 · 4:32
        </div>
      </div>

      {/* Waveform */}
      <div className="mb-2 flex items-end gap-[2px]" style={{ height: 36 }}>
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${h}%`,
              background: i < filled
                ? "rgba(139,123,255,0.75)"
                : "rgba(255,255,255,0.15)",
              transition: "background 0.2s",
            }}
          />
        ))}
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div
          className="h-0.5 overflow-hidden rounded-full"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: "48%", background: "rgba(139,123,255,0.70)" }}
          />
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-[9px]" style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.30)" }}>02:10</span>
          <span className="text-[9px]" style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.30)" }}>04:32</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-5">
        <button style={{ color: "rgba(255,255,255,0.35)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: "rgba(139,123,255,0.80)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <button style={{ color: "rgba(255,255,255,0.35)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm2.5-6L6 6v12l8.5-6-6-4.5z M16 6h2v12h-2z" />
          </svg>
        </button>
      </div>

      {/* Tags */}
      <div className="mt-3 flex gap-1.5">
        {["Diagnóstico", "Conduta"].map((tag) => (
          <span
            key={tag}
            className="rounded-md px-2 py-0.5 text-[9px] font-medium"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

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

      {/* Dark scrim — heavy, photo is atmosphere only */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "rgba(0,0,0,0.86)" }}
        aria-hidden="true"
      />

      {/* Top gradient to protect nav */}
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

      {/* Bottom fade-to-page-background — kept short so cards stay on dark bg */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[12%]"
        style={{
          background: "linear-gradient(to bottom, transparent, var(--lp-base))",
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.55 }}
          className="mb-8 text-xs uppercase tracking-[0.22em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.40)" }}
        >
          Revalida 2026.2 · 2027.1
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.65 }}
          className="max-w-4xl text-[clamp(3rem,7.5vw,6.5rem)] font-black leading-[1.01] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-bricolage)", color: "#ffffff" }}
        >
          É um sistema<br className="hidden sm:block" /> de aprovação.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.20, duration: 0.55 }}
          className="mt-7 max-w-md text-base leading-relaxed sm:text-lg"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Não é curso. Não é videoaula.<br />
          É o método que treina o raciocínio que o Revalida cobra.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.27, duration: 0.50 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
        >
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
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Ver o sistema ↓
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.32, duration: 0.50 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.28)" }}
        >
          <span>Acesso imediato</span>
          <span className="hidden sm:block">·</span>
          <span>Garantia de 7 dias</span>
          <span className="hidden sm:block">·</span>
          <span>Pagamento via PagBank</span>
        </motion.div>

        {/* App preview cards */}
        <div className="mt-10 flex w-full flex-col gap-3 sm:flex-row sm:gap-4">
          <QuizCard />
          <MedVoiceCard />
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div
          className="flex h-10 w-6 items-start justify-center rounded-full border"
          style={{ borderColor: "rgba(255,255,255,0.15)" }}
        >
          <div
            className="mt-2 h-1.5 w-1 rounded-full"
            style={{
              background: "rgba(255,255,255,0.28)",
              animation: "lp-scroll-dot 1.8s cubic-bezier(0.45,0,0.55,1) infinite",
            }}
          />
        </div>
      </div>
    </section>
  );
}
