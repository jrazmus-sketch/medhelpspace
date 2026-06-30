"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";
import { ForgettingCurve } from "./concepts/forgetting-curve";

/* The #1 differentiator: Revisão (spaced repetition), made visible with the
   forgetting curve.

   The background carries the section's argument: memory is bright (top-left)
   and decays into black (bottom-right); a ghost of the curve echoes behind the
   headline; the d1·d3·d7·d21 review rhythm breathes as glow nodes across the
   top band (rhyming with the chart's markers below). All decorative + behind
   the content; motion freezes under prefers-reduced-motion. */
export function RevisaoSection() {
  const ref = useReveal(0.12);

  return (
    <section
      className="relative overflow-hidden px-5 py-24 md:px-8 md:py-32"
      style={{ background: "var(--lp-alt)", borderTop: "1px solid var(--lp-border)" }}
    >
      <style>{RV_BG_CSS}</style>

      {/* Atmosphere — decorative, behind everything */}
      <div aria-hidden className="rv-bg">
        <div className="rv-bg-light" />
        <div className="rv-bg-dots" />
        <div className="rv-bg-ghost">
          <svg viewBox="0 0 820 360" preserveAspectRatio="none">
            <path
              className="rv-ghost-line"
              d="M70,46 Q82,78 90,88 L92,46 Q116,104 135,104 L137,46 Q186,124 224,120 L226,46 Q384,150 537,140 L539,46 Q650,84 762,104"
            />
            <path
              className="rv-ghost-decay"
              d="M70,46 C110,150 130,175 137,185 C175,230 200,250 226,258 C330,282 400,290 470,294 C570,298 660,300 762,300"
            />
          </svg>
        </div>
        <div className="rv-bg-rhythm">
          {["t1", "t2", "t3", "t4"].map((t) => (
            <div key={t} className={`rv-tick rv-${t}`}>
              <span className="rv-halo" />
              <span className="rv-wisp" />
              <span className="rv-node" />
            </div>
          ))}
        </div>
      </div>

      <div ref={ref} className="lp-reveal relative z-10 mx-auto max-w-3xl text-center">
        <div className="mb-8 text-[10px] uppercase tracking-[0.25em]" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--c-questoes)" }}>
          <SiteText as="span" k="revisao.eyebrow" fallback="O que ninguém mais tem no Revalida" />
        </div>
        <h2 className="text-[clamp(2rem,5vw,3.6rem)] font-black leading-[1.06] tracking-[-0.025em]" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
          <SiteText as="span" multiline k="revisao.headline" fallback="Quase ninguém é reprovado por não ter estudado. É por ter esquecido." />
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--lp-fg-40)" }}>
          <SiteText as="span" multiline k="revisao.body" fallback="Toda questão que você responde e todo flashcard que você vira entram numa fila de revisão. A repetição espaçada traz cada conteúdo de volta no momento exato antes de você esquecer — e o que você erra volta primeiro." />
        </p>
      </div>

      {/* The forgetting curve */}
      <div className="rv-chart-float relative z-10 mx-auto mt-12 max-w-3xl rounded-2xl p-5 sm:p-7" style={{ background: "var(--lp-base)", border: "1px solid var(--lp-border)" }}>
        <ForgettingCurve />
      </div>

      {/* Modes + kicker */}
      <div className="relative z-10 mx-auto mt-8 flex max-w-3xl flex-col items-center gap-5">
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {["Revisar hoje", "Só as que errei", "Pontos fracos"].map((m) => (
            <span
              key={m}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--c-questoes)",
                background: "color-mix(in srgb, var(--c-questoes) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--c-questoes) 30%, transparent)",
              }}
            >
              {m}
            </span>
          ))}
        </div>
        <p className="max-w-md text-center text-sm" style={{ color: "var(--lp-fg-40)" }}>
          <SiteText as="span" multiline k="revisao.kicker" fallback="É a mesma lógica dos cursões de R$6 mil — só que feita para o Revalida e já inclusa." />
        </p>
      </div>
    </section>
  );
}

/* Self-contained atmosphere for this section. Literal brand purple (122,29,145)
   matches the landing's existing gradient usage (see hero-section.tsx); the
   accent line/nodes use the --c-questoes token. */
const RV_BG_CSS = `
.rv-bg{ position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; }

/* decay lighting: memory bright (top-left) → forgotten black (bottom-right) */
.rv-bg-light{ position:absolute; inset:0;
  background:
    radial-gradient(120% 95% at 12% -10%, rgba(122,29,145,0.20), transparent 52%),
    radial-gradient(90% 90% at 108% 118%, rgba(0,0,0,0.65), transparent 55%); }

/* decaying dot grid, fading out toward the right */
.rv-bg-dots{ position:absolute; inset:0;
  background-image:radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.4px);
  background-size:26px 26px;
  -webkit-mask-image:linear-gradient(105deg, #000 0%, rgba(0,0,0,0.5) 38%, transparent 72%);
          mask-image:linear-gradient(105deg, #000 0%, rgba(0,0,0,0.5) 38%, transparent 72%); }

/* ghost echo of the curve behind the headline */
.rv-bg-ghost{ position:absolute; left:-4%; right:-4%; top:18%; width:108%; opacity:0.5; filter:blur(0.4px); }
.rv-bg-ghost svg{ width:100%; height:auto; display:block; }
.rv-ghost-line{ fill:none; stroke:var(--c-questoes); stroke-width:2.5; opacity:0.10; }
.rv-ghost-decay{ fill:none; stroke:#fff; stroke-width:2; opacity:0.05; stroke-dasharray:6 6; }

/* spaced rhythm — restrained breathing nodes in the top band (d1·d3·d7 … d21) */
.rv-bg-rhythm .rv-tick{ position:absolute; top:7%; }
.rv-wisp{ position:absolute; top:0; left:0; width:1px; height:118px;
  background:linear-gradient(to bottom, color-mix(in srgb, var(--c-questoes) 50%, transparent) 0%, rgba(122,29,145,0.10) 42%, transparent 95%); }
.rv-node{ position:absolute; top:0; left:0; width:6px; height:6px; border-radius:999px; transform:translate(-50%,-50%);
  background:var(--c-questoes); box-shadow:0 0 12px 2px color-mix(in srgb, var(--c-questoes) 65%, transparent);
  animation:rvNodePulse 5.5s ease-in-out infinite; }
.rv-halo{ position:absolute; top:0; left:0; width:90px; height:90px; transform:translate(-50%,-50%);
  background:radial-gradient(circle, rgba(122,29,145,0.22), transparent 68%);
  animation:rvHaloPulse 5.5s ease-in-out infinite; }
.rv-t1{ left:15%; } .rv-t1 .rv-node, .rv-t1 .rv-halo{ animation-delay:0s; }
.rv-t2{ left:24%; } .rv-t2 .rv-node, .rv-t2 .rv-halo{ animation-delay:0.7s; }
.rv-t3{ left:39%; } .rv-t3 .rv-node, .rv-t3 .rv-halo{ animation-delay:1.4s; }
.rv-t4{ left:77%; } .rv-t4 .rv-node, .rv-t4 .rv-halo{ animation-delay:2.6s; }
@keyframes rvNodePulse{ 0%,100%{ opacity:0.4; } 50%{ opacity:0.95; } }
@keyframes rvHaloPulse{ 0%,100%{ opacity:0.3; transform:translate(-50%,-50%) scale(0.82); } 50%{ opacity:0.85; transform:translate(-50%,-50%) scale(1.08); } }

/* floating chart card — purple bloom + drop glow */
.rv-chart-float{ box-shadow:0 40px 120px -40px rgba(122,29,145,0.55); }
.rv-chart-float::before{ content:""; position:absolute; inset:-40px; z-index:-1; border-radius:32px;
  background:radial-gradient(60% 70% at 30% 30%, rgba(122,29,145,0.22), transparent 70%); filter:blur(20px); }

@media (prefers-reduced-motion:reduce){
  .rv-node, .rv-halo{ animation:none !important; }
}
`;
