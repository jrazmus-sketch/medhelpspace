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
export const META_PIXEL_LIVE = false;

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

/** Read one cookie from a `document.cookie`-style string. */
export function readCookie(cookieString: string, name: string): string | null {
  const m = cookieString.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
