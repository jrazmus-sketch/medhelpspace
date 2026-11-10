"use client";

// "Preferências de cookies" — reopens the consent notice (Karina 2026-11-09,
// item 4: withdrawal reuses the existing notice, no settings panel).
//
// Shown only where the notice can speak of advertising: every visitor once Meta
// is live, and until then only a ?meta_test browser — so test mode adds nothing
// to the public footer. Renders its own <li> (or a bare button) so a hidden link
// leaves no empty list item behind.

import { useEffect, useState, type CSSProperties } from "react";
import { CONSENT_OPEN_EVENT } from "@/lib/meta/config";
import { metaActiveInBrowser } from "@/lib/meta/pixel";

export function CookiePreferencesLink({
  className,
  style,
  asListItem = false,
}: {
  className?: string;
  style?: CSSProperties;
  asListItem?: boolean;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Client-only: the test cookie is read after mount, like the banner.
    const decide = () => setShow(metaActiveInBrowser());
    decide();
    window.addEventListener("mhs-consent-change", decide);
    return () => window.removeEventListener("mhs-consent-change", decide);
  }, []);

  if (!show) return null;

  const button = (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
      className={className}
      style={style}
    >
      Preferências de cookies
    </button>
  );
  return asListItem ? <li>{button}</li> : button;
}
