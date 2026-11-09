// Browser side of the Meta Pixel. Every call is a safe no-op unless the Pixel is
// actually loaded (allowed page + advertising consent + live or test browser),
// so callers never need to guard. Purchase is NOT here on purpose: it is sent
// only by the server (lib/meta/capi.ts), from PagBank's confirmation.

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
 * could read it later.
 */
function fbq(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  if (typeof window.fbq === "function") return window.fbq(...args);
  let waited = 0;
  const timer = window.setInterval(() => {
    waited += POLL_MS;
    if (typeof window.fbq === "function") {
      window.clearInterval(timer);
      window.fbq(...args);
    } else if (waited >= WAIT_MS) {
      window.clearInterval(timer);
    }
  }, POLL_MS);
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
  fbq("track", "InitiateCheckout", {
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
