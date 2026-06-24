"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SiteCompletion } from "@/lib/progress/site-completion";

// ── reduced-motion ──────────────────────────────────────────────────────────────
// useSyncExternalStore keeps this hydration-safe and avoids setState-in-effect.

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

// ── Full-width meter line (the "single glance" piece) ─────────────────────────────
// Pinned to the header's bottom edge. Draws itself left→right on mount with a soft
// glow tracking the leading edge. aria-hidden — the pill carries the semantics.

export function SiteProgressLine({ pct }: { pct: number }) {
  const reduced = usePrefersReducedMotion();
  const [w, setW] = useState(0);

  useEffect(() => {
    if (reduced) return; // reduced users render at `pct` directly — no animation
    // Two RAFs so the browser paints the 0% start frame before transitioning.
    let raf2 = 0;
    const target = pct > 0 ? Math.max(pct, 2) : 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setW(target));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pct, reduced]);

  // Keep a small minimum so an early-journey value (e.g. 1%) still reads as a
  // visible nub rather than nothing; the pill carries the exact number.
  const visual = pct > 0 ? Math.max(pct, 2) : 0;
  const fillW = reduced ? visual : w;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: -1,
        height: 3,
        background: "color-mix(in srgb, var(--brand) 9%, transparent)",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          width: `${fillW}%`,
          background:
            "linear-gradient(90deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 40%, var(--brand-2, #c084e8)) 100%)",
          borderRadius: "0 2px 2px 0",
          transition: reduced ? "none" : "width 1s cubic-bezier(.16,1,.3,1)",
          boxShadow: "0 0 6px color-mix(in srgb, var(--brand) 35%, transparent)",
        }}
      >
        {/* Leading-edge glow — rides the right end of the fill as it draws. */}
        {pct > 0 && (
          <span
            className="mhs-progress-glow"
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              width: 7,
              height: 7,
              transform: "translate(50%, -50%)",
              borderRadius: "50%",
              background: "var(--brand-2, #c084e8)",
              boxShadow: "0 0 8px 1px color-mix(in srgb, var(--brand) 70%, transparent)",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Ring ──────────────────────────────────────────────────────────────────────
// Mirrors content/specialty-card.tsx ProgressRing — same dasharray technique.

function Ring({ value, size = 19 }: { value: number; size?: number }) {
  const swTrack = 2;
  const swFill = 3;
  const r = (size - swFill) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, value / 100));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "color-mix(in srgb, var(--brand) 18%, transparent)", strokeWidth: swTrack }} />
      {value > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{
            stroke: "var(--brand)",
            strokeWidth: swFill,
            strokeDasharray: `${dash} ${c}`,
            strokeLinecap: "round",
            transition: "stroke-dasharray .9s cubic-bezier(.16,1,.3,1)",
          }}
        />
      )}
    </svg>
  );
}

// ── Pill + "Sua jornada" popover ────────────────────────────────────────────────

export function SiteProgressPill({ data }: { data: SiteCompletion }) {
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [ringValue, setRingValue] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef<number | null>(null);

  // Viewport-clamped placement: right-align the panel to the trigger, then keep
  // it fully on-screen. The pill sits mid-cluster, so a naive right-0 anchor
  // would run off the left edge on a phone. Fixed-positioned so it never clips.
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const rect = el.getBoundingClientRect();
    const width = Math.min(280, vw - 16);
    let left = rect.right - width; // panel right edge aligns to the pill
    left = Math.max(8, Math.min(left, vw - width - 8));
    setPos({ top: Math.round(rect.bottom + 8), left: Math.round(left), width });
  }, []);

  const toggle = () => {
    if (!open) place();
    setOpen((v) => !v);
  };

  // Count-up + ring draw on mount. All state writes happen inside RAF callbacks
  // (async — never synchronously in the effect body).
  useEffect(() => {
    if (reduced) return; // reduced users render at the final value directly
    const raf0 = requestAnimationFrame(() => setRingValue(data.overallPct)); // CSS transition draws the stroke
    const duration = 1100;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setCount(Math.round(eased * data.overallPct));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [data.overallPct, reduced]);

  const displayCount = reduced ? data.overallPct : count;
  const displayRing = reduced ? data.overallPct : ringValue;

  // Click-outside + Esc to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Keep the panel pinned to the trigger as the viewport resizes / page scrolls.
  useEffect(() => {
    if (!open) return;
    const on = () => place();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, place]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Sua jornada: ${data.overallPct}% do conteúdo concluído`}
        className="flex h-8 items-center gap-1 rounded-[5px] pl-1.5 pr-1.5 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40 data-[open=true]:bg-accent"
        data-open={open}
      >
        <Ring value={displayRing} />
        <span
          className="hidden tabular-nums min-[440px]:inline"
          style={{ fontFamily: "var(--font-display, sans-serif)", fontSize: 13, fontWeight: 600, letterSpacing: "-.02em", color: "var(--foreground)" }}
        >
          {displayCount}%
        </span>
        {/* Disclosure caret — signals the pill opens a panel; also gives a visible
            affordance on phones <440px where the % label is hidden. */}
        <ChevronDown
          aria-hidden="true"
          className="h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && pos && (
        <div
          role="dialog"
          aria-label="Sua jornada"
          className="fixed z-50 origin-top-right overflow-hidden rounded-[6px] border border-border bg-popover shadow-lg"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            animation: reduced ? undefined : "site-pop-in .16s cubic-bezier(.16,1,.3,1)",
          }}
        >
          {/* Headline */}
          <div className="flex items-end justify-between gap-3 border-b border-border/60 px-4 pb-3 pt-3.5">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sua jornada</div>
              <div className="mt-1 text-[11.5px] tabular-nums text-muted-foreground" style={{ fontFamily: "var(--font-geist-mono)" }}>
                {data.done.toLocaleString("pt-BR")} de {data.total.toLocaleString("pt-BR")} itens
              </div>
            </div>
            <div
              className="tabular-nums leading-none"
              style={{ fontFamily: "var(--font-display, sans-serif)", fontSize: 30, fontWeight: 700, letterSpacing: "-.03em", color: "var(--brand)" }}
            >
              {data.overallPct}%
            </div>
          </div>

          {/* Pillars */}
          <div className="flex flex-col gap-3 px-4 py-3.5">
            {data.pillars.map((p, i) => (
              <div key={p.key}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                    <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
                    {p.label}
                  </span>
                  <span className="tabular-nums text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    {p.done.toLocaleString("pt-BR")}/{p.total.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${p.pct}%`,
                      background: p.color,
                      borderRadius: 9999,
                      // Grows from 0 to its inline width, staggered per pillar.
                      animation: reduced ? undefined : `site-bar-grow .7s cubic-bezier(.16,1,.3,1) ${80 + i * 90}ms both`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/app/relatorio"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 text-[12px] font-medium text-brand transition-colors hover:bg-accent"
          >
            Ver relatório completo
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
