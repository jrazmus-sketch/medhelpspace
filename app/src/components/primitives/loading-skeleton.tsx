"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
    />
  );
}

export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <Skeleton className="h-5 w-3/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-surface-1 p-5 space-y-3",
        className,
      )}
    >
      <Skeleton className="h-9 w-9 rounded-lg" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function LessonSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border/50 p-4",
        className,
      )}
    >
      <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
      <Skeleton className="h-4 flex-1" />
    </div>
  );
}
