"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import {
  IDENTITY,
  MAX_SCALE,
  clampZoom,
  fitCard,
  isSwipe,
  pinch,
  toggleZoom,
  zoomAt,
  type Size,
  type Zoom,
} from "@/lib/memorecards-zoom";

// Full-screen MemoreCards (Justin, 2026-09-23: "the card looks kind of small").
// The card as large as the screen allows, on a dark stage, with the SAME sequence
// controls as the page — the theme-to-theme continuity carries on in here.
//
//   · desktop / Android: the real Fullscreen API (browser chrome disappears);
//     iPhone Safari has no element fullscreen, so there it is a full-window layer.
//   · zoom: pinch, double-tap / double-click, mouse wheel, the − / + buttons, or
//     the + / − / 0 keys. While enlarged, a drag MOVES the card; only an
//     un-zoomed swipe changes card, so reading a detail never skips a card.
//   · Esc (or X) closes; ← / → keep working (the viewer's own key handler).

type Pt = { x: number; y: number };

export function MemorecardsFullscreen({
  card,
  alt,
  themeTitle,
  themeLabel,
  counter,
  nextLabel,
  canPrev,
  onPrev,
  onNext,
  onClose,
}: {
  card: { url: string; width: number; height: number };
  alt: string;
  themeTitle: string;
  /** "Tema 2 / 6" */
  themeLabel: string;
  /** "3 / 5" */
  counter: string;
  nextLabel: string;
  canPrev: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<Zoom>(IDENTITY);
  const [animate, setAnimate] = useState(false);
  const [zoomedOnce, setZoomedOnce] = useState(false);

  const ratio = card.width / card.height;
  const fitted = fitCard(stage, ratio);

  // Keep the latest values reachable from native listeners without re-binding them.
  const live = useRef({ zoom, fitted, stage });

  // A new card always starts whole.
  const [shownUrl, setShownUrl] = useState(card.url);
  if (shownUrl !== card.url) {
    setShownUrl(card.url);
    setZoom(IDENTITY);
  }

  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    live.current = { zoom, fitted, stage };
    onCloseRef.current = onClose;
  });

  // ── Open / close: page scroll lock, real fullscreen where the browser has it ──
  const wentFullscreen = useRef(false);
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const el = rootRef.current;
    if (el && document.fullscreenEnabled && !document.fullscreenElement) {
      el.requestFullscreen({ navigationUI: "hide" })
        .then(() => {
          wentFullscreen.current = true;
        })
        .catch(() => {
          /* refused (iframe, policy): the full-window layer is still there */
        });
    }
    // Leaving browser fullscreen (Esc is taken by the browser for that) closes us too.
    function onFsChange() {
      if (wentFullscreen.current && !document.fullscreenElement) onCloseRef.current();
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // ── Stage size ──
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setZoomAnimated = useCallback((z: Zoom) => {
    setAnimate(true);
    setZoom(z);
    if (z.s > 1.01) setZoomedOnce(true);
  }, []);

  const stepZoom = useCallback(
    (factor: number) => {
      const { zoom: z, fitted: c, stage: st } = live.current;
      setZoomAnimated(zoomAt(z, z.s * factor, { x: 0, y: 0 }, c, st));
    },
    [setZoomAnimated],
  );

  // ── Keys: Esc closes; + / − / 0 zoom. (← / → belong to the viewer.) ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepZoom(1.5);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        stepZoom(1 / 1.5);
      } else if (e.key === "0") {
        e.preventDefault();
        setZoomAnimated(IDENTITY);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepZoom, setZoomAnimated]);

  // ── Mouse wheel zooms toward the cursor (native listener: must preventDefault) ──
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const { zoom: z, fitted: c, stage: st } = live.current;
      const r = el!.getBoundingClientRect();
      const at = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
      setAnimate(false);
      const next = zoomAt(z, z.s * Math.exp(-e.deltaY * 0.0015), at, c, st);
      setZoom(next);
      if (next.s > 1.01) setZoomedOnce(true);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Pointers: pinch, pan, swipe, double-tap ──
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{
    start: Zoom;
    origin: Pt; // first pointer, for pan + swipe
    startMid: Pt;
    startDist: number;
    pinched: boolean;
    moved: boolean;
    t0: number;
  } | null>(null);
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);

  function local(e: React.PointerEvent): Pt {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  }
  function midAndDist(): { mid: Pt; dist: number } {
    const [a, b] = [...pointers.current.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    setAnimate(false);
    if (pointers.current.size === 1) {
      gesture.current = { start: zoom, origin: p, startMid: p, startDist: 0, pinched: false, moved: false, t0: e.timeStamp };
    } else if (pointers.current.size === 2 && gesture.current) {
      const { mid, dist } = midAndDist();
      gesture.current = { ...gesture.current, start: zoom, startMid: mid, startDist: dist, pinched: true };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size >= 2) {
      const { mid, dist } = midAndDist();
      const next = pinch(g.start, g.startMid, g.startDist, mid, dist, fitted, stage);
      setZoom(next);
      if (next.s > 1.01) setZoomedOnce(true);
      g.moved = true;
      return;
    }
    const dx = p.x - g.origin.x;
    const dy = p.y - g.origin.y;
    if (Math.hypot(dx, dy) > 8) g.moved = true;
    if (g.start.s > 1.01) {
      setZoom(clampZoom({ s: g.start.s, x: g.start.x + dx, y: g.start.y + dy }, fitted, stage));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;

    if (pointers.current.size === 1) {
      // One finger left after a pinch: continue as a pan from here, never a swipe.
      const [rest] = [...pointers.current.values()];
      gesture.current = { ...g, start: live.current.zoom, origin: rest };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (g.pinched) return;

    const dx = p.x - g.origin.x;
    const dy = p.y - g.origin.y;
    if (!g.moved && e.timeStamp - g.t0 < 350) {
      // Tap. Two in quick succession, close together → zoom in / back out.
      const prev = lastTap.current;
      if (prev && e.timeStamp - prev.t < 320 && Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < 30) {
        lastTap.current = null;
        setZoomAnimated(toggleZoom(zoom, p, fitted, stage));
      } else {
        lastTap.current = { t: e.timeStamp, p };
      }
      return;
    }
    const dir = isSwipe(g.start, dx, dy);
    if (dir === 1) onNext();
    else if (dir === -1) onPrev();
  }

  const zoomed = zoom.s > 1.01;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`MemoreCards em tela cheia — ${themeTitle}`}
      className="mc-fs-in fixed inset-0 z-[100] flex flex-col bg-mc-stage text-mc-stage-fg"
    >
      {/* Top bar: where am I + close */}
      <div className="flex items-center gap-3 bg-mc-stage-bar px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-xs font-medium uppercase tracking-wider tabular-nums opacity-80">{themeLabel}</p>
          <p className="truncate text-sm font-semibold sm:text-base">{themeTitle}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar tela cheia"
          title="Fechar (Esc)"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-mc-stage-fg/10"
        >
          <X size={22} />
        </button>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className={`relative min-h-0 flex-1 overflow-hidden select-none ${zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {fitted.w > 0 && (
          // eslint-disable-next-line @next/next/no-img-element -- CDN image at intrinsic size; transformed by hand
          <img
            key={card.url}
            src={card.url}
            alt={alt}
            width={card.width}
            height={card.height}
            draggable={false}
            decoding="async"
            className="mc-fade pointer-events-none absolute left-1/2 top-1/2 max-w-none"
            style={{
              width: fitted.w,
              height: fitted.h,
              transform: `translate(-50%, -50%) translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
              transition: animate ? "transform 0.22s ease-out" : "none",
              willChange: "transform",
            }}
          />
        )}
      </div>

      {/* Bottom bar: ← | − n / N + | → */}
      <div className="bg-mc-stage-bar px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-5">
        {!zoomedOnce && (
          <p className="mb-1.5 text-center text-xs opacity-80">
            <span className="pointer-coarse:hidden">Role o mouse ou clique duas vezes para ampliar</span>
            <span className="hidden pointer-coarse:inline">Use dois dedos ou toque duas vezes para ampliar</span>
          </p>
        )}
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Card anterior"
            className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-mc-stage-fg/10 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft size={20} />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => stepZoom(1 / 1.5)}
              disabled={!zoomed}
              aria-label="Diminuir zoom"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:bg-mc-stage-fg/10 disabled:pointer-events-none disabled:opacity-40"
            >
              <Minus size={18} />
            </button>
            <p className="min-w-12 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {counter}
            </p>
            <button
              type="button"
              onClick={() => stepZoom(1.5)}
              disabled={zoom.s >= MAX_SCALE - 0.01}
              aria-label="Aumentar zoom"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:bg-mc-stage-fg/10 disabled:pointer-events-none disabled:opacity-40"
            >
              <Plus size={18} />
            </button>
          </div>

          <button
            type="button"
            onClick={onNext}
            aria-label={nextLabel}
            className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 sm:px-4"
          >
            <span className="hidden sm:inline">{nextLabel}</span>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
