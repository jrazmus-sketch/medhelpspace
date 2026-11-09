"use client";

// Meta Pixel (dataset "MedHelpSpace | Web") — Karina 2026-11-04 / 2026-11-09.
//
// Loads ONLY when all of these hold:
//   1. the page is in META_PIXEL_PATHS (public sales / checkout / signup pages —
//      never /app, /admin, member areas or the free clinical cases);
//   2. the visitor pressed "Aceitar" on a notice that mentions advertising
//      (mhs_ads_consent=granted — explicit opt-in, never a default);
//   3. Meta is live, or this browser opened the site with ?meta_test=TESTxxxx
//      (test mode — see META_PIXEL_LIVE);
//   4. the browser is not internal (an admin was seen here) — unless it carries
//      a test code, which is exactly how Karina tests from her own browser.
//
// Single-page-app safety: `disablePushState` stops fbevents.js from sending its
// own PageView on every client-side navigation (it would fire on /app too), and
// `autoConfig=false` stops it from collecting button clicks and page metadata.
// PageView is sent by hand, here, on allowed paths only — and since fbevents.js
// silently drops every PageView after the first in a page load,
// `allowDuplicatePageViews` is on (verified in the browser 2026-11-09: without
// it, /revalida → /loja sent nothing). lastTracked keeps it to one per visit.

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  META_PIXEL_ID,
  META_TEST_COOKIE,
  META_TEST_PARAM,
  isMetaPixelPath,
  isValidMetaTestCode,
} from "@/lib/meta/config";
import { metaActiveInBrowser, metaPageView, metaTestCode } from "@/lib/meta/pixel";
import { getStoredAdsConsent } from "@/lib/analytics/consent";
import { INTERNAL_TRAFFIC_COOKIE } from "@/lib/analytics/config";
import { useAuth } from "@/providers/auth-provider";

function isInternalBrowser(): boolean {
  return document.cookie.split(";").some((c) => c.trim() === `${INTERNAL_TRAFFIC_COOKIE}=1`);
}

type Gate = { active: boolean; consent: boolean; internal: boolean; testing: boolean };

export function MetaPixel() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const isAdminProfile = !!profile?.role && profile.role !== "member";
  const [gate, setGate] = useState<Gate | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const lastTracked = useRef<string | null>(null);

  // ?meta_test=TEST123 → this browser (session) becomes a Test Events browser;
  // ?meta_test=off → back to normal. Read once, on the landing URL.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(META_TEST_PARAM);
    if (value === null) return;
    if (value === "off") {
      document.cookie = `${META_TEST_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    } else if (isValidMetaTestCode(value)) {
      document.cookie = `${META_TEST_COOKIE}=${encodeURIComponent(value.toUpperCase())}; path=/; SameSite=Lax`;
    }
    window.dispatchEvent(new Event("mhs-consent-change"));
  }, []);

  // Resolve the gate after mount (cookies are client-only) and keep it in sync
  // with the banner.
  useEffect(() => {
    const read = () =>
      setGate({
        active: metaActiveInBrowser(),
        consent: getStoredAdsConsent() === "granted",
        internal: isAdminProfile || isInternalBrowser(),
        testing: metaTestCode() !== null,
      });
    // Client-only cookie read after mount, same reason as AnalyticsProvider.
    read();
    window.addEventListener("mhs-consent-change", read);
    return () => window.removeEventListener("mhs-consent-change", read);
  }, [isAdminProfile]);

  const allowedHere = isMetaPixelPath(pathname);
  const permitted = !!gate && gate.active && gate.consent && (!gate.internal || gate.testing);

  // Once loaded the script stays (it cannot be unloaded); what it may SEND is
  // still decided per navigation below. (Derived-state update during render.)
  if (permitted && allowedHere && !loaded) setLoaded(true);

  // Consent withdrawn after the Pixel loaded → tell it to stop.
  useEffect(() => {
    if (!ready || typeof window.fbq !== "function") return;
    window.fbq("consent", permitted ? "grant" : "revoke");
  }, [ready, permitted]);

  // PageView, by hand, once per allowed path visit.
  useEffect(() => {
    if (!ready || !permitted || !allowedHere) return;
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    metaPageView(); // browser + server copy, one event_id
  }, [ready, permitted, allowedHere, pathname]);

  useEffect(() => {
    if (!allowedHere) lastTracked.current = null;
  }, [allowedHere]);

  if (!loaded) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive" onReady={() => setReady(true)}>
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq.disablePushState = true;
        fbq.allowDuplicatePageViews = true;
        fbq('set', 'autoConfig', false, '${META_PIXEL_ID}');
        fbq('init', '${META_PIXEL_ID}');
      `}
    </Script>
  );
}
