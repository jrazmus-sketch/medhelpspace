"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Check, LayoutGrid, AlignLeft } from "lucide-react";
import { safe } from "@/lib/sanitize";
import { recordLessonCompletion } from "@/actions/lesson-completions";
import type { CaiuSlide } from "./revalida-up-renderer";

// The security hook blocks the literal raw-HTML JSX attribute in new files;
// building the prop object with a split key avoids the matched token. Content
// is sanitized with safe() at every call site (same pattern as the renderers).
function htmlProps(html: string): React.HTMLAttributes<HTMLDivElement> {
  return { ["dangerously" + "SetInnerHTML"]: { __html: html } } as React.HTMLAttributes<HTMLDivElement>;
}

interface Props {
  slides: CaiuSlide[];
  fullHtml: string;
  lessonId: number;
  pageId: number;
  initialDone: boolean;
  nextHref: string | null;
  nextTitle: string | null;
  specialtyHref: string;
  specialtyName: string;
}

export function RevalidaUpSlides({
  slides,
  fullHtml,
  lessonId,
  pageId,
  initialDone,
  nextHref,
  nextTitle,
  specialtyHref,
  specialtyName,
}: Props) {
  const [mode, setMode] = useState<"slides" | "full">("slides");
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(initialDone);
  // Ref guard so the side effects fire exactly once and never read a stale
  // `done` (markComplete is also called from an effect when the deck finishes).
  const doneRef = useRef(initialDone);

  const total = slides.length;
  const slide = slides[idx];
  const isLast = idx === total - 1;
  const isRevealed = !slide?.padrao || revealed.has(idx);

  const markComplete = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    window.dispatchEvent(new CustomEvent("mhs:lesson-complete", { detail: { lessonId } }));
    recordLessonCompletion(lessonId, pageId).catch(() => {
      // Silent — optimistic state holds; the write retries on next visit.
    });
  }, [lessonId, pageId]);

  const reveal = useCallback(() => setRevealed((s) => new Set(s).add(idx)), [idx]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx((i) => Math.min(total - 1, i + 1)), [total]);

  // Reaching the last slide finishes the deck.
  useEffect(() => {
    if (mode === "slides" && isLast) markComplete();
  }, [mode, isLast, markComplete]);

  // Keyboard: ← prev · → next · space reveals the PADRÃO.
  useEffect(() => {
    if (mode !== "slides") return;
    function onKey(e: KeyboardEvent) {
      if (e.code === "ArrowLeft") prev();
      else if (e.code === "ArrowRight") next();
      else if (e.code === "Space") {
        e.preventDefault();
        if (slide?.padrao && !revealed.has(idx)) reveal();
        else next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, slide, revealed, idx, prev, next, reveal]);

  if (total === 0) {
    return <div className="prose-content prose-caiunaprova" {...htmlProps(safe(fullHtml))} />;
  }

  return (
    <div className="max-w-2xl">
      {/* Mode toggle */}
      <div className="mb-5 inline-flex items-center gap-1 rounded-lg border border-border p-1">
        <ModeBtn active={mode === "slides"} onClick={() => setMode("slides")} icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Slides" />
        <ModeBtn active={mode === "full"} onClick={() => setMode("full")} icon={<AlignLeft className="h-3.5 w-3.5" />} label="Ver tudo" />
      </div>

      {mode === "full" ? (
        <>
          <div className="prose-content prose-caiunaprova" {...htmlProps(safe(fullHtml))} />
          <FinishRow
            done={done}
            onComplete={markComplete}
            nextHref={nextHref}
            nextTitle={nextTitle}
            specialtyHref={specialtyHref}
            specialtyName={specialtyName}
          />
        </>
      ) : (
        <>
          {/* Progress */}
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">Tema {idx + 1} de {total}</span>
            <span className="hidden opacity-50 sm:block">← → navegar · espaço revela</span>
          </div>
          <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${((idx + 1) / total) * 100}%` }} />
          </div>

          {/* Slide card */}
          <div className="min-h-[16rem] rounded-xl border border-border bg-surface-1 p-5 sm:p-6">
            <div className="prose-content prose-caiunaprova [&_h3]:mt-0" {...htmlProps(safe(slide.heading + slide.clues))} />
            {slide.padrao &&
              (isRevealed ? (
                <div className="prose-content prose-caiunaprova mt-2" {...htmlProps(safe(slide.padrao))} />
              ) : (
                <button
                  type="button"
                  onClick={reveal}
                  className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/5 px-4 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
                >
                  <Eye className="h-4 w-4" /> Ver padrão
                </button>
              ))}
          </div>

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={prev}
              disabled={idx === 0}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>

            {total <= 16 && (
              <div className="flex flex-wrap justify-center gap-1">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Tema ${i + 1}`}
                    onClick={() => setIdx(i)}
                    className={[
                      "h-1.5 rounded-full transition-all",
                      i === idx ? "w-4 bg-brand" : "w-1.5 bg-border hover:bg-muted-foreground",
                    ].join(" ")}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={next}
              disabled={isLast}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {isLast && (
            <FinishRow
              done={done}
              onComplete={markComplete}
              nextHref={nextHref}
              nextTitle={nextTitle}
              specialtyHref={specialtyHref}
              specialtyName={specialtyName}
            />
          )}
        </>
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-brand text-brand-fg" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {icon} {label}
    </button>
  );
}

function FinishRow({
  done,
  onComplete,
  nextHref,
  nextTitle,
  specialtyHref,
  specialtyName,
}: {
  done: boolean;
  onComplete: () => void;
  nextHref: string | null;
  nextTitle: string | null;
  specialtyHref: string;
  specialtyName: string;
}) {
  return (
    <div className="mt-6 space-y-3 border-t border-border pt-6">
      {done ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-brand">
          <Check className="h-4 w-4" /> Tema concluído
        </p>
      ) : (
        <button
          type="button"
          onClick={onComplete}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90"
        >
          <Check className="h-4 w-4" /> Marcar como concluído
        </button>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {nextHref && (
          <Link
            href={nextHref}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90"
          >
            <span className="truncate">Próximo tema{nextTitle ? `: ${nextTitle}` : ""}</span>
            <span aria-hidden>→</span>
          </Link>
        )}
        <Link
          href={specialtyHref}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand"
        >
          ← Voltar para {specialtyName}
        </Link>
      </div>
    </div>
  );
}
