"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  title: string;
  description?: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
  className?: string;
}

export function ModuleCard({
  title,
  description,
  href,
  icon,
  badge,
  className,
}: ModuleCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border border-border/50 bg-surface-1 p-5 transition-colors hover:border-brand/40 hover:bg-surface-2",
        className,
      )}
    >
      {(icon || badge) && (
        <div className="flex items-center justify-between">
          {icon && (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
              {icon}
            </span>
          )}
          {badge && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
              {badge}
            </span>
          )}
        </div>
      )}
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </Link>
  );
}
