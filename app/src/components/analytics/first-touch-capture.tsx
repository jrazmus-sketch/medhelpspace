"use client";
// Remembers the visitor's FIRST landing on the site (utm tags, gclid, external
// referrer, landing path, when) in a 90-day first-party cookie, so a lead who comes
// back days later through an internal link still gets attributed to the ad or
// search that brought them the first time. See lib/magnet/first-touch.ts.
//
// Write-once: an existing cookie is never touched, so the first touch stays the
// first touch. No personal data is stored. Mounted once, in the root layout.
import { useEffect } from "react";
import {
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_MAX_AGE_SECONDS,
  buildFirstTouch,
  serializeFirstTouch,
} from "@/lib/magnet/first-touch";

export function FirstTouchCapture() {
  useEffect(() => {
    try {
      if (new RegExp(`(?:^|;\\s*)${FIRST_TOUCH_COOKIE}=`).test(document.cookie)) return;
      const ft = buildFirstTouch({
        search: window.location.search,
        pathname: window.location.pathname,
        referrer: document.referrer,
        host: window.location.host,
      });
      if (!ft) return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${FIRST_TOUCH_COOKIE}=${serializeFirstTouch(ft)}; path=/; max-age=${FIRST_TOUCH_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    } catch {
      // Storage blocked or a malformed URL — attribution is best-effort, never a blocker.
    }
  }, []);
  return null;
}
