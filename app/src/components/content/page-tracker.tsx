"use client";

import { useEffect } from "react";
import { USE_MOCK_DATA } from "@/lib/mock-data";

export function PageTracker({ pageId }: { pageId: number }) {
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId }),
    });
  }, [pageId]);
  return null;
}
