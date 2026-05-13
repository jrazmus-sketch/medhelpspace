"use client";

import { cn } from "@/lib/utils";

interface ContentSectionProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ContentSection({
  title,
  description,
  action,
  children,
  className,
}: ContentSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
