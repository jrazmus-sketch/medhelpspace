"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { safe } from "@/lib/sanitize";
import { enrollMemorecardReread } from "@/actions/review";
import type { SlideData } from "./memorecards-renderer";

interface Props {
  slides: SlideData[];
  pageId: number;
  specialtyId: number | null;
  nextDeckHref: string | null;
  nextDeckTitle: string | null;
  specialtyHref: string;
  specialtyName: string;
}

function isCdnUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function MemorecardsPlayer({
  slides,
  pageId,
  specialtyId,
  nextDeckHref,
  nextDeckTitle,
  specialtyHref,
  specialtyName,
}: Props) {
  const [idx, setIdx] = useState(0);
  const enrolledRef = useRef(false);
  const slide = slides[idx];
  const total = slides.length;
  const isLast = idx === total - 1;

  // Finishing a deck schedules it for a re-read (passive spaced repetition).
  // Ref guard (not state) so it fires once without an extra render.
  useEffect(() => {
    if (isLast && !enrolledRef.current) {
      enrolledRef.current = true;
      void enrollMemorecardReread(pageId, specialtyId);
    }
  }, [isLast, pageId, specialtyId]);

  function prev() {
    setIdx((i) => Math.max(0, i - 1));
  }

  function next() {
    setIdx((i) => Math.min(total - 1, i + 1));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "ArrowLeft") prev();
      if (e.code === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Slide {idx + 1} de {total}</span>
        <span className="hidden sm:block text-xs opacity-50">← → para navegar</span>
      </div>
      <div className="h-1 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-all duration-300"
          style={{ width: `${((idx + 1) / total) * 100}%` }}
        />
      </div>

      {/* Slide card */}
      <div className="min-h-56 rounded-xl border border-border overflow-hidden bg-surface-1">
        <SlideContent slide={slide} />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>

        {/* Dot indicators (up to 20 dots) */}
        {total <= 20 && (
          <div className="flex gap-1 flex-wrap justify-center">
            {slides.map((_, i) => (
              <button
                key={i}
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
          onClick={next}
          disabled={isLast}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          Próximo
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Completion footer — appears once user reaches the last slide */}
      {isLast && (
        <div className="mt-2 pt-4 border-t border-border space-y-3">
          <p className="text-sm text-muted-foreground">
            Você concluiu este conjunto de memorecards.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {nextDeckHref && (
              <Link
                href={nextDeckHref}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
              >
                <span className="truncate">
                  Próximo{nextDeckTitle ? `: ${nextDeckTitle}` : ""}
                </span>
                <span aria-hidden>→</span>
              </Link>
            )}
            <Link
              href={specialtyHref}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-brand/40 hover:text-brand transition-colors inline-flex items-center justify-center"
            >
              ← Voltar para {specialtyName}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SlideContent({ slide }: { slide: SlideData }) {
  if (slide.layout === "image" || (slide.layout === "text_with_image" && slide.image_url && !slide.content_html)) {
    const validUrl = slide.image_url && isCdnUrl(slide.image_url);
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-56 p-6 gap-4">
        {validUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.image_url!}
            alt={slide.caption ?? ""}
            className="max-w-full max-h-96 object-contain rounded"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-neutral-400">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm">Imagem não disponível</p>
            <p className="text-xs opacity-60">Arquivo original do H5P não migrado para CDN</p>
          </div>
        )}
        {slide.caption && (
          <p className="text-sm text-center text-neutral-600">{slide.caption}</p>
        )}
      </div>
    );
  }

  if (slide.layout === "text_with_image" && slide.content_html && slide.image_url) {
    const validUrl = isCdnUrl(slide.image_url);
    return (
      <div className="flex flex-col sm:flex-row gap-4 p-6 h-full">
        <div
          className="flex-1 [&_p]:mb-2 [&_strong]:font-semibold [&_span]:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: safe(slide.content_html) }}
        />
        {validUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.image_url}
            alt={slide.caption ?? ""}
            className="w-full sm:w-48 object-contain rounded"
          />
        ) : (
          <div className="flex items-center justify-center w-full sm:w-48 text-neutral-300">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
      </div>
    );
  }

  // text layout (most common)
  return (
    <div
      className="p-6 h-full [&_p]:mb-2 [&_strong]:font-semibold [&_span]:leading-relaxed [&_br]:block"
      dangerouslySetInnerHTML={{ __html: safe(slide.content_html ?? "") }}
    />
  );
}
