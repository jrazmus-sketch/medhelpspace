// The Google Ads click id (gclid), kept from the ad landing to the checkout.
//
// The Search campaign sends clicks straight to the sales page, so a buyer may
// never pass through a lead form (where the funnels store gclid on `leads`). The
// proxy therefore stores it in a first-party cookie on ANY page, and the charge
// route freezes it onto the order — see schema-patch-orders-gclid.sql.
//
// Pure (no Next imports) so it is shared by the proxy, the charge route and tests.

export const ADS_CLICK_COOKIE = "mhs_gclid";
/** Google's maximum click-to-conversion window. */
export const ADS_CLICK_MAX_AGE_S = 90 * 24 * 60 * 60;

const GCLID_RE = /^[A-Za-z0-9_-]{10,512}$/;

export function isValidGclid(v: string | null | undefined): v is string {
  return !!v && GCLID_RE.test(v);
}

/** Cookie value: "<gclid>.<landed-at ms>". */
export function encodeAdsClick(gclid: string, landedAtMs: number): string {
  return `${gclid}.${Math.floor(landedAtMs)}`;
}

/** Parse the cookie; anything malformed or expired is ignored (never trusted). */
export function decodeAdsClick(
  raw: string | null | undefined,
  nowMs: number,
): { gclid: string; landedAt: Date } | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const gclid = raw.slice(0, dot);
  const ms = Number(raw.slice(dot + 1));
  if (!isValidGclid(gclid) || !Number.isFinite(ms) || ms <= 0) return null;
  if (ms > nowMs + 60_000 || nowMs - ms > ADS_CLICK_MAX_AGE_S * 1000) return null;
  return { gclid, landedAt: new Date(ms) };
}
