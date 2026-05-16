"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { recordLessonCompletion } from "@/actions/lesson-completions";

export function LessonCompleteButton({
  lessonId,
  pageId,
  initialDone,
}: {
  lessonId: number;
  pageId: number;
  initialDone: boolean;
}) {
  const [done, setDone] = useState(initialDone);

  // Listen for the event in case AudioPlayer or sidebar marks this lesson complete
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
    setDone(true);
    // Dispatch event so sidebar/dashboard listeners update too
    window.dispatchEvent(
      new CustomEvent("mhs:lesson-complete", { detail: { lessonId } }),
    );
    // Persist to server (idempotent)
    recordLessonCompletion(lessonId, pageId).catch(() => {
      // Silent — optimistic UI already updated
    });
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
