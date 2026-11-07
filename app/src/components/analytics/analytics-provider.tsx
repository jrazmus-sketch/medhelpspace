"use client";

// Loads GA4 (hand-rolled gtag via next/script) for public + funnel routes only.
// Why hand-rolled instead of @next/third-parties: gtag's built-in pageview
// tracking is a global history listener that can't be gated per-route, so it
// would leak /app pageviews. Here we disable auto pageviews (send_page_view:false)
// and send them manually only on tracked routes, plus flip GA's per-ID kill
// switch on excluded routes so NOTHING (pageview or enhanced event) is sent there.

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GA_MEASUREMENT_ID,
  ANALYTICS_DEFAULT_CONSENT,
  INTERNAL_TRAFFIC_COOKIE,
  isTrackedPath,
} from "@/lib/analytics/config";
import { getStoredConsent } from "@/lib/analytics/consent";
import { useAuth } from "@/providers/auth-provider";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readInternalCookie(): boolean {
  return document.cookie.split(";").some((c) => c.trim() === `${INTERNAL_TRAFFIC_COOKIE}=1`);
}

export function AnalyticsProvider() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<"granted" | "denied" | null>(null);
  const [ready, setReady] = useState(false);
  // Internal traffic (Karina 2026-11-06, "não contabilizar … testes internos"):
  // a browser where an admin account was ever seen sends nothing, from then on.
  const [internal, setInternal] = useState<boolean | null>(null);
  const { profile } = useAuth();
  const isAdminProfile = !!profile?.role && profile.role !== "member";

  // Read once after mount (the cookie is client-only, like consent below), and
  // mark the browser the moment an admin profile appears.
  useEffect(() => {
    if (isAdminProfile) {
      document.cookie = `${INTERNAL_TRAFFIC_COOKIE}=1; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInternal(isAdminProfile || readInternalCookie());
  }, [isAdminProfile]);

  // Resolve stored consent on mount and keep it in sync with the banner.
  // Intentional client-only setState-in-effect: a lazy useState initializer would
  // read no cookie during SSR but the real value on the client, so a returning
  // opt-out visitor would hydrate mismatched. Resolving after mount avoids that.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(getStoredConsent() ?? ANALYTICS_DEFAULT_CONSENT);
    const onChange = () => setConsent(getStoredConsent() ?? ANALYTICS_DEFAULT_CONSENT);
    window.addEventListener("mhs-consent-change", onChange);
    return () => window.removeEventListener("mhs-consent-change", onChange);
  }, []);

  const consentDenied = consent === "denied";
  // Until the cookie has been read (`internal === null`) nothing loads either.
  const tracked = isTrackedPath(pathname) && internal === false;
  const enabled = !!GA_MEASUREMENT_ID && !consentDenied;

  // GA's per-measurement-ID kill switch. Set true → gtag drops ALL hits for the
  // ID (pageviews and enhanced-measurement events alike). We flip it on excluded
  // routes and on consent-denied, deterministically, before any hit for the route.
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_MEASUREMENT_ID}`] =
      !tracked || consentDenied;
  }, [tracked, consentDenied]);

  // Manual pageview on tracked-route changes (auto pageview is off). Reading
  // window.location.href captures UTM params on the initial landing for attribution.
  useEffect(() => {
    if (!ready || !enabled || !tracked) return;
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [ready, enabled, tracked, pathname]);

  // Only mount the scripts on tracked routes: a direct /app or /login-only
  // session never loads gtag at all. (Once loaded, the kill switch handles
  // subsequent cross-boundary navigation.)
  if (!enabled || !tracked) return null;

  return (
    <>
      <Script
        id="ga-base"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <Script id="ga-init" strategy="afterInteractive" onReady={() => setReady(true)}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          var m = document.cookie.match(/(?:^|;\\s*)mhs_analytics_consent=([^;]+)/);
          var c = m ? decodeURIComponent(m[1]) : '${ANALYTICS_DEFAULT_CONSENT}';
          gtag('consent','default',{
            ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied',
            analytics_storage: (c === 'denied' ? 'denied' : 'granted')
          });
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
