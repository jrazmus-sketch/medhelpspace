"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { SiteText } from "./site-text";

function ecgSample(phase: number): number {
  // Flat isoelectric baseline
  if (phase < 0.38) return 0;
  // P wave — naturally rounded, sin is authentic
  if (phase < 0.46) return Math.sin(((phase - 0.38) / 0.08) * Math.PI) * 0.13;
  // PR flat
  if (phase < 0.50) return 0;
  // Q — sharp linear downstroke
  if (phase < 0.514) return -((phase - 0.50) / 0.014);
  // R upstroke — near-vertical linear spike (goes from -1.0 to +1.0)
  if (phase < 0.530) return -1 + ((phase - 0.514) / 0.016) * 2.0;
  // R peak clamp
  if (phase < 0.536) return 1.0;
  // R downstroke — near-vertical linear spike
  if (phase < 0.558) return 1.0 - ((phase - 0.536) / 0.022) * 1.28;
  // S to baseline — linear recovery
  if (phase < 0.576) return -0.28 + ((phase - 0.558) / 0.018) * 0.28;
  // ST flat
  if (phase < 0.63) return 0;
  // T wave — moderate rounded dome (sin is authentic for T wave)
  if (phase < 0.82) return Math.sin(((phase - 0.63) / 0.19) * Math.PI) * 0.18;
  return 0;
}

function EcgBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas: HTMLCanvasElement = canvasRef.current;

    const ctxOrNull = canvas.getContext("2d");
    if (!ctxOrNull) return;
    const ctx: CanvasRenderingContext2D = ctxOrNull;

    const CYCLE = 900;
    const SPEED = 2.2;
    let W = 0, H = 0;
    let MID = 0;
    let AMP = 0;

    // Rolling point history — the full path is redrawn each frame from this buffer.
    // This eliminates dot-chain artifacts and lets the browser anti-alias the whole polyline.
    type Pt = { x: number; y: number };
    const pts: Pt[] = [];
    let runX = 0;
    let raf: number;

    function strokeSeg(seg: Pt[], width: number, color: string) {
      if (seg.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(seg[0].x, seg[0].y);
      for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";  // ECG peaks are always sharp/angular
      ctx.miterLimit = 10;
      ctx.stroke();
    }

    // Retry until the canvas has non-zero layout dimensions (layout may not be
    // ready at useEffect mount time when the parent is absolutely positioned).
    function init() {
      const nW = canvas.offsetWidth || window.innerWidth;
      const nH = canvas.offsetHeight || window.innerHeight;
      if (!nW || !nH) { raf = requestAnimationFrame(init); return; }
      W = nW; H = nH;
      canvas.width = W; canvas.height = H;
      MID = H * 0.48; AMP = H * 0.18;
      frame();
    }

    function frame() {
      runX += SPEED;
      pts.push({ x: runX % W, y: MID - ecgSample((runX % CYCLE) / CYCLE) * AMP });
      // 80% coverage — 20% deliberate gap that sweeps like a real ECG monitor scan.
      if (pts.length > Math.ceil((W * 0.80) / SPEED)) pts.shift();

      ctx.clearRect(0, 0, W, H);

      if (pts.length < 2) { 
        ctx.fillStyle = "rgba(8,3,26,0.40)";
        ctx.fillRect(0, 0, W, H);
        raf = requestAnimationFrame(frame); 
        return; 
      }

      // Split at canvas wrap-around points
      const segs: Pt[][] = [];
      let seg: Pt[] = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i].x - pts[i - 1].x) > SPEED * 4) { segs.push(seg); seg = []; }
        seg.push(pts[i]);
      }
      segs.push(seg);

      // 2-pass stroke: wide soft glow + crisp bright core
      segs.forEach(s => {
        strokeSeg(s, 16, "rgba(110,70,230,0.055)");
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = "rgba(140,100,255,0.75)";
        strokeSeg(s, 2, "rgba(205,182,255,0.64)");
        ctx.restore();
      });

      // Intentional scan-line gap: fade the trace ends so the gap looks deliberate.
      const t0x = pts[0].x;               // tail (oldest point) x
      const tNx = pts[pts.length - 1].x;  // head (newest point) x
      // Scale FADE to screen width so it never exceeds the gap on small screens
      const FADE = Math.max(1, Math.min(W * 0.08, 100));

      ctx.globalCompositeOperation = "destination-out";

      const gradErase = (x0: number, x1: number, a0: number, a1: number) => {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, `rgba(0,0,0,${a0})`);
        g.addColorStop(1, `rgba(0,0,0,${a1})`);
        ctx.fillStyle = g;
        ctx.fillRect(x0, 0, x1 - x0, H);
      };

      // 1. Tail fade: erase from t0x tapering to 0 going FADE px rightward into trace
      const tailEnd = t0x + FADE;
      if (tailEnd <= W) {
        gradErase(t0x, tailEnd, 1, 0);
      } else {
        const alphaAtW = 1 - (W - t0x) / FADE;
        gradErase(t0x, W, 1, alphaAtW);
        gradErase(0, tailEnd - W, alphaAtW, 0);
      }

      // 2. Head fade: 0 at (tNx - FADE) tapering to 1 at tNx
      const headStart = tNx - FADE;
      if (headStart >= 0) {
        gradErase(headStart, tNx, 0, 1);
      } else {
        const alphaAt0 = 1 - tNx / FADE;
        gradErase(W + headStart, W, 0, alphaAt0);
        gradErase(0, tNx, alphaAt0, 1);
      }

      // 3. Draw the dark background *behind* the faded trace so we don't double-darken the gap
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "rgba(8,3,26,0.40)";
      ctx.fillRect(0, 0, W, H);
      
      // Restore default composite operation for the next frame
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(frame);
    }

    init();

    function onResize() {
      const nW = canvas.offsetWidth || window.innerWidth;
      const nH = canvas.offsetHeight || window.innerHeight;
      if (nW === W && nH === H) return;
      W = nW; H = nH;
      canvas.width = W; canvas.height = H;
      MID = H * 0.48; AMP = H * 0.18;
      pts.length = 0; runX = 0;
    }
    window.addEventListener("resize", onResize, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);

  return (
    // Outer clip: keeps rotated corners inside the section
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 1 }} aria-hidden="true">
      {/* Inner: 15% oversized so rotated corners don't peek through, centered transform */}
      <div
        style={{
          position: "absolute",
          inset: "-15% -8%",
          backgroundImage: [
            "linear-gradient(rgba(120,90,220,0.18) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(120,90,220,0.18) 1px, transparent 1px)",
            "linear-gradient(rgba(100,70,200,0.08) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(100,70,200,0.08) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "80px 80px, 80px 80px, 20px 20px, 20px 20px",
          transform: "perspective(1000px) rotateX(22deg)",
          transformOrigin: "50% 50%",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}

/* The old fabricated QuizCard / MedVoiceCard previews were replaced by a real
   in-hand app screenshot (public/landing/hero-medvoice.webp). */

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      id="hero-section"
      className="relative flex min-h-[100svh] flex-col items-center justify-start overflow-hidden px-5 pb-0 pt-24 text-center md:px-8"
      style={{
        background: "radial-gradient(ellipse 160% 90% at 50% 20%, #140830 0%, #08031a 50%, #020108 100%)",
      }}
    >
      {/* Multi-trace ECG background animation */}
      <EcgBackground />

      {/* Vignette — darkens edges so tilted ECG plane fades naturally */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(122,29,145,0.18), transparent 65%)",
            "radial-gradient(ellipse 100% 60% at 50% 0%, rgba(2,1,8,0.55), transparent 55%)",
            "linear-gradient(to right, rgba(2,1,8,0.35) 0%, transparent 20%, transparent 80%, rgba(2,1,8,0.35) 100%)",
          ].join(", "),
          zIndex: 2,
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
          className="mb-8 text-sm uppercase tracking-[0.22em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.32)" }}
        >
          <SiteText as="span" k="hero.eyebrow" fallback="1ª etapa do Revalida · prova teórica" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.65 }}
          className="max-w-4xl text-[clamp(3rem,7.5vw,6.5rem)] font-black leading-[1.01] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-bricolage)", color: "#ffffff" }}
        >
          <SiteText as="span" k="hero.headline" fallback="Você já é médico." />
          <br />
          <span style={{ color: "#c084e8" }}>
            <SiteText as="span" k="hero.headline2" fallback="Falta o Brasil reconhecer." />
          </span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.20, duration: 0.55 }}
          className="relative isolate mt-7 w-full max-w-md"
        >
          {/* Soft scrim so the bright ECG trace doesn't cut through this
              lower-contrast subhead. Sits above the ECG layer (it's inside the
              z-10 content stack) but behind the text (-z-10 within this isolated
              wrapper). Tinted to the section's darkest bg tone so it reads as a
              natural darkening, not a visible box. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[210%] w-[130%] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(2,1,8,0.9) 0%, rgba(2,1,8,0.62) 42%, transparent 72%)",
              filter: "blur(8px)",
            }}
          />
          <p
            className="text-base leading-relaxed sm:text-lg"
            style={{ color: "rgba(255,255,255,0.6)", textShadow: "0 1px 12px rgba(2,1,8,0.7)" }}
          >
            <SiteText as="span" multiline k="hero.subhead" fallback="Não é curso. Não é videoaula. É o sistema que treina o raciocínio do Revalida — e faz você lembrar dele no dia da prova." />
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.27, duration: 0.50 }}
          className="mt-10 flex w-full flex-col items-center gap-4"
        >
          <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/loja"
              className="w-full rounded-xl px-8 py-4 text-center text-base font-bold text-white transition-all hover:opacity-85 hover:-translate-y-px active:scale-95 sm:w-auto"
              style={{
                background: "var(--brand)",
                boxShadow: "0 0 40px rgba(122,29,145,0.45)",
              }}
            >
              <SiteText as="span" k="hero.cta" fallback="Comprar Agora →" />
            </Link>
            {/* Secondary, lower-commitment door for cold/skeptical traffic: the free
                sample test. utm_source=site separates these organic-homepage leads
                from paid-ad leads (which carry utm_source=google/etc.) in the leads
                table — the magnet page already plumbs UTM straight into the row. */}
            <Link
              href="/questoes-revalida?utm_source=site&utm_medium=hero&utm_campaign=home"
              className="w-full rounded-xl border px-8 py-4 text-center text-base font-semibold text-white transition-all hover:-translate-y-px hover:bg-white/5 active:scale-95 sm:w-auto"
              style={{ borderColor: "rgba(255,255,255,0.22)" }}
            >
              <SiteText as="span" k="hero.cta_free" fallback="Fazer o simulado grátis" />
            </Link>
          </div>
          <a
            href="#features"
            className="text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.32)" }}
          >
            <SiteText as="span" k="hero.secondary" fallback="Ver o sistema ↓" />
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.32, duration: 0.50 }}
          className="mt-6 hidden flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs md:flex"
          style={{ fontFamily: "var(--font-geist-mono)", color: "rgba(255,255,255,0.25)" }}
        >
          <SiteText as="span" k="hero.trust1" fallback="Acesso imediato" />
          <span className="hidden sm:block">·</span>
          <SiteText as="span" k="hero.trust2" fallback="Garantia de 7 dias" />
          <span className="hidden sm:block">·</span>
          <SiteText as="span" k="hero.trust3" fallback="Pagamento via PagBank" />
        </motion.div>

      </div>

      {/* Real app — MedVoice player in-hand. Kept in NORMAL FLOW (not absolute)
          as the last flex child, with the SAME treatment at every width so it
          always cuts at the section break (phone, tablet, desktop alike):
          - `mt-auto` parks it against the section bottom, soaking up any leftover
            height — critical on tall tablets where the copy is short and an
            absolute/fixed-margin phone would leave a big gap above the break.
          - the img's `translate-y-[15%]` bleeds it past the section edge where
            `overflow-hidden` clips it, so it reads as going behind the next section.
          In-flow means the copy can NEVER overlap it, no matter how short the
          viewport (mobile Safari's url-bar shrinks 100svh) — which is why this
          replaced the earlier `absolute bottom-0` version that overlapped the CTA. */}
      <div
        className="pointer-events-none mt-auto w-[84vw] max-w-[300px] sm:max-w-[360px]"
        style={{ zIndex: 6 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 44 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.85, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/hero-medvoice.webp"
            alt="MedHelpSpace no celular — player MedVoice em tela cheia"
            className="block w-full translate-y-[15%]"
            style={{ height: "auto", filter: "drop-shadow(0 6px 40px rgba(0,0,0,0.5))" }}
          />
        </motion.div>
      </div>

    </section>
  );
}
