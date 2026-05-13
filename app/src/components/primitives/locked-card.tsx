"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface LockedCardProps {
  title: string;
  description?: string;
  daysUntilUnlock?: number;
  className?: string;
}

export function LockedCard({
  title,
  description,
  daysUntilUnlock,
  className,
}: LockedCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-dashed border-border/40 bg-surface-1/50 p-5 opacity-60",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </span>
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
        {daysUntilUnlock !== undefined && daysUntilUnlock > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Disponível em{" "}
            <span className="font-medium tabular-nums text-foreground">
              {daysUntilUnlock}
            </span>{" "}
            {daysUntilUnlock === 1 ? "dia" : "dias"}
          </p>
        )}
      </div>
    </div>
  );
}
