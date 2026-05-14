"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion } from "motion/react";

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
          // ECG paper grid — CSS background survives canvas clearRect
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
      {/* Multi-trace ECG background animation */}
      <EcgBackground />

      {/* Vignette — darkens edges so tilted ECG plane fades naturally */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(139,123,255,0.10), transparent 65%)",
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
