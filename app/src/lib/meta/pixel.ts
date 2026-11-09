// Browser side of the Meta Pixel. Every call is a safe no-op unless the Pixel is
// actually loaded (allowed page + advertising consent + live or test browser),
// so callers never need to guard. Each event also goes to /api/meta/event, which
// re-sends it from the server with the same event_id (see track()). Purchase is
// NOT here on purpose: only the server sends it, from PagBank's confirmation.

import {
  META_PIXEL_LIVE,
  META_TEST_COOKIE,
  isValidMetaTestCode,
  readCookie,
} from "./config";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { disablePushState?: boolean; allowDuplicatePageViews?: boolean };
    _fbq?: unknown;
  }
}

/** The Test Events code this browser carries, if any. */
export function metaTestCode(): string | null {
  if (typeof document === "undefined") return null;
  const v = readCookie(document.cookie, META_TEST_COOKIE);
  return isValidMetaTestCode(v) ? v : null;
}

/** Is Meta switched on for THIS browser — live for everyone, or a tester's browser. */
export function metaActiveInBrowser(): boolean {
  return META_PIXEL_LIVE || metaTestCode() !== null;
}

const WAIT_MS = 10_000;
const POLL_MS = 250;

/**
 * fbq loads after hydration (and only after consent), so an event fired on page
 * open waits up to 10 s for it, then is dropped — never queued anywhere Meta
 * could read it later. fbq existing = every gate in MetaPixel passed.
 */
function whenFbq(run: () => void): void {
  if (typeof window === "undefined") return;
  if (typeof window.fbq === "function") return run();
  let waited = 0;
  const timer = window.setInterval(() => {
    waited += POLL_MS;
    if (typeof window.fbq === "function") {
      window.clearInterval(timer);
      run();
    } else if (waited >= WAIT_MS) {
      window.clearInterval(timer);
    }
  }, POLL_MS);
}

/**
 * The Pixel reports the full address bar to Meta. Nothing personal may ride on
 * it: an `email` parameter (the checkout accepts ?email= to prefill) or any
 * value with an "@" is removed from the URL before the first event is sent.
 */
function scrubUrlForMeta(): void {
  const url = new URL(window.location.href);
  let changed = false;
  for (const [k, v] of [...url.searchParams]) {
    if (k.toLowerCase() === "email" || v.includes("@")) {
      url.searchParams.delete(k);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(window.history.state, "", url.toString());
}

function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * One event, two channels, ONE event_id: the Pixel in the browser and the same
 * event from our server (Conversions API). Meta keeps one of the pair. The
 * server copy is what carries the Test Events code in test mode, and what still
 * arrives when an ad blocker eats the Pixel. The server re-checks consent.
 */
function track(name: "PageView" | "InitiateCheckout", params?: Record<string, unknown>): void {
  whenFbq(() => {
    scrubUrlForMeta();
    const eventId = newEventId();
    window.fbq?.("track", name, params ?? {}, { eventID: eventId });
    fetch("/api/meta/event", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, eventId, url: window.location.href, customData: params ?? {} }),
    }).catch(() => {});
  });
}

/** PageView — called by MetaPixel once per allowed page visit. */
export function metaPageView(): void {
  track("PageView");
}

/**
 * InitiateCheckout — the checkout page actually opened. `value` in BRL (reais).
 * `product` and `plan`/`turma` let the two products be told apart in Meta.
 */
export function metaInitiateCheckout(input: {
  product: "revalida" | "clinact";
  contentId: string;
  contentName: string;
  value: number;
  plan?: string;
  turma?: string;
}): void {
  track("InitiateCheckout", {
    currency: "BRL",
    value: input.value,
    content_type: "product",
    content_ids: [input.contentId],
    content_name: input.contentName,
    num_items: 1,
    product: input.product,
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.turma ? { turma: input.turma } : {}),
  });
}
