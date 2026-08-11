"use client";

// LGPD notice + opt-out toast. Analytics defaults ON (notice+opt-out posture);
// this informs the visitor and lets them decline. Shown once, only on public /
// funnel routes, until a choice is stored. Public pages are dark-only — semantic
// tokens resolve correctly there.
//
// WHY A CORNER TOAST AND NOT A FULL-WIDTH BAR:
// it used to be `fixed inset-x-0 bottom-0`, spanning the viewport with nothing
// reserving its height — so it silently covered the bottom ~70–110px of every
// public page until the visitor answered it. That is not a cosmetic issue: on
// /simulado-revalida it lands on the submit button, and on the landing page it
// covers the sticky "Comprar Agora" bar (z-50 to this z-70). Whether a tap was
// eaten depended on scroll position, so it failed intermittently and silently —
// the visitor just thinks the button is broken.
//
// A notice+opt-out posture does not require a viewport-wide bar. This is a small
// card in the corner: it still carries the notice, the "saiba mais" link and an
// explicit decline, but it occupies a bounded region instead of the whole width.
//
// THE SHAPE ALONE IS NOT THE FIX, and it is worth saying why. A first attempt
// floated this card ~7rem up from the bottom to clear the sticky CTA; measured on
// a 375×667 phone, its dead zone landed at y=398–556 — the middle of the screen,
// which is worse than the bottom strip it replaced, and it still sat on the
// simulado submit button. On a small viewport ANY card big enough to read will
// cover something. So the card hugs the bottom edge, where an obstruction is
// expected, AND the page reserves its height so every element can be scrolled
// clear of it. The reserved strip is now the height of a small card rather than
// of a full-width bar.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GA_MEASUREMENT_ID, isTrackedPath } from "@/lib/analytics/config";
import { getStoredConsent, setStoredConsent } from "@/lib/analytics/consent";
import { updateConsent } from "@/lib/analytics/track";

export function AnalyticsConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    if (getStoredConsent() !== null) return; // already chose — stay hidden
    // Client-only: decide visibility after mount to avoid an SSR/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, []);

  const showing = visible && isTrackedPath(pathname);

  // Reserve the card's height at the end of the page so nothing can end up
  // permanently underneath it. MEASURED, not a fixed class: the copy wraps to
  // three lines at 375px and one or two from sm up, so the height genuinely
  // varies and any hardcoded padding would be wrong at one end — which is how
  // the original bar came to cover the simulado submit button.
  useEffect(() => {
    const el = cardRef.current;
    if (!showing || !el) return;
    const apply = () => {
      // +12px for the card's own bottom inset.
      document.body.style.paddingBottom = `${el.offsetHeight + 12}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [showing]);

  if (!showing) return null;

  function choose(granted: boolean) {
    setStoredConsent(granted ? "granted" : "denied");
    if (!granted) updateConsent(false); // tell any already-loaded gtag to stop
    setVisible(false);
  }

  return (
    // Anchored bottom-LEFT and hugging the bottom edge.
    //
    // bottom-left, not bottom-right: the landing page's sticky CTA puts "Comprar
    // Agora →" hard against the right edge, and primary actions across these pages
    // are right-aligned or centred. The left corner is the quiet one.
    //
    // max-w-sm + right-3 sm:right-auto: full-bleed-with-margins on a small phone
    // (where a 22rem card would crowd the edge), a true corner card from sm up.
    // Only the card takes pointer events — the rest of the page stays clickable.
    <div
      ref={cardRef}
      role="region"
      aria-label="Aviso de privacidade"
      className="fixed bottom-3 left-3 right-3 z-[70] sm:right-auto sm:max-w-sm md:bottom-6 md:left-6"
    >
      {/* Copy is deliberately short. Tailwind's `sm` is 640px, so on any phone this
          card is full-width regardless of max-w — height is the only dimension we
          control there, and the original three-line notice made the card 158px,
          TALLER than the 110px bar it replaced. Two lines keeps it under the bar
          it is replacing while still being a notice with a link to the policy. */}
      <div className="rounded-xl border border-border/60 bg-surface-1/95 p-3.5 shadow-xl shadow-black/20 backdrop-blur supports-[backdrop-filter]:bg-surface-1/85">
        <p className="text-sm leading-snug text-foreground/75">
          Usamos cookies de análise para melhorar sua experiência.{" "}
          <Link
            href="/privacidade"
            className="font-medium text-brand underline underline-offset-2 hover:text-brand/80"
          >
            Saiba mais
          </Link>
          .
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="min-h-[44px] flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted/40"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="min-h-[44px] flex-1 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand/90"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
