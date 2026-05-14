"use client";

import { useEffect, useRef, useState } from "react";

const STATS = [
  { value: 204, label: "simulados comentados", suffix: "" },
  { value: 3506, label: "flashcards", suffix: "" },
  { value: 12, label: "especialidades", suffix: "" },
  { value: 94, label: "áudios MedVoice", suffix: "" },
];

function Counter({ target, duration = 1400 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const raf = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [started, target, duration]);

  return (
    <span ref={ref}>
      {count.toLocaleString("pt-BR")}
    </span>
  );
}

export function StatsNumbers() {
  return (
    <section
      style={{
        background: "#030303",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-4">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className="flex flex-col items-center justify-center px-6 py-14 text-center md:px-10"
            style={{
              borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
            }}
          >
            <div
              className="text-[clamp(2.8rem,5vw,4.5rem)] font-bold leading-none tracking-[-0.03em] text-white"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              <Counter target={stat.value} />
              {stat.suffix}
            </div>
            <div
              className="mt-3 text-[10px] uppercase tracking-[0.2em] text-white/30"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
