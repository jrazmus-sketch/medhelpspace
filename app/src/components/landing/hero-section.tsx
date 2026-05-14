"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion } from "motion/react";

// Two repeating 1200px ECG tiles — animation shifts by exactly one tile for seamless loop
const ECG_PATH =
  "M 0,45 L 370,45 C 381,45 387,37 398,37 C 409,37 415,45 426,45 L 452,45 L 461,53 L 480,3 L 499,62 L 516,45 L 536,45 C 549,45 566,30 584,28 C 602,26 617,39 632,45 L 1200,45 " +
  "L 1570,45 C 1581,45 1587,37 1598,37 C 1609,37 1615,45 1626,45 L 1652,45 L 1661,53 L 1680,3 L 1699,62 L 1716,45 L 1736,45 C 1749,45 1766,30 1784,28 C 1802,26 1817,39 1832,45 L 2400,45";

function EcgAnimation() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 overflow-hidden"
      style={{ top: "50%", transform: "translateY(-50%)", height: 90, zIndex: 1 }}
      aria-hidden="true"
    >
      {/* Dark band that grounds the line */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.30)" }} />

      {/* Scrolling ECG */}
      <svg
        width="2400"
        height="90"
        style={{ position: "absolute", left: 0, top: 0, animation: "ecg-scroll 9s linear infinite" }}
      >
        <defs>
          <filter id="ecg-glow" x="-5%" y="-120%" width="110%" height="340%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Soft wide glow layer */}
        <path d={ECG_PATH} fill="none" stroke="rgba(139,123,255,0.25)" strokeWidth="8" />
        {/* Crisp line on top */}
        <path d={ECG_PATH} fill="none" stroke="rgba(139,123,255,0.70)" strokeWidth="1.8" filter="url(#ecg-glow)" />
      </svg>
    </div>
  );
}

function QuizCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full rounded-2xl p-4 text-left"
      style={{
        background: "#12112a",
        border: "1px solid rgba(139,123,255,0.14)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.38)" }}
        >
          Cardiologia · Simulado
        </span>
        <span
          className="text-[9px]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.25)" }}
        >
          3 / 12
        </span>
      </div>

      <p className="mb-3.5 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>
        Mulher, 58 anos, dispneia progressiva aos esforços há 3 meses.
        B3, estase jugular e edema em MMII. Diagnóstico mais provável?
      </p>

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
              background: opt.correct ? "rgba(139,123,255,0.20)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${opt.correct ? "rgba(139,123,255,0.40)" : "rgba(255,255,255,0.06)"}`,
              color: opt.correct ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)",
            }}
          >
            <span
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold"
              style={{
                background: opt.correct ? "rgba(139,123,255,0.50)" : "rgba(255,255,255,0.07)",
                color: opt.correct ? "#fff" : "rgba(255,255,255,0.38)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {opt.label}
            </span>
            <span className="flex-1">{opt.text}</span>
            {opt.correct && (
              <span className="text-[9px]" style={{ color: "rgba(139,123,255,0.85)" }}>✓</span>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function MedVoiceCard() {
  const bars = [35, 55, 42, 70, 88, 62, 78, 45, 92, 68, 50, 80, 58, 66, 40, 72, 85, 48, 60, 75, 44, 56];
  const filled = 13;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.50, duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full rounded-2xl p-4 text-left"
      style={{
        background: "#12112a",
        border: "1px solid rgba(139,123,255,0.14)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
      }}
    >
      <div className="mb-3">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.38)" }}
        >
          MedVoice · Cardiologia
        </span>
      </div>

      <div className="mb-3">
        <div className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.88)" }}>
          Fibrilação Atrial
        </div>
        <div className="mt-0.5 text-[10px]" style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.32)" }}>
          Áudio 4 de 19 · 4:32
        </div>
      </div>

      <div className="mb-2 flex items-end gap-[2px]" style={{ height: 34 }}>
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${h}%`,
              background: i < filled ? "rgba(139,123,255,0.72)" : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </div>

      <div className="mb-3">
        <div className="h-0.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.10)" }}>
          <div className="h-full rounded-full" style={{ width: "48%", background: "rgba(139,123,255,0.68)" }} />
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-[9px]" style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.28)" }}>02:10</span>
          <span className="text-[9px]" style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.28)" }}>04:32</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-5">
        <button style={{ color: "rgba(255,255,255,0.30)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(139,123,255,0.78)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
        </div>
        <button style={{ color: "rgba(255,255,255,0.30)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" /></svg>
        </button>
      </div>

      <div className="mt-3 flex gap-1.5">
        {["Diagnóstico", "Conduta"].map((tag) => (
          <span
            key={tag}
            className="rounded-md px-2 py-0.5 text-[9px] font-medium"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.40)",
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

  return (
    <section
      ref={sectionRef}
      id="hero-section"
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 pb-16 pt-24 text-center md:px-8"
      style={{
        background: "radial-gradient(ellipse 160% 90% at 50% 20%, #140830 0%, #08031a 50%, #020108 100%)",
      }}
    >
      {/* ECG line — behind everything, across the vertical middle */}
      <EcgAnimation />

      {/* Subtle brand glow from below */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(139,123,255,0.08), transparent 65%)",
          zIndex: 1,
        }}
        aria-hidden="true"
      />

      {/* Bottom fade to page background */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[18%]"
        style={{ background: "linear-gradient(to bottom, transparent, var(--lp-base))", zIndex: 2 }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative flex w-full max-w-5xl flex-col items-center" style={{ zIndex: 10 }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.55 }}
          className="mb-8 text-xs uppercase tracking-[0.22em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.32)" }}
        >
          Prepare-se para o Revalida
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
          style={{ color: "rgba(255,255,255,0.52)" }}
        >
          Não é curso. Não é videoaula. É o método que treina o raciocínio que o Revalida cobra.
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
              boxShadow: "0 0 40px rgba(139,123,255,0.28)",
            }}
          >
            Comprar Agora →
          </Link>
          <a
            href="#features"
            className="text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.32)" }}
          >
            Ver o sistema ↓
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.32, duration: 0.50 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.25)" }}
        >
          <span>Acesso imediato</span>
          <span className="hidden sm:block">·</span>
          <span>Garantia de 7 dias</span>
          <span className="hidden sm:block">·</span>
          <span>Pagamento via PagBank</span>
        </motion.div>

        {/* Preview cards — stacked on mobile, staggered side-by-side on sm+ */}
        <div className="mt-10 flex w-full flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div className="hero-card-left w-full max-w-[280px]">
            <QuizCard />
          </div>
          <div className="hero-card-right w-full max-w-[280px]">
            <MedVoiceCard />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2" style={{ zIndex: 10 }}>
        <div
          className="flex h-10 w-6 items-start justify-center rounded-full border"
          style={{ borderColor: "rgba(255,255,255,0.12)" }}
        >
          <div
            className="mt-2 h-1.5 w-1 rounded-full"
            style={{
              background: "rgba(255,255,255,0.25)",
              animation: "lp-scroll-dot 1.8s cubic-bezier(0.45,0,0.55,1) infinite",
            }}
          />
        </div>
      </div>
    </section>
  );
}
