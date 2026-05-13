"use client";

import { Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/types/supabase";

interface LessonCardProps {
  lesson: Lesson;
  onClick?: () => void;
  className?: string;
}

export function LessonCard({ lesson, onClick, className }: LessonCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-3 rounded-lg border border-border/50 bg-surface-1 p-4 text-left transition-colors hover:border-brand/40 hover:bg-surface-2",
        className,
      )}
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold tabular-nums text-brand">
        {lesson.position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {lesson.title}
        </p>
      </div>
      {lesson.audio_url && (
        <Headphones className="h-4 w-4 shrink-0 text-brand/60" aria-label="Com áudio" />
      )}
    </button>
  );
}
