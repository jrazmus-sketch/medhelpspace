"use client";

import { Eye, EyeOff, MapPin, RotateCcw, Check } from "lucide-react";
import { useState } from "react";
import { useOnboarding } from "@/providers/onboarding-provider";
import { COACH_KEYS, type CoachKey } from "@/lib/onboarding/tips";

/**
 * "Dicas da plataforma" (Karina 2026-11-19): under each tip, where its box appears and whether the student closed
 * it, with "Mostrar de novo na página" to bring that one box back to its original place. Choices live on the
 * student's account (profiles.onboarding_dismissed), so they survive signing out and in.
 */
export function TipStatus({ coachKey, place }: { coachKey: CoachKey; place: string | null }) {
  const { ready, dismissedKeys, restore } = useOnboarding();
  const closed = ready && dismissedKeys.has(coachKey);

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        {place ? (
          <span>
            Aparece em: <span className="font-medium text-foreground">{place}</span>
            {ready && (
              <>
                {" · "}
                {closed ? (
                  <span className="inline-flex items-center gap-1">
                    <EyeOff className="h-3.5 w-3.5" aria-hidden /> fechada por você
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" aria-hidden /> visível na página
                  </span>
                )}
              </>
            )}
          </span>
        ) : (
          <span>Disponível somente aqui.</span>
        )}
      </p>
      {place && closed && (
        <button
          type="button"
          onClick={() => restore(coachKey)}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-brand/30 px-3 py-2 text-[13px] font-semibold text-brand outline-none transition-colors hover:bg-brand/10 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Mostrar de novo na página
        </button>
      )}
    </div>
  );
}

/** How many tips the student closed, and "Restaurar todas as dicas fechadas". */
export function RestoreAllTips() {
  const { ready, dismissedKeys, reset } = useOnboarding();
  const [done, setDone] = useState(false);
  const count = ready ? [...dismissedKeys].filter((k) => COACH_KEYS.has(k)).length : 0;

  if (!ready) return null;
  if (count === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-brand" />
        {done ? "Dicas restauradas. Elas voltam a aparecer nas páginas de origem." : "Todas as dicas estão visíveis nas páginas."}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
      <p className="text-sm text-muted-foreground">
        Você fechou {count} {count === 1 ? "dica" : "dicas"}.
      </p>
      <button
        type="button"
        onClick={() => {
          reset();
          setDone(true);
        }}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-surface-1 px-4 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:border-brand/40 hover:text-brand focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <RotateCcw className="h-4 w-4" />
        Restaurar todas as dicas fechadas
      </button>
    </div>
  );
}
