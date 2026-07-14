"use client";
import { useEffect } from "react";
import { trackFunnel, type FunnelName } from "@/lib/magnet/funnel-track";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";

// Invisible: fires the 'landing' funnel event once per session on mount. Rendered
// on the server-component landing page so the page stays server-rendered while the
// beacon runs client-side. `funnel` tags which lead funnel this landing belongs to
// (defaults to the quiz funnel); the flashcards/simulado pages pass their own.
export function FunnelBeacon({
  utm,
  funnel = "simulado-honesto",
}: {
  utm: MagnetUtm;
  funnel?: FunnelName;
}) {
  useEffect(() => {
    trackFunnel("landing", utm, funnel);
    // Fire once on mount; utm/funnel are stable for the page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
