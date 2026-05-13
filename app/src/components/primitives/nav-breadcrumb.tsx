"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface NavBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function NavBreadcrumb({ items, className }: NavBreadcrumbProps) {
  return (
    <nav
      aria-label="Navegação"
      className={cn("flex items-center gap-1 text-sm", className)}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  isLast ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
