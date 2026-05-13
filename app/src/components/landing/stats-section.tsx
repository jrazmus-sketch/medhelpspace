"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const STATS = [
  { value: 204,   suffix: "",    label: "simulados por tema",      sub: "questões comentadas por especialidade" },
  { value: 3506,  suffix: "",    label: "flashcards",              sub: "em 12 decks por especialidade" },
  { value: 12,    suffix: "",    label: "especialidades médicas",   sub: "do Cardiologia ao Dermatologia" },
  { value: 94,    suffix: "",    label: "áudios MedVoice",         sub: "7 especialidades já populadas" },
  { value: 220,   suffix: "+",   label: "aulas em texto",          sub: "resumos narrativos com casos clínicos" },
  { value: 473,   suffix: "",    label: "páginas de conteúdo",     sub: "organizadas por tema e especialidade" },
] as const;

function useCounter(target: number, duration = 1400) {
  const [count, setCount] = useState(0);
  const [active, setActive] = useState(false);

  const start = useCallback(() => setActive(true), []);

  useEffect(() => {
    if (!active) return;
    const begin = performance.now();
    let raf: number;
    const step = (now: number) => {
      const p = Math.min((now - begin) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);

  return { count, start };
}

function StatItem({ value, suffix, label, sub }: (typeof STATS)[number]) {
  const ref = useRef<HTMLDivElement>(null);
  const { count, start } = useCounter(value);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          start();
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [start]);

  const display = value >= 1000
    ? count.toLocaleString("pt-BR")
    : count.toString();

  return (
    <div
      ref={ref}
      className="flex flex-col gap-1 rounded-2xl border border-border bg-background p-6 text-center transition-shadow hover:shadow-md"
    >
      <div
        className="lp-stat-number text-4xl font-extrabold tracking-tight text-brand sm:text-5xl"
      >
        {display}{suffix}
      </div>
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="text-xs text-foreground/40">{sub}</div>
    </div>
  );
}

export function StatsSection() {
  return (
    <section className="px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand">
            O conteúdo
          </p>
          <h2
            className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            Tudo que você precisa. Nada do que não precisa.
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {STATS.map((s) => (
            <StatItem key={s.label} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}
