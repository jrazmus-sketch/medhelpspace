// Browser side of the Meta Pixel. Every call is a safe no-op unless the Pixel is
// actually loaded (allowed page + advertising consent + live or test browser),
// so callers never need to guard. Each event also goes to /api/meta/event, which
// re-sends it from the server with the same event_id (see track()). Purchase is
// NOT here on purpose: only the server sends it, from PagBank's confirmation.

import {
  META_PIXEL_LIVE,
  META_REVOKE_PENDING_COOKIE,
  META_TEST_COOKIE,
  browserUrlSafeForMeta,
  fbcFromFbclid,
  fbclidFrom,
  isValidMetaTestCode,
  metaCookieDeletions,
  readCookie,
} from "./config";
import { getStoredAdsConsent } from "@/lib/analytics/consent";

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

const FBC_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/**
 * An ad click lands with ?fbclid=…. fbevents.js turns it into the _fbc cookie
 * only when it fires an event on that address — and the browser event is skipped
 * whenever the address carries anything else (utm_*, next…). So the cookie is
 * written here, in Meta's documented format, and the later server events
 * (PageView, InitiateCheckout, the Purchase context) still carry the click.
 * Only runs once the Pixel is permitted (consent given), like everything here.
 */
function rememberAdClick(): void {
  const fbclid = fbclidFrom(window.location.search);
  if (!fbclid || readCookie(document.cookie, "_fbc")) return;
  const domain = window.location.hostname.endsWith("medhelpspace.com.br") ? "; domain=.medhelpspace.com.br" : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `_fbc=${fbcFromFbclid(fbclid, Date.now())}; path=/; max-age=${FBC_MAX_AGE_SECONDS}; SameSite=Lax${domain}${secure}`;
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
 *
 * The Pixel reports the whole address bar (it cannot be told otherwise), so it
 * fires ONLY on an address with nothing but fbclid in it (browserUrlSafeForMeta).
 * Any other address — /signup?next=…, /checkout?cohort=…&cupom=…, utm links —
 * goes from the server alone, which only ever sends origin + path. The browser
 * hands the server origin + path too: the query never leaves this page.
 */
function track(name: "PageView" | "InitiateCheckout", params?: Record<string, unknown>): void {
  whenFbq(() => {
    // fbq stays defined after a withdrawal (a script cannot be unloaded), so the
    // consent cookie is re-read at the moment of sending, every time.
    if (getStoredAdsConsent() !== "granted") return;
    rememberAdClick();
    const eventId = newEventId();
    if (browserUrlSafeForMeta(window.location.href)) {
      window.fbq?.("track", name, params ?? {}, { eventID: eventId });
    }
    fetch("/api/meta/event", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        eventId,
        url: `${window.location.origin}${window.location.pathname}`,
        customData: params ?? {},
      }),
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

// ── Withdrawal of consent ────────────────────────────────────────────────────

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function setRevokePending(on: boolean): void {
  document.cookie = on
    ? `${META_REVOKE_PENDING_COOKIE}=1; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`
    : `${META_REVOKE_PENDING_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function metaRevokePending(): boolean {
  if (typeof document === "undefined") return false;
  return readCookie(document.cookie, META_REVOKE_PENDING_COOKIE) === "1";
}

/**
 * Ask the server to forget the Meta context frozen on the signed-in person's
 * orders and ClinAct subscription. Anyone not signed in → remembered in this
 * browser and retried at the next sign-in (MetaPixel). Never throws.
 */
export async function revokeMetaOnServer(): Promise<void> {
  try {
    const res = await fetch("/api/meta/revoke", { method: "POST", keepalive: true });
    const body = (await res.json().catch(() => null)) as { signedIn?: boolean } | null;
    if (res.ok && body?.signedIn) setRevokePending(false);
    else setRevokePending(true);
  } catch {
    setRevokePending(true);
  }
}

/**
 * "Recusar" (first answer or a later change of mind): the Pixel stops sending
 * now (fbq consent revoke — MetaPixel also does it on the cookie change), Meta's
 * cookies are deleted, and the server forgets what it kept for a Purchase.
 * The consent cookie itself is written by the banner before this runs, so the
 * server already refuses every new event for this browser.
 */
export function withdrawMetaConsent(): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.fbq === "function") window.fbq("consent", "revoke");
  } catch {
    /* the Pixel may be half-loaded; the cookie gate still holds */
  }
  for (const c of metaCookieDeletions(window.location.hostname)) document.cookie = c;
  void revokeMetaOnServer();
}

/** "Aceitar" again: a withdrawal still waiting for a sign-in is no longer wanted. */
export function clearMetaRevokePending(): void {
  if (typeof document === "undefined") return;
  setRevokePending(false);
}
