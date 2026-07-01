"use client";

import { useEffect, useRef, useState } from "react";
import type { LandingStats } from "@/lib/landing/stats";

// Labels are fixed; the values are live counts passed in from the server
// component (see lib/landing/stats.ts). Order here is the display order.
const STAT_LABELS: { key: keyof LandingStats; label: string }[] = [
  { key: "flashcards", label: "flashcards" },
  { key: "questoes", label: "questões comentadas" },
  { key: "audios", label: "áudios MedVoice" },
  { key: "audiocards", label: "audiocards" },
  { key: "especialidades", label: "especialidades" },
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

  return <span ref={ref}>{count.toLocaleString("pt-BR")}</span>;
}

export function StatsNumbers({ stats }: { stats: LandingStats }) {
  return (
    <section
      style={{
        background: "var(--lp-alt)",
        borderTop: "1px solid var(--lp-border)",
        borderBottom: "1px solid var(--lp-border)",
      }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-5">
        {STAT_LABELS.map((stat, i) => {
          // With an odd count the final cell would sit alone in the last
          // 2-col mobile row — let it span full width so it stays centered.
          const orphanOnMobile =
            i === STAT_LABELS.length - 1 && STAT_LABELS.length % 2 === 1;
          return (
          <div
            key={stat.label}
            className={`flex flex-col items-center justify-center px-6 py-14 text-center md:px-10 ${
              orphanOnMobile ? "col-span-2 md:col-span-1" : ""
            }`}
            style={{
              borderRight: i < STAT_LABELS.length - 1 ? "1px solid var(--lp-border)" : "none",
            }}
          >
            <div
              className="text-[clamp(2.8rem,5vw,4.5rem)] font-bold leading-none tracking-[-0.03em]"
              style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg)" }}
            >
              <Counter target={stats[stat.key]} />
            </div>
            <div
              className="mt-3 text-[10px] uppercase tracking-[0.2em]"
              style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
            >
              {stat.label}
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}
