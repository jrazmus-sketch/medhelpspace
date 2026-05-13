"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

interface SidebarEntry {
  id: number;
  title: string;
}

function useActiveSection(entries: SidebarEntry[]): number | null {
  const [activeId, setActiveId] = useState<number | null>(entries[0]?.id ?? null);

  useEffect(() => {
    if (entries.length === 0) return;
    const observer = new IntersectionObserver(
      (obs) => {
        for (const entry of obs) {
          if (entry.isIntersecting) {
            const id = parseInt(entry.target.id.replace("section-", ""), 10);
            setActiveId(id);
            break;
          }
        }
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0 },
    );
    for (const e of entries) {
      const el = document.getElementById(`section-${e.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [entries]);

  return activeId;
}

export function LessonSidebar({ entries }: { entries: SidebarEntry[] }) {
  const activeId = useActiveSection(entries);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navList = (
    <ul className="space-y-0.5">
      {entries.map((e) => (
        <li key={e.id}>
          <a
            href={`#section-${e.id}`}
            onClick={() => setMobileOpen(false)}
            className={[
              "block text-sm leading-snug py-1.5 px-2 rounded-md transition-colors",
              activeId === e.id
                ? "bg-brand-muted text-brand font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
            ].join(" ")}
          >
            {e.title}
          </a>
        </li>
      ))}
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

      {/* Desktop sidebar */}
      <nav className="hidden lg:block w-52 shrink-0">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Seções
          </p>
          {navList}
        </div>
      </nav>
    </>
  );
}
