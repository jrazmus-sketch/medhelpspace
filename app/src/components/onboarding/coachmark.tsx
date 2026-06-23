"use client";

import { Lightbulb, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIPS, type CoachKey } from "@/lib/onboarding/tips";
import { useOnboarding } from "@/providers/onboarding-provider";
import { TipText } from "./tip-text";

/**
 * An inline, dismissable onboarding hint anchored in the flow of a section.
 * Renders nothing once the user closes it (X) or if the walkthrough is already
 * dismissed — and nothing until the store hydrates, to avoid a flash of
 * already-seen tips. Inline (not floating) on purpose: it reflows naturally and
 * never collides with the fixed mobile bottom nav.
 */
export function Coachmark({
  coachKey,
  className,
}: {
  coachKey: CoachKey;
  className?: string;
}) {
  const { ready, isDismissed, dismiss } = useOnboarding();
  const tip = TIPS[coachKey];

  if (!tip || !ready || isDismissed(coachKey)) return null;

  return (
    <aside
      role="note"
      className={cn(
        "relative my-4 rounded-xl bg-brand/5 p-4 pr-11 ring-1 ring-brand/20 sm:p-5 sm:pr-12",
        className,
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Lightbulb className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">
          Dica rápida
        </span>
      </div>

      <p className="text-[14px] font-semibold leading-snug text-foreground">
        <TipText k={`onboarding.${coachKey}.title`} fallback={tip.title} />
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        <TipText k={`onboarding.${coachKey}.body`} fallback={tip.body} multiline />
      </p>

      {tip.reviewNote && (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] leading-relaxed text-foreground/85">
          <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" strokeWidth={2} />
          <TipText as="span" k={`onboarding.${coachKey}.review`} fallback={tip.reviewNote} multiline />
        </p>
      )}

      <button
        type="button"
        onClick={() => dismiss(coachKey)}
        aria-label="Fechar dica"
        className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
