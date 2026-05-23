"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Discreet "← Voltar" chip. Uses browser history when available so users who
// arrived via a non-canonical path return to where they actually came from;
// falls back to fallbackHref (the IA parent) for cold loads / deep links.
export function VoltarButton({
  fallbackHref,
  className,
}: {
  fallbackHref: string;
  className?: string;
}) {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 -mx-2 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="h-3 w-3" />
      Voltar
    </button>
  );
}
