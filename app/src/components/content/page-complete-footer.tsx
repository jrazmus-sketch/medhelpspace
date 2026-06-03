"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { recordLessonCompletion } from "@/actions/lesson-completions";

// Completion footer for single-body content pages (plain-content: formula /
// resumos / narrative). Unlike text-lesson sections, these pages are one
// indivisible read, so there's no "continue to next section" — just a single
// "mark read" action plus a way back to the specialty, mirroring how a
// text-lesson's LAST section ends (Concluir + Voltar, no onward topic link).

const PRIMARY =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand " +
  "px-4 py-3 min-h-[44px] text-sm font-medium text-brand-fg transition-opacity " +
  "hover:opacity-90 sm:w-auto";

export function PageCompleteFooter({
  lessonId,
  pageId,
  initialDone,
  specialtyHref,
  specialtyName,
}: {
  lessonId: number;
  pageId: number;
  initialDone: boolean;
  specialtyHref: string;
  specialtyName: string;
}) {
  const [done, setDone] = useState(initialDone);

  function markComplete() {
    if (done) return;
    setDone(true);
    // Keep parity with LessonCompleteButton so any dashboard listeners update.
    window.dispatchEvent(
      new CustomEvent("mhs:lesson-complete", { detail: { lessonId } }),
    );
    // Persist (idempotent upsert). Optimistic UI has already flipped.
    recordLessonCompletion(lessonId, pageId).catch(() => {
      // Silent — optimistic state stays; the write retries on next visit.
    });
  }

  const voltarLink = (
    <Link
      href={specialtyHref}
      className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-3 min-h-[44px] text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand"
    >
      ← Voltar para {specialtyName}
    </Link>
  );

  return (
    <div className="mt-10 flex w-full flex-col items-stretch gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      {done ? (
        <span className="flex items-center justify-center gap-1.5 text-sm font-medium text-brand">
          <Check className="h-4 w-4" />
          Concluído
        </span>
      ) : (
        <button type="button" onClick={markComplete} className={PRIMARY}>
          <Check className="h-4 w-4" />
          Concluir leitura
        </button>
      )}
      {voltarLink}
    </div>
  );
}
