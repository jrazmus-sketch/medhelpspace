"use client";

// Floating WhatsApp button — fixed bottom-right, always visible while scrolling,
// on the sales pages only. Karina's spec (2026-09-28): small green circle, white
// WhatsApp glyph, discreet, never a block inside the content, works on desktop
// and mobile, keeps a margin from the edges and covers nothing important.
//
// "Covers nothing important" is the part that needs code, not CSS:
//  • On phones the landing docks a "Comprar Agora" bar to the bottom once the
//    hero scrolls away. That bar publishes its measured height as
//    `--mhs-bottom-bar-h` on <html>; this button adds it to its own offset, so
//    it rides up above the bar and comes back down when the bar hides.
//  • The analytics consent card also sits in the bottom corner (z-70) until the
//    visitor answers. Rather than fight it, the button waits — the same yield
//    the sticky bar makes, for the same reason (a tap meant for one would land
//    on the other).
//  • For an admin on desktop the "Editar página" pill lives in the same corner;
//    that pill moved left so the two never overlap.
//
// Visibility: `published` comes from the server (site_pages gate). Until it is
// true only admins see the button — the pages are ISR-cached, so the admin check
// has to happen on the client, from the auth context, never in the cached HTML.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/config";
import { hasConsentChoice } from "@/lib/analytics/consent";
import { trackEvent } from "@/lib/analytics/track";
import { WHATSAPP_ARIA_LABEL, whatsappUrl, type WhatsAppProduct } from "@/lib/whatsapp";

export function WhatsAppButton({ product, published }: { product: WhatsAppProduct; published: boolean }) {
  const pathname = usePathname();
  const { isAnyAdmin } = useAuth();
  const [consentPending, setConsentPending] = useState(false);
  // Admin status is only known on the client; render nothing until mounted so the
  // server HTML (public, cached) and the first client paint agree.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const check = () => setConsentPending(Boolean(GA_MEASUREMENT_ID) && !hasConsentChoice());
    check();
    window.addEventListener("mhs-consent-change", check);
    return () => window.removeEventListener("mhs-consent-change", check);
  }, []);

  if (!mounted) return null;
  const isAdmin = isAnyAdmin();
  if (!published && !isAdmin) return null;
  if (consentPending) return null;

  const preview = !published; // admin looking at an unpublished button

  return (
    <a
      href={whatsappUrl(product)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={WHATSAPP_ARIA_LABEL}
      title={preview ? "Visível só para administradores até ser publicado" : WHATSAPP_ARIA_LABEL}
      data-whatsapp-button={product}
      data-preview={preview ? "1" : undefined}
      onClick={() => trackEvent("click_whatsapp", { product, page: pathname ?? "" })}
      className="fixed right-4 z-[65] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_6px_20px_rgba(0,0,0,0.28)] transition-[bottom,transform] duration-300 [--wa-gap:1rem] hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:transform-none md:right-6 md:[--wa-gap:1.5rem]"
      style={{
        // edge gap (1rem phone / 1.5rem desktop) + iPhone home-bar inset + whatever
        // bar is docked below (see --mhs-bottom-bar-h in sticky-cta-bar.tsx)
        bottom: "calc(var(--wa-gap) + env(safe-area-inset-bottom, 0px) + var(--mhs-bottom-bar-h, 0px))",
      }}
    >
      {/* WhatsApp glyph (Simple Icons path), white on brand green */}
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      {preview ? (
        <span
          aria-hidden="true"
          className="absolute -left-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-amber-400"
        />
      ) : null}
    </a>
  );
}
