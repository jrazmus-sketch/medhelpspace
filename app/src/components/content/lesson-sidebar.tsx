"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";

interface SidebarEntry {
  id: number;
  title: string;
}

export function LessonSidebar({
  entries,
  activeId,
}: {
  entries: SidebarEntry[];
  activeId: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navList = (
    <ul className="space-y-0.5">
      {entries.map((e, i) => {
        const isActive = e.id === activeId;
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
                className="shrink-0 tabular-nums font-mono"
                style={{ fontSize: 10, opacity: isActive ? 0.7 : 0.4, minWidth: "1.5ch" }}
              >
                {i + 1}
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
          Seções ({entries.length})
        </button>
        {mobileOpen && (
          <div className="mt-3 border border-border rounded-lg p-3 bg-surface-1">
            {navList}
          </div>
        )}
      </div>

      {/* Desktop sidebar — sticky, scrolls independently if list is long */}
      <nav className="hidden lg:block w-52 shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Seções
          </p>
          {navList}
        </div>
      </nav>
    </>
  );
}
