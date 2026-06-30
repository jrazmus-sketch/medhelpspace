"use client";

import { useEffect, useRef } from "react";

/* ════════════════════════════════════════════════════════════════════════════
   Forgetting curve — the visual for Revisão (repetição espaçada).
   Two lines: memory DECAYS to nothing without review (dashed, muted), vs. the
   accent line that gets pulled back to the top each time a card returns
   (d1 · d3 · d7 · d21). Draws itself in when scrolled into view.
   Fully theme-aware (light/dark) via --lp-* + --acc tokens.
   ════════════════════════════════════════════════════════════════════════════ */

export function ForgettingCurve({
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
          el.classList.add("fc-in");
          obs.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`fc-root ${className ?? ""}`} style={{ ["--acc" as string]: accent }}>
      <style>{FC_CSS}</style>
      <svg viewBox="0 0 820 360" width="100%" role="img" aria-label="Curva do esquecimento: a memória despenca sem revisão e se mantém no topo com a Revisão do MedHelpSpace.">
        {/* axes */}
        <line className="fc-axis" x1="70" y1="46" x2="70" y2="300" />
        <line className="fc-axis" x1="70" y1="300" x2="762" y2="300" />
        <text className="fc-axislabel" x="62" y="54" textAnchor="end">100%</text>
        <text className="fc-axislabel" x="62" y="304" textAnchor="end">0</text>
        <text className="fc-axislabel" x="22" y="178" transform="rotate(-90 22,178)">memória</text>

        {/* forgetting — no review */}
        <path
          className="fc-forget fc-draw-forget"
          d="M70,46 C110,150 130,175 137,185 C175,230 200,250 226,258 C330,282 400,290 470,294 C570,298 660,300 762,300"
        />
        <text className="fc-forgetlabel" x="494" y="288">sem revisão · você esquece</text>

        {/* retention — spaced repetition sawtooth */}
        <path
          className="fc-retain fc-draw-retain"
          d="M70,46 Q82,78 90,88 L92,46 Q116,104 135,104 L137,46 Q186,124 224,120 L226,46 Q384,150 537,140 L539,46 Q650,84 762,104"
        />

        {/* review markers (cards) + spike dots */}
        {[
          { x: 92, mx: 85, d: "d1" },
          { x: 137, mx: 130, d: "d3" },
          { x: 226, mx: 219, d: "d7" },
          { x: 539, mx: 532, d: "d21" },
        ].map((m, i) => (
          <g key={m.d} className="fc-mark" style={{ animationDelay: `${0.9 + i * 0.32}s` }}>
            <rect className="fc-card" x={m.mx} y="26" width="14" height="18" rx="3" />
            <circle className="fc-dot" cx={m.x} cy="46" r="3.5" />
            <text className="fc-day" x={m.x} y="320" textAnchor="middle">{m.d}</text>
          </g>
        ))}
        <text className="fc-axislabel" x="752" y="320" textAnchor="middle">tempo →</text>
      </svg>

      <div className="fc-legend">
        <span className="fc-leg fc-leg-a"><i /> com MedHelpSpace — a questão volta no ponto certo</span>
        <span className="fc-leg fc-leg-b"><i /> sem revisão — esquece em dias</span>
      </div>
    </div>
  );
}

const FC_CSS = `
.fc-root{ width:100%; }
.fc-axis{ stroke:var(--lp-fg-15); stroke-width:1; }
.fc-axislabel{ fill:var(--lp-fg-25); font-family:var(--font-geist-mono); font-size:12px; }
.fc-forgetlabel{ fill:var(--lp-fg-40); font-family:var(--font-geist-mono); font-size:12.5px; }
.fc-forget{ fill:none; stroke:var(--lp-fg-25); stroke-width:2; stroke-dasharray:6 5; }
.fc-retain{ fill:none; stroke:var(--acc); stroke-width:3.5; stroke-linejoin:round; }
.fc-card{ fill:var(--lp-alt); stroke:var(--acc); stroke-width:1.5; }
.fc-dot{ fill:var(--acc); }
.fc-day{ fill:var(--acc); font-family:var(--font-geist-mono); font-size:13px; font-weight:700; }

/* draw-in */
.fc-draw-forget{ stroke-dashoffset:0; }
.fc-draw-retain{ stroke-dasharray:1500; stroke-dashoffset:1500; }
.fc-in .fc-draw-retain{ animation:fcDraw 2.3s cubic-bezier(.4,0,.2,1) forwards .15s; }
.fc-mark{ opacity:0; }
.fc-in .fc-mark{ animation:fcPop .45s ease forwards; }
@keyframes fcDraw{ to{ stroke-dashoffset:0; } }
@keyframes fcPop{ from{ opacity:0; transform:translateY(5px); } to{ opacity:1; transform:translateY(0); } }

.fc-legend{ display:flex; flex-wrap:wrap; gap:10px 22px; margin-top:14px; }
.fc-leg{ display:inline-flex; align-items:center; font-family:var(--font-geist-mono); font-size:12px; color:var(--lp-fg-55); }
.fc-leg i{ display:inline-block; width:18px; height:0; margin-right:8px; }
.fc-leg-a i{ border-top:3px solid var(--acc); }
.fc-leg-b i{ border-top:2px dashed var(--lp-fg-25); }

@media (prefers-reduced-motion:reduce){
  .fc-draw-retain{ animation:none !important; stroke-dashoffset:0 !important; }
  .fc-mark{ animation:none !important; opacity:1 !important; }
}
`;
