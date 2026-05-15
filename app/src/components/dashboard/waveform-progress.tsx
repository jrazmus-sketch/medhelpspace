"use client";

import { useState, useEffect } from "react";

const BARS = [4, 9, 6, 14, 8, 11, 5, 13, 7, 10, 4, 12, 8, 6, 11, 9, 14, 5, 7, 10, 8, 13, 6, 9, 11];

export function WaveformProgress({
  pageId,
  totalLessons,
}: {
  pageId: number;
  totalLessons: number;
}) {
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`mhs-lesson-done-${pageId}`);
      if (raw) {
        const ids = JSON.parse(raw) as number[];
        setCompletedCount(Math.min(ids.length, totalLessons));
      }
    } catch {}
  }, [pageId, totalLessons]);

  const progress = totalLessons > 0 ? completedCount / totalLessons : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2.5, height: 20 }}>
        {BARS.map((h, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: h,
              maxHeight: 20,
              borderRadius: 2,
              flexShrink: 0,
              background:
                i / BARS.length < progress ? "var(--brand)" : "rgba(255,255,255,0.1)",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            flex: 1,
            height: 2,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: "var(--brand)",
              borderRadius: 1,
            }}
          />
        </div>
        <span
          style={{
            fontSize: 10.5,
            color: "var(--muted-2, #727272)",
            fontFamily: "var(--font-geist-mono)",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {totalLessons > 0 ? `${completedCount}/${totalLessons}` : "—"}
        </span>
      </div>
    </div>
  );
}
