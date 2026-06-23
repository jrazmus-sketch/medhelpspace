"use client";

import { useState } from "react";
import { RotateCcw, Check } from "lucide-react";
import { useOnboarding } from "@/providers/onboarding-provider";

/**
 * "Reativar dicas" — clears every dismissal so the inline coachmarks reappear
 * around the site. Lives on the /app/comecar guide so the walkthrough is always
 * replayable.
 */
export function ResetTipsButton() {
  const { reset } = useOnboarding();
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        reset();
        setDone(true);
      }}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-surface-1 px-4 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:border-brand/40 hover:text-brand focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {done ? (
        <>
          <Check className="h-4 w-4 text-brand" />
          Dicas reativadas
        </>
      ) : (
        <>
          <RotateCcw className="h-4 w-4" />
          Reativar as dicas pelo site
        </>
      )}
    </button>
  );
}
