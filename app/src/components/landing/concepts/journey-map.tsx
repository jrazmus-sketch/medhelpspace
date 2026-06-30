"use client";

import { useEffect, useRef } from "react";

/* ════════════════════════════════════════════════════════════════════════════
   Journey map — the "little humanity" motif for the identity band.
   Dotted arcs from where the buyer studied (Bolívia / Paraguai / Argentina)
   converge on the prize: the CRM in Brasil. Editorial, no stock photos.
   Theme-aware; arcs draw in on scroll, badge pulses once.
   ════════════════════════════════════════════════════════════════════════════ */

const ORIGINS = [
  { x: 44, y: 58, label: "Bolívia", d: "M44,58 Q188,40 296,150" },
  { x: 32, y: 140, label: "Paraguai", d: "M32,140 Q176,120 296,150" },
  { x: 54, y: 222, label: "Argentina", d: "M54,222 Q188,232 296,150" },
];

export function JourneyMap({
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
          el.classList.add("jm-in");
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`jm-root ${className ?? ""}`} style={{ ["--acc" as string]: accent }}>
      <style>{JM_CSS}</style>
      <svg viewBox="0 0 360 280" width="100%" role="img" aria-label="Mapa da jornada: dos países de formação (Bolívia, Paraguai, Argentina) até o CRM no Brasil.">
        {/* arcs */}
        {ORIGINS.map((o, i) => (
          <path key={o.label} className="jm-arc jm-draw" style={{ animationDelay: `${0.2 + i * 0.3}s` }} d={o.d} />
        ))}

        {/* origin points */}
        {ORIGINS.map((o) => (
          <g key={o.label} className="jm-origin">
            <circle className="jm-orig-dot" cx={o.x} cy={o.y} r="4" />
            <text className="jm-orig-label" x={o.x + 12} y={o.y + 4}>{o.label}</text>
          </g>
        ))}

        {/* CRM · Brasil badge */}
        <g className="jm-badge">
          <circle className="jm-badge-ring" cx="296" cy="150" r="36" />
          <circle className="jm-badge-core" cx="296" cy="150" r="21" />
          <text className="jm-badge-crm" x="296" y="148" textAnchor="middle">CRM</text>
          <text className="jm-badge-br" x="296" y="163" textAnchor="middle">BRASIL</text>
        </g>
      </svg>
    </div>
  );
}

const JM_CSS = `
.jm-root{ width:100%; max-width:380px; }
.jm-arc{ fill:none; stroke:color-mix(in srgb, var(--acc) 55%, transparent); stroke-width:1.5; stroke-dasharray:3 5; }
.jm-orig-dot{ fill:var(--acc); }
.jm-orig-label{ fill:var(--lp-fg-55); font-family:var(--font-geist-mono); font-size:11px; }
.jm-badge-ring{ fill:color-mix(in srgb, var(--acc) 14%, transparent); stroke:var(--acc); stroke-width:1.5; }
.jm-badge-core{ fill:var(--acc); }
.jm-badge-crm{ fill:var(--brand-fg, #fff); font-family:var(--font-bricolage); font-weight:800; font-size:14px; }
.jm-badge-br{ fill:color-mix(in srgb, var(--brand-fg, #fff) 78%, transparent); font-family:var(--font-geist-mono); font-size:7.5px; letter-spacing:1px; }

/* draw + pulse */
.jm-draw{ stroke-dashoffset:200; stroke-dasharray:3 5; }
@keyframes jmDraw{ from{ opacity:0; } to{ opacity:1; } }
.jm-arc{ opacity:0; }
.jm-in .jm-arc{ animation:jmDraw .7s ease forwards; }
.jm-origin{ opacity:0; }
.jm-in .jm-origin{ animation:jmDraw .6s ease forwards .3s; }
.jm-badge{ opacity:0; }
.jm-in .jm-badge{ animation:jmDraw .6s ease forwards 1s, jmPulse 2.4s ease-in-out 1.6s infinite; transform-origin:296px 150px; }
@keyframes jmPulse{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.04); } }

@media (prefers-reduced-motion:reduce){
  .jm-arc,.jm-origin,.jm-badge{ animation:none !important; opacity:1 !important; }
}
`;
