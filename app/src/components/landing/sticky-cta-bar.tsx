"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/config";
import { hasConsentChoice } from "@/lib/analytics/consent";

export function StickyCTABar() {
  const [pastHero, setPastHero] = useState(false);
  // Both bars dock to the bottom of a phone, and the consent toast sits above
  // this one (z-70 vs z-50) — so while the notice is unanswered a tap aimed at
  // "Comprar Agora" lands on "Aceitar" instead. Measured, not theorised. The
  // notice is first-visit-only and this bar returns the moment they choose, so
  // yielding is cheaper than fighting over the corner.
  const [consentPending, setConsentPending] = useState(false);

  useEffect(() => {
    // Only when the toast can actually appear: with no GA id it never renders,
    // and gating on it then would hide this bar permanently.
    const check = () => setConsentPending(Boolean(GA_MEASUREMENT_ID) && !hasConsentChoice());
    check();
    window.addEventListener("mhs-consent-change", check);
    return () => window.removeEventListener("mhs-consent-change", check);
  }, []);

  useEffect(() => {
    // Observe the end of the hero section to decide when to show the bar
    const heroSection = document.getElementById("hero-section");
    if (!heroSection) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        // Show bar when hero is no longer visible (user scrolled past it)
        setPastHero(!entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    obs.observe(heroSection);
    return () => obs.disconnect();
  }, []);

  const visible = pastHero && !consentPending;

  return (
    <div
      className={`lp-sticky-cta-bar fixed bottom-0 left-0 right-0 z-50 md:hidden ${visible ? "lp-visible" : ""}`}
      style={{
        background: "color-mix(in srgb, var(--background) 92%, transparent)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3 pb-safe">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground">MedHelpSpace</div>
          <div className="text-[10px] text-foreground/45 truncate">Sistema completo de aprovação para o Revalida</div>
        </div>
        <Link
          href="/loja"
          className="flex-shrink-0 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-brand/20 transition-all active:scale-95"
        >
          Comprar Agora →
        </Link>
      </div>
    </div>
  );
}
