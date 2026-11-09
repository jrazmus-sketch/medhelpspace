// Meta Pixel + Conversions API — shared config (client AND server safe).
//
// Karina 2026-11-04 / 2026-11-09 ("Integração do Meta Pixel"): one Pixel for
// both products, dataset "MedHelpSpace | Web". PageView + InitiateCheckout in the
// browser; Purchase ONLY from the server (Conversions API) when PagBank confirms
// the payment, and only for a buyer who accepted advertising cookies.
//
// Deliberately narrower than GA4 (lib/analytics/config.ts):
//   - an ALLOWLIST of public sales / checkout / signup pages, never a denylist.
//     The free ClinAct cases (/clinact/caso) are clinical content and stay out,
//     as do /app, /admin and every member area;
//   - EXPLICIT opt-in: nothing loads until the visitor presses "Aceitar" on the
//     banner (GA's notice + opt-out posture is not enough for advertising).

/** The Pixel / dataset id. Public by design (it ships in the browser). */
export const META_PIXEL_ID = "1642376477393533";

/**
 * false = TEST MODE: the Pixel loads and the Conversions API sends ONLY for a
 * browser that opened the site with `?meta_test=TESTxxxx` (the code from Events
 * Manager → Test Events), and every server event carries that code, so nothing
 * reaches the campaigns. The public banner keeps its current text.
 *
 * true = LIVE for every visitor who accepts the (new) cookie notice. Flip only
 * after Karina approves the new notice + Privacy Policy text.
 */
export const META_PIXEL_LIVE = true; // Karina approved the texts 2026-11-09 + validated in Test Events

/** Advertising consent — set by the same banner as analytics, explicit only. */
export const ADS_CONSENT_COOKIE = "mhs_ads_consent";

/** Test Events code for this browser session (`?meta_test=TEST123`; `?meta_test=off` clears). */
export const META_TEST_COOKIE = "mhs_meta_test";
export const META_TEST_PARAM = "meta_test";
const TEST_CODE_RE = /^TEST[A-Z0-9]{1,24}$/i;

export function isValidMetaTestCode(value: string | null | undefined): value is string {
  return !!value && TEST_CODE_RE.test(value);
}

/**
 * The only pages where the Pixel exists. Exact paths: a page added later is NOT
 * tracked until someone decides it should be.
 */
export const META_PIXEL_PATHS = [
  "/", // MedHelpSpace home (chooser)
  "/revalida", // Revalida sales page
  "/loja", // Revalida store
  "/checkout", // Revalida checkout → InitiateCheckout
  "/signup", // cadastro
  "/clinact", // ClinAct sales page
  "/clinact/gratis", // ClinAct free-cases signup door
  "/clinact/assinar", // ClinAct checkout → InitiateCheckout
] as const;

export function isMetaPixelPath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (META_PIXEL_PATHS as readonly string[]).includes(p);
}

/**
 * Query parameters the BROWSER Pixel may carry to Meta (Karina 2026-11-09, data
 * minimisation). The Pixel always reports the full address bar, so this is the
 * only way to bound what it sends. Just `fbclid`: it is what Meta needs to tie a
 * visit to the ad click (it becomes the _fbc cookie). Everything else stays on
 * the site — utm_* (GA4 + first-touch cookie already read them), next (it can
 * name a clinical case or a member page), cupom, cohort, plano, email, tokens.
 */
export const META_BROWSER_URL_PARAMS = ["fbclid"] as const;

/**
 * May the browser Pixel fire on this address? Only when the query carries
 * nothing but META_BROWSER_URL_PARAMS and there is no #fragment (auth redirects
 * can carry tokens there). When false the event still goes, from the SERVER only,
 * with the address cut to origin + path.
 */
export function browserUrlSafeForMeta(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.hash && url.hash !== "#") return false;
  for (const key of url.searchParams.keys()) {
    if (!(META_BROWSER_URL_PARAMS as readonly string[]).includes(key)) return false;
  }
  return true;
}

/** The ad-click id from a query string, when it has a sane shape. */
export function fbclidFrom(search: string): string | null {
  const v = new URLSearchParams(search).get("fbclid");
  return v && /^[A-Za-z0-9_-]{1,500}$/.test(v) ? v : null;
}

/** Meta's documented _fbc format: fb.<subdomain index>.<creation ms>.<fbclid>. */
export function fbcFromFbclid(fbclid: string, nowMs: number): string {
  return `fb.1.${nowMs}.${fbclid}`;
}

// ── Withdrawal of consent (Karina 2026-11-09, item 4) ────────────────────────
// "Preferências de cookies" reopens the same notice; "Recusar" then stops the
// Pixel, deletes Meta's own cookies, and asks the server to forget the Meta
// context frozen on the person's orders / subscription — so a Pix paid later
// can no longer produce a Purchase.

/** Meta's own browser cookies (browser id, ad click). */
export const META_BROWSER_COOKIES = ["_fbp", "_fbc"] as const;

/**
 * Set when "Recusar" happened while nobody was signed in: the next time this
 * browser has a signed-in user, the server cleanup runs for them.
 */
export const META_REVOKE_PENDING_COOKIE = "mhs_meta_revoke";

/** Fired on window to reopen the consent notice (footer link). */
export const CONSENT_OPEN_EVENT = "mhs-consent-open";

/**
 * Cookie strings that delete the Meta cookies. fbevents.js writes them on the
 * registrable domain (.medhelpspace.com.br) and our _fbc helper does the same,
 * but a host-only copy is deleted too, so no variant survives.
 */
export function metaCookieDeletions(hostname: string): string[] {
  const domains: string[] = [""];
  if (hostname === "medhelpspace.com.br" || hostname.endsWith(".medhelpspace.com.br")) {
    domains.push("; domain=.medhelpspace.com.br");
  }
  return META_BROWSER_COOKIES.flatMap((name) =>
    domains.map((d) => `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${d}`),
  );
}

/** Read one cookie from a `document.cookie`-style string. */
export function readCookie(cookieString: string, name: string): string | null {
  const m = cookieString.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
