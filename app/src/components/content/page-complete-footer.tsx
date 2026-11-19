"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { recordLessonCompletion } from "@/actions/lesson-completions";
import { completeFormulaReread, setFormulaReviewChoice } from "@/actions/review";
import { FORMULA_REVISAR_APOIO } from "@/lib/review/revisao-escolha";
import { ReviewChoiceBox } from "./review-choice-box";

// Completion footer for single-body content pages (plain-content: formula /
// resumos / narrative). These pages are one indivisible read, so there's a
// single "mark read" action plus forward/back navigation mirroring how a
// text-lesson's LAST section ends: "Próximo tópico" (next sibling in the
// parent hub, when one exists) and "Voltar" to the hub the page was reached
// from (e.g. the per-specialty Fórmula hub), NOT the specialty's main hub —
// fórmula lives inside MedHelp 60D, so its topics aren't listed there.

const PRIMARY =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand " +
  "px-4 py-3 min-h-[44px] text-sm font-medium text-brand-fg transition-opacity " +
  "hover:opacity-90 sm:w-auto";

export function PageCompleteFooter({
  lessonId,
  pageId,
  initialDone,
  backHref,
  backName,
  nextHref,
  nextTitle,
  review,
}: {
  lessonId: number;
  pageId: number;
  initialDone: boolean;
  backHref: string;
  backName: string;
  nextHref: string | null;
  nextTitle: string | null;
  /**
   * Fórmula MedHelp pages only (Karina 2026-11-19): the "Quero revisar" box between "Concluir leitura" and
   * "Próximo tópico". `chosen` = the page is in the student's Revisão now; `rereadDue` = its re-read is due today,
   * so reaching this footer counts as the re-read. Independent of "Concluir leitura": neither one sets the other.
   */
  review?: { chosen: boolean; rereadDue: boolean } | null;
}) {
  const [done, setDone] = useState(initialDone);
  const [chosen, setChosen] = useState(review?.chosen ?? false);
  const [saving, setSaving] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);

  // A due re-read is done when the student reaches the end of the page (as a MemoreCards theme is re-read on
  // reaching its last card). Only once per visit; the server ignores a read before the due date.
  const rereadDue = !!review?.rereadDue;
  useEffect(() => {
    if (!rereadDue || !footerRef.current) return;
    const el = footerRef.current;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void completeFormulaReread(pageId);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [rereadDue, pageId]);

  function toggleReview(next: boolean) {
    setChosen(next);
    setSaving(true);
    setFormulaReviewChoice(pageId, next)
      .then((r) => {
        if (!r.ok) setChosen(!next);
      })
      .catch(() => setChosen(!next))
      .finally(() => setSaving(false));
  }

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

  return (
    <div
      ref={footerRef}
      className="mt-10 flex w-full flex-col items-stretch gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
    >
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
      {review && (
        <ReviewChoiceBox
          id={`revisar-formula-${pageId}`}
          className="sm:max-w-xs"
          checked={chosen}
          disabled={saving}
          onChange={toggleReview}
          help={FORMULA_REVISAR_APOIO}
        />
      )}
      {nextHref && (
        <Link
          href={nextHref}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-3 min-h-[44px] text-sm font-medium text-brand-fg transition-opacity hover:opacity-90"
        >
          <span className="truncate">
            Próximo tópico{nextTitle ? `: ${nextTitle}` : ""}
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}
      <Link
        href={backHref}
        className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-3 min-h-[44px] text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand"
      >
        ← Voltar para {backName}
      </Link>
    </div>
  );
}
