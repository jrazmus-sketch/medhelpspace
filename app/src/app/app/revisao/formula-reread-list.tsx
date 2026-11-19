"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { setFormulaReviewChoice } from "@/actions/review";

/**
 * Fórmula MedHelp pages due for a re-read (Karina 2026-11-19). Each row keeps "Já domino isto — não revisar mais",
 * which takes the page out of the Revisão — the same state as unticking "Quero revisar" on the page, so the box
 * there shows unticked afterwards. History is kept.
 */
export function FormulaRereadList({
  items,
}: {
  items: { pageId: number; title: string; href: string }[];
}) {
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const left = items.filter((d) => !removed.has(d.pageId));
  const shown = left.slice(0, 5);
  if (left.length === 0) return null;

  function remove(pageId: number) {
    setRemoved((prev) => new Set(prev).add(pageId));
    setFormulaReviewChoice(pageId, false)
      .then((r) => {
        if (!r.ok) throw new Error();
      })
      .catch(() =>
        setRemoved((prev) => {
          const s = new Set(prev);
          s.delete(pageId);
          return s;
        }),
      );
  }

  return (
    <div className="border-border bg-surface-1 mt-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <span className="bg-surface-2 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
          <BookOpen className="h-4 w-4" />
        </span>
        <div>
          <p className="text-foreground text-sm font-semibold">Reler Fórmula MedHelp</p>
          <p className="text-muted-foreground text-xs">
            {left.length} {left.length === 1 ? "página" : "páginas"} para revisitar
          </p>
        </div>
      </div>
      <div className="divide-border mt-3 flex flex-col divide-y">
        {shown.map((d) => (
          <div
            key={d.pageId}
            className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <Link
              href={d.href}
              className="text-foreground hover:text-brand flex min-h-11 min-w-0 items-center justify-between gap-3 text-sm transition-colors sm:flex-1"
            >
              <span className="truncate">{d.title}</span>
              <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            </Link>
            <button
              type="button"
              onClick={() => remove(d.pageId)}
              className="text-muted-foreground hover:text-brand inline-flex min-h-11 shrink-0 items-center self-start text-xs underline-offset-4 transition-colors hover:underline sm:self-auto"
            >
              Já domino isto — não revisar mais
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
