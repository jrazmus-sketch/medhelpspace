"use client";

import { useEffect } from "react";

/**
 * Until 2026-11 the root URL WAS the Revalida sales page, so links like
 * medhelpspace.com.br/#precos or /#faq are out in the wild (WhatsApp messages,
 * old e-mails, bios). The server never sees a #fragment, so no redirect can
 * catch them — this does, in the browser. The home page has no anchors of its
 * own, so ANY fragment here is an old Revalida one and goes to the same spot
 * on /revalida. replace(), not assign(): Back must not return to the chooser
 * just to bounce forward again.
 */
export function LegacyHashForward() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      window.location.replace(`/revalida${window.location.search}${hash}`);
    }
  }, []);
  return null;
}
