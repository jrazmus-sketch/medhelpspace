"use client";
import { useEffect } from "react";
import { trackFunnel } from "@/lib/magnet/funnel-track";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";

// Invisible: fires the 'landing' funnel event once per session on mount. Rendered
// on the server-component landing page so the page stays server-rendered while the
// beacon runs client-side.
export function FunnelBeacon({ utm }: { utm: MagnetUtm }) {
  useEffect(() => {
    trackFunnel("landing", utm);
    // Fire once on mount; utm is stable for the page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
