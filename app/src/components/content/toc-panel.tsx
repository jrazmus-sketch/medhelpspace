"use client";

import { useState, useEffect } from "react";

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

function useActiveHeading(entries: TocEntry[]): string {
  const [activeId, setActiveId] = useState(entries[0]?.id ?? "");

  useEffect(() => {
    if (entries.length === 0) return;
    const observer = new IntersectionObserver(
      (obs) => {
        for (const entry of obs) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    for (const e of entries) {
      const el = document.getElementById(e.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [entries]);

  return activeId;
}

export function TocPanel({ entries }: { entries: TocEntry[] }) {
  const activeId = useActiveHeading(entries);

  return (
    <nav className="hidden xl:block w-56 shrink-0">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Neste artigo
        </p>
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                className={[
                  "block text-sm leading-snug py-0.5 transition-colors",
                  e.level === 3 ? "pl-3" : "",
                  activeId === e.id
                    ? "text-brand font-medium"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {e.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
