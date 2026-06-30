"use client";

import { useEffect, useRef } from "react";

/* ════════════════════════════════════════════════════════════════════════════
   Study path (a trilha) — the visual for Plano de Estudos.
   A path that climbs from Fundamento → Intensificação → Reta final (60D),
   with deep-link stops along the way and a PROVA flag at the summit.
   Theme-aware; draws in on scroll.
   ════════════════════════════════════════════════════════════════════════════ */

const STOPS = [
  { x: 120, y: 153, label: "Pneumo · Questões" },
  { x: 268, y: 142, label: "Revisão · 14 devidas" },
  { x: 430, y: 130, label: "Cardio · Resumo" },
  { x: 602, y: 118, label: "Simulado 100Q" },
];

export function StudyPath({
  className,
  accent = "var(--c-questoes)",
}: {
  className?: string;
  accent?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("sp-in");
          obs.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`sp-root ${className ?? ""}`} style={{ ["--acc" as string]: accent }}>
      <style>{SP_CSS}</style>
      <svg viewBox="0 0 760 230" width="100%" role="img" aria-label="Trilha de estudos que sobe do fundamento à reta final, com links diretos para o próximo conteúdo, mirando a data da prova.">
        <defs>
          <linearGradient id="sp-ramp" x1="0" x2="1">
            <stop offset="0" stopColor="var(--acc)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--acc)" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* widening ramp under the path */}
        <path className="sp-ramp" d="M40,150 L716,86 L716,150 L40,170 Z" />

        {/* phase labels */}
        <text className="sp-phase" x="120" y="38" textAnchor="middle">FUNDAMENTO</text>
        <text className="sp-phase" x="400" y="32" textAnchor="middle">INTENSIFICAÇÃO</text>
        <text className="sp-phase sp-phase-on" x="640" y="26" textAnchor="middle">RETA FINAL · 60D</text>

        {/* the climbing path */}
        <path className="sp-line sp-draw" d="M40,160 L716,104" />

        {/* deep-link stops */}
        {STOPS.map((s, i) => (
          <g key={s.label} className="sp-stop" style={{ animationDelay: `${0.5 + i * 0.28}s` }}>
            <circle className="sp-dot" cx={s.x} cy={s.y} r="6" />
            <text className="sp-stoplabel" x={s.x} y={s.y + 30} textAnchor="middle">{s.label}</text>
          </g>
        ))}

        {/* prova flag at the summit */}
        <g className="sp-prova" style={{ animationDelay: "1.7s" }}>
          <circle className="sp-prova-ring" cx="716" cy="104" r="10" />
          <text className="sp-prova-label" x="716" y="84" textAnchor="middle">PROVA</text>
        </g>
      </svg>
    </div>
  );
}

const SP_CSS = `
.sp-root{ width:100%; }
.sp-ramp{ fill:url(#sp-ramp); opacity:.16; }
.sp-phase{ fill:var(--lp-fg-25); font-family:var(--font-geist-mono); font-size:11px; letter-spacing:1.2px; }
.sp-phase-on{ fill:var(--acc); }
.sp-line{ fill:none; stroke:var(--acc); stroke-width:2.5; }
.sp-dot{ fill:var(--lp-alt); stroke:var(--acc); stroke-width:2.5; }
.sp-stoplabel{ fill:var(--lp-fg-40); font-family:var(--font-geist-mono); font-size:11px; }
.sp-prova-ring{ fill:var(--acc); stroke:var(--lp-base); stroke-width:2.5; }
.sp-prova-label{ fill:var(--lp-fg); font-family:var(--font-bricolage); font-weight:800; font-size:13px; }

.sp-draw{ stroke-dasharray:720; stroke-dashoffset:720; }
.sp-in .sp-draw{ animation:spDraw 1.4s cubic-bezier(.4,0,.2,1) forwards; }
.sp-stop,.sp-prova{ opacity:0; }
.sp-in .sp-stop{ animation:spPop .4s ease forwards; }
.sp-in .sp-prova{ animation:spPop .5s ease forwards; }
@keyframes spDraw{ to{ stroke-dashoffset:0; } }
@keyframes spPop{ from{ opacity:0; transform:translateY(5px); } to{ opacity:1; transform:translateY(0); } }

@media (prefers-reduced-motion:reduce){
  .sp-draw{ animation:none !important; stroke-dashoffset:0 !important; }
  .sp-stop,.sp-prova{ animation:none !important; opacity:1 !important; }
}
`;
