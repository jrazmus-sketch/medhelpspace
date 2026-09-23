"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, List, RotateCcw, X } from "lucide-react";
import { enrollMemorecardReread } from "@/actions/review";
import {
  availableThemes,
  isThemeFinished,
  nextPosition,
  prevPosition,
  startPosition,
  type MemorecardTheme,
  type SequencePosition,
} from "@/lib/memorecards-shared";

// MemoreCards v2 viewer (Karina, 2026-09-23). MedVoice's layout — theme list on the
// left, the content on the right — with the audio player replaced by ONE image card
// at a time. Her rules, in the order she gave them:
//   · the student advances by hand; there is NO timer ("playlist" means an unbroken
//     sequence, not autoplay — cards differ in how long they take to read);
//   · the last card of a theme leads straight into the first card of the next theme
//     of the same specialty, with title, list and counters following along — the
//     student never has to return to an index;
//   · a theme without cards stays visible as "em breve" but is never in the sequence;
//   · the end of the specialty is a closing screen, not a jump to another specialty;
//   · the image is shown whole, at its own proportions, never cropped or stretched.

export function MemorecardsViewer({
  specialty,
  themes,
  initialSlug,
}: {
  specialty: { id: number; slug: string; name: string };
  /** Every theme of the specialty, in order — including those without cards yet. */
  themes: MemorecardTheme[];
  initialSlug?: string | null;
}) {
  const seq = useMemo(() => availableThemes(themes), [themes]);
  const upcoming = useMemo(() => themes.filter((t) => t.cards.length === 0), [themes]);
  const [pos, setPos] = useState<SequencePosition>(() => startPosition(seq, initialSlug));
  const [done, setDone] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const enrolled = useRef(new Set<number>());
  const viewerTop = useRef<HTMLDivElement>(null);

  const theme = seq[pos.theme];
  const card = theme?.cards[pos.card];

  // Keep ?tema= on the current theme, so a refresh or a shared link reopens it.
  useEffect(() => {
    if (!theme) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tema") !== theme.slug) {
      url.searchParams.set("tema", theme.slug);
      window.history.replaceState(null, "", url.toString());
    }
  }, [theme]);

  // Reaching a theme's last card counts it as studied: it joins the Revisão re-read
  // cycle (7 → 21 → 60 → 120 days), as a finished MemoreCards set always has.
  useEffect(() => {
    if (!theme || done || !isThemeFinished(seq, pos)) return;
    if (enrolled.current.has(theme.pageId)) return;
    enrolled.current.add(theme.pageId);
    enrollMemorecardReread(theme.pageId, specialty.id).catch(() => {
      enrolled.current.delete(theme.pageId); // let a later visit try again
    });
  }, [seq, pos, theme, done, specialty.id]);

  // Warm the neighbours so the swap is instant — including across a theme boundary.
  useEffect(() => {
    for (const q of [nextPosition(seq, pos), prevPosition(seq, pos)]) {
      if (!q || q === "end") continue;
      const c = seq[q.theme]?.cards[q.card];
      if (c) {
        const img = new window.Image();
        img.decoding = "async";
        img.src = c.url;
      }
    }
  }, [seq, pos]);

  const goNext = useCallback(() => {
    if (done) return;
    const n = nextPosition(seq, pos);
    if (n === "end") setDone(true);
    else setPos(n);
  }, [seq, pos, done]);

  const goPrev = useCallback(() => {
    if (done) {
      setDone(false);
      return;
    }
    const p = prevPosition(seq, pos);
    if (p) setPos(p);
  }, [seq, pos, done]);

  function openTheme(seqIndex: number) {
    setDone(false);
    setPos({ theme: seqIndex, card: 0 });
    setListOpen(false);
    viewerTop.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function restart() {
    setDone(false);
    setPos({ theme: 0, card: 0 });
    viewerTop.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ← / → on a keyboard (desktop). Ignored while typing anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  // Horizontal swipe on a phone. A mostly-vertical gesture is a scroll, not a swipe.
  const touch = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  if (!theme || !card) return null;

  const themeList = (
    <nav aria-label={`Temas de ${specialty.name}`}>
      <ol className="flex flex-col gap-1">
        {seq.map((t, i) => {
          const active = !done && i === pos.theme;
          return (
            <li key={t.pageId}>
              <button
                type="button"
                onClick={() => openTheme(i)}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-11 w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-brand-muted font-semibold text-brand"
                    : "text-foreground hover:bg-surface-2"
                }`}
              >
                <span className="mt-px w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 break-words leading-snug">{t.title}</span>
                <span className="mt-px shrink-0 text-xs tabular-nums text-muted-foreground">{t.cards.length}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {upcoming.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Em breve
          </p>
          <ul className="mt-1.5 flex flex-col">
            {upcoming.map((t) => (
              <li key={t.pageId} className="px-3 py-1.5 text-sm leading-snug text-muted-foreground">
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );

  const ratio = card.width / card.height;

  return (
    <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)] md:items-start">
      {/* ── Theme list: sticky column on desktop, a collapsible panel on a phone ── */}
      <aside className="hidden md:block md:sticky md:top-24 md:max-h-[calc(100svh-7rem)] md:overflow-y-auto md:pr-1">
        {themeList}
      </aside>

      <div ref={viewerTop} className="min-w-0 scroll-mt-24">
        {/* Where am I: theme position in the specialty + theme title */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0" aria-live="polite">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
              {done ? "Especialidade concluída" : `Tema ${pos.theme + 1} / ${seq.length}`}
            </p>
            <h2 className="mt-0.5 break-words text-lg font-semibold leading-snug text-foreground">
              {done ? specialty.name : theme.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setListOpen((o) => !o)}
            aria-expanded={listOpen}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 md:hidden"
          >
            {listOpen ? <X size={16} /> : <List size={16} />}
            Temas
          </button>
        </div>

        {listOpen && (
          <div className="mb-4 rounded-xl border border-border bg-surface-1 p-2 md:hidden">{themeList}</div>
        )}

        {done ? (
          <FinishedPanel specialtyName={specialty.name} onRestart={restart} />
        ) : (
          <>
            {/* The card: whole, at its own proportions. Width = what fits the screen
                height at this ratio, capped at the column — so a phone uses its full
                width and a desktop shows a comfortable, centred card. */}
            <div
              className="mx-auto [--mc-chrome:200px] md:[--mc-chrome:420px]"
              style={{
                width: `min(100%, max(240px, calc((100svh - var(--mc-chrome)) * ${ratio.toFixed(4)})))`,
              }}
            >
              <div
                className="relative overflow-hidden rounded-[var(--radius)] bg-surface-1 shadow-sm ring-1 ring-[var(--surface-2)] select-none"
                style={{ aspectRatio: `${card.width} / ${card.height}`, touchAction: "pan-y" }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- CDN image at intrinsic size; next/image adds nothing here */}
                <img
                  key={card.url}
                  src={card.url}
                  width={card.width}
                  height={card.height}
                  alt={`MemoreCard ${pos.card + 1} de ${theme.cards.length} — ${theme.title}`}
                  draggable={false}
                  decoding="async"
                  className="mc-fade absolute inset-0 h-full w-full object-contain"
                />
              </div>
            </div>

            {/* ← anterior | 3 / 7 | próximo → */}
            <div className="mx-auto mt-4 flex max-w-md items-center justify-between gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={pos.theme === 0 && pos.card === 0}
                className="flex min-h-11 min-w-11 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft size={18} />
                <span className="hidden sm:inline">Anterior</span>
              </button>
              <p className="text-sm font-semibold tabular-nums text-foreground" aria-live="polite">
                {pos.card + 1} / {theme.cards.length}
              </p>
              <button
                type="button"
                onClick={goNext}
                className="flex min-h-11 min-w-11 items-center gap-1 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
              >
                <span className="hidden sm:inline">
                  {pos.card === theme.cards.length - 1 && pos.theme < seq.length - 1 ? "Próximo tema" : "Próximo"}
                </span>
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FinishedPanel({ specialtyName, onRestart }: { specialtyName: string; onRestart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius)] bg-surface-1 px-6 py-12 text-center ring-1 ring-[var(--surface-2)]">
      <CheckCircle2 size={44} strokeWidth={1.6} className="text-brand" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">
        Você concluiu os MemoreCards de {specialtyName}.
      </h2>
      <div className="flex w-full max-w-xs flex-col gap-2.5">
        <button
          type="button"
          onClick={onRestart}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          <RotateCcw size={16} />
          Rever a especialidade
        </button>
        <Link
          href="/app/memorecards"
          className="flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
        >
          Escolher outra especialidade
        </Link>
      </div>
    </div>
  );
}
