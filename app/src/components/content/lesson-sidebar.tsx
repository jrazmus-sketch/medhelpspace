"use client";

import { useState, useEffect, useRef } from "react";
import { Menu, X, Check } from "lucide-react";
import Link from "next/link";

interface SidebarEntry {
  id: number;
  title: string;
}

// ─── Phase 1: localStorage progress ──────────────────────────────────────────
// PHASE 2 (pre-launch critical): migrate to server-side (lesson_completions table
// + server action). localStorage means phone and desktop show different progress.
// ─────────────────────────────────────────────────────────────────────────────

const storageKey = (pageId: number) => `mhs-lesson-progress-${pageId}`;

function loadCompleted(pageId: number): Set<number> {
  try {
    const raw = localStorage.getItem(storageKey(pageId));
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {}
  return new Set();
}

function saveCompleted(pageId: number, ids: Set<number>) {
  try {
    localStorage.setItem(storageKey(pageId), JSON.stringify([...ids]));
  } catch {}
}

export function LessonSidebar({
  entries,
  activeId,
  pageId,
}: {
  entries: SidebarEntry[];
  activeId: number;
  pageId: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const prevActiveRef = useRef<number | null>(null);

  // Load persisted progress from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    setCompleted(loadCompleted(pageId));
  }, [pageId]);

  // When the active section changes, mark the previous one complete
  useEffect(() => {
    const prev = prevActiveRef.current;
    if (prev !== null && prev !== activeId) {
      setCompleted((current) => {
        if (current.has(prev)) return current;
        const next = new Set(current);
        next.add(prev);
        saveCompleted(pageId, next);
        return next;
      });
    }
    prevActiveRef.current = activeId;
  }, [activeId, pageId]);

  const completedCount = completed.size;
  const allDone = completedCount >= entries.length;
  const progressPct = entries.length > 0 ? (completedCount / entries.length) * 100 : 0;

  const navList = (
    <ul className="space-y-0.5">
      {entries.map((e, i) => {
        const isActive = e.id === activeId;
        const isDone = completed.has(e.id);
        return (
          <li key={e.id}>
            <Link
              href={`?s=${e.id}`}
              scroll={false}
              onClick={() => setMobileOpen(false)}
              className={[
                "flex items-center gap-2 text-sm leading-snug py-1.5 px-2 rounded-md transition-colors",
                isActive
                  ? "bg-brand-muted text-brand font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
              ].join(" ")}
            >
              <span
                className="shrink-0 flex items-center justify-center tabular-nums"
                style={{ minWidth: "1.5ch" }}
              >
                {isDone && !isActive ? (
                  <Check
                    className="h-3 w-3 text-brand"
                    style={{ opacity: 0.8 }}
                  />
                ) : (
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, opacity: isActive ? 0.7 : 0.4 }}
                  >
                    {i + 1}
                  </span>
                )}
              </span>
              {e.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden mb-6">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground border border-border rounded-lg px-3 py-2 hover:text-foreground hover:border-brand/40 transition-colors"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          Seções
          <span className="font-mono text-xs">
            {completedCount > 0 ? `${completedCount}/${entries.length}` : `(${entries.length})`}
          </span>
          {allDone && <Check className="h-3.5 w-3.5 text-brand ml-0.5" />}
        </button>
        {mobileOpen && (
          <div className="mt-3 border border-border rounded-lg p-3 bg-surface-1">
            {navList}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <nav className="hidden lg:block w-52 shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
          {/* Header row */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Seções
            </p>
            {completedCount > 0 && (
              <span
                className={`flex items-center gap-1 text-xs font-mono ${
                  allDone ? "text-brand" : "text-muted-foreground"
                }`}
              >
                {allDone && <Check className="h-3 w-3" />}
                {completedCount}/{entries.length}
              </span>
            )}
          </div>

          {/* Progress bar — only shown once there's something to show */}
          {completedCount > 0 && (
            <div className="mb-3 h-1 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {navList}
        </div>
      </nav>
    </>
  );
}
