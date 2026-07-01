"use client";

import { useEffect, useRef } from "react";

// Invisible Cloudflare Turnstile challenge for the lead form (FREE-FUNNEL-V2-SCOPE
// Group 1). GRACEFUL when unconfigured: if NEXT_PUBLIC_TURNSTILE_SITE_KEY is absent
// the widget renders nothing and reports a null token — the server-side verifier
// (lib/magnet/anti-abuse.ts) likewise skips when TURNSTILE_SECRET_KEY is unset, so
// the funnel works with or without Turnstile (both-or-neither).

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  onVerify,
}: {
  onVerify: (token: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVerify);
  const rendered = useRef(false);

  // Keep the latest callback without re-running the render effect below.
  useEffect(() => {
    cb.current = onVerify;
  });

  useEffect(() => {
    if (!SITE_KEY) {
      cb.current(null);
      return;
    }
    let cancelled = false;

    function doRender() {
      if (cancelled || rendered.current || !ref.current || !window.turnstile) return;
      rendered.current = true;
      window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => cb.current(token),
        "error-callback": () => cb.current(null),
        "expired-callback": () => cb.current(null),
        theme: "dark",
        size: "flexible",
      });
    }

    if (window.turnstile) {
      doRender();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (existing) {
      existing.addEventListener("load", doRender);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", doRender);
      };
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = "1";
    s.addEventListener("load", doRender);
    document.head.appendChild(s);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="mt-2 flex justify-center" />;
}
