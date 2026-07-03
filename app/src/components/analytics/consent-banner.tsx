"use client";

// LGPD notice + opt-out banner. Analytics defaults ON (notice+opt-out posture);
// this bar informs the visitor and lets them decline. Shown once, only on public /
// funnel routes, until a choice is stored. Public pages are dark-only — semantic
// tokens resolve correctly there.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GA_MEASUREMENT_ID, isTrackedPath } from "@/lib/analytics/config";
import { getStoredConsent, setStoredConsent } from "@/lib/analytics/consent";
import { updateConsent } from "@/lib/analytics/track";

export function AnalyticsConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    if (getStoredConsent() !== null) return; // already chose — stay hidden
    // Client-only: decide visibility after mount to avoid an SSR/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, []);

  if (!visible || !isTrackedPath(pathname)) return null;

  function choose(granted: boolean) {
    setStoredConsent(granted ? "granted" : "denied");
    if (!granted) updateConsent(false); // tell any already-loaded gtag to stop
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Aviso de privacidade"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border/60 bg-surface-1/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-surface-1/80"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-foreground/75">
          Usamos cookies de análise para entender como a plataforma é usada e
          melhorar sua experiência.{" "}
          <Link
            href="/privacidade"
            className="font-medium text-brand underline underline-offset-2 hover:text-brand/80"
          >
            Saiba mais
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="min-h-[44px] flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted/40 sm:flex-none"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="min-h-[44px] flex-1 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand/90 sm:flex-none"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
