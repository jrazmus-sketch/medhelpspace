"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";

function isDone(pageId: number, lessonId: number): boolean {
  try {
    const raw = localStorage.getItem(`mhs-lesson-done-${pageId}`);
    if (!raw) return false;
    return (JSON.parse(raw) as number[]).includes(lessonId);
  } catch {
    return false;
  }
}

export function LessonCompleteButton({
  lessonId,
  pageId,
}: {
  lessonId: number;
  pageId: number;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDone(isDone(pageId, lessonId));
  }, [lessonId, pageId]);

  // Also listen for the event in case it fires before state re-check
  useEffect(() => {
    const handler = (e: Event) => {
      const { lessonId: id } = (e as CustomEvent<{ lessonId: number }>).detail;
      if (id === lessonId) setDone(true);
    };
    window.addEventListener("mhs:lesson-complete", handler);
    return () => window.removeEventListener("mhs:lesson-complete", handler);
  }, [lessonId]);

  function handleClick() {
    if (done) return;
    window.dispatchEvent(
      new CustomEvent("mhs:lesson-complete", { detail: { lessonId } }),
    );
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-sm font-medium text-brand">
        <Check className="h-4 w-4" />
        Concluído
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
    >
      Marcar como concluído
    </button>
  );
}
