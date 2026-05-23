"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { recordLessonCompletion } from "@/actions/lesson-completions";

// Completion + forward navigation are a single gesture for text sections:
//  - non-last section → "Concluir e continuar" marks done AND moves to the next
//  - last section     → "Concluir seção" marks done (the finish line, no nav)
// This keeps a single section's completion from reading as "whole lesson done"
// and makes the last section unambiguously the end.

const PRIMARY =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand " +
  "px-4 py-3 min-h-[44px] text-sm font-medium text-brand-fg transition-opacity " +
  "hover:opacity-90 sm:w-auto";
const GHOST =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border " +
  "px-4 py-3 min-h-[44px] text-sm font-medium text-muted-foreground transition-colors " +
  "hover:border-brand/40 hover:text-foreground";

export function LessonCompleteButton({
  lessonId,
  pageId,
  initialDone,
  nextLessonId,
  nextPageHref,
  nextPageTitle,
  specialtyHref,
  specialtyName,
}: {
  lessonId: number;
  pageId: number;
  initialDone: boolean;
  nextLessonId: number | null;
  nextPageHref: string | null;
  nextPageTitle: string | null;
  specialtyHref: string;
  specialtyName: string;
}) {
  const [done, setDone] = useState(initialDone);

  // Listen for completion events from AudioPlayer (95% played) or the sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const { lessonId: id } = (e as CustomEvent<{ lessonId: number }>).detail;
      if (id === lessonId) setDone(true);
    };
    window.addEventListener("mhs:lesson-complete", handler);
    return () => window.removeEventListener("mhs:lesson-complete", handler);
  }, [lessonId]);

  function markComplete() {
    if (done) return;
    setDone(true);
    // Notify sidebar / dashboard listeners
    window.dispatchEvent(
      new CustomEvent("mhs:lesson-complete", { detail: { lessonId } }),
    );
    // Persist to server (idempotent). Fires before the Link navigates;
    // App Router nav is client-side so the in-flight request survives.
    recordLessonCompletion(lessonId, pageId).catch(() => {
      // Silent — optimistic UI already updated
    });
  }

  const doneBadge = (
    <span className="flex items-center gap-1.5 text-sm font-medium text-brand">
      <Check className="h-4 w-4" />
      Concluído
    </span>
  );

  // Last section — completion is the finish line, but we still offer onward
  // navigation (next page in the parent hub + back to specialty) so the user
  // is never stranded after finishing the lesson.
  if (nextLessonId === null) {
    const forwardLinks = (
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {nextPageHref && (
          <Link
            href={nextPageHref}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 min-h-[44px] text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity"
          >
            <span className="truncate">
              Próximo tópico{nextPageTitle ? `: ${nextPageTitle}` : ""}
            </span>
            <span aria-hidden>→</span>
          </Link>
        )}
        <Link
          href={specialtyHref}
          className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 min-h-[44px] text-sm font-medium text-foreground hover:border-brand/40 hover:text-brand transition-colors"
        >
          ← Voltar para {specialtyName}
        </Link>
      </div>
    );

    if (done) {
      return (
        <div className="flex w-full flex-col items-end gap-3">
          {doneBadge}
          {forwardLinks}
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col items-end gap-3">
        <button type="button" onClick={markComplete} className={PRIMARY}>
          Concluir seção
        </button>
        {forwardLinks}
      </div>
    );
  }

  // Non-last section, already complete (revisiting) — still offer a way forward.
  if (done) {
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-3">
        {doneBadge}
        <Link href={`?s=${nextLessonId}`} scroll={false} className={GHOST}>
          Próxima seção <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  // Non-last section — mark done and continue in one click.
  return (
    <Link
      href={`?s=${nextLessonId}`}
      scroll={false}
      onClick={markComplete}
      className={PRIMARY}
    >
      Concluir e continuar <span aria-hidden>→</span>
    </Link>
  );
}
