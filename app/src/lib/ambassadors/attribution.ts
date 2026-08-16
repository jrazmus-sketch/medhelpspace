import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Ambassador sale attribution (Contrato de Parceria Comercial, cl. 3.1).
//
// Two instruments carry attribution and they do NOT rank equally:
//
//   1. The coupon, typed into the order. Survives a device switch, an ad blocker,
//      a cleared cookie jar and a purchase made three weeks later on a work
//      laptop. It is the reliable one, which is why the guide tells ambassadors
//      to lead with the coupon rather than the link.
//   2. The tracking link, carried by a first-party cookie for 30 days. Dies with
//      the browser profile.
//
// So: the coupon always wins, regardless of how recent the click was. Between two
// links, the last click wins — which falls out of the cookie simply being
// overwritten on each /r/<code> visit.
//
// Attribution is recorded on the ORDER, never on the user: guest checkout means
// the buyer frequently has no account until after paying.

// Cookie name and window live in ref-link.ts, which stays free of `server-only`
// so the redirect guard beside them can be unit-tested. Re-exported here so
// callers have a single import for "everything attribution".
export { REF_COOKIE, REF_MAX_AGE_SECONDS } from "./ref-link";

export type AttributionSource = "coupon" | "link";

export type Attribution = {
  ambassadorId: number;
  source: AttributionSource;
};

/**
 * Resolve which ambassador — if any — a pending order should be credited to.
 *
 * Deliberately does NOT check whether the ambassador is active or in contract.
 * That test belongs to the commission trigger, which applies it against the date
 * of sale (cl. 4.4). Recording the attribution regardless keeps the audit trail
 * intact for the review right in cl. 8.3: "no commission was generated because
 * the contract had ended" is a far better answer to a dispute than a blank field.
 */
export async function resolveAttribution(args: {
  couponId: number | null;
  refCode: string | null | undefined;
}): Promise<Attribution | null> {
  const { couponId, refCode } = args;
  const admin = createAdminClient();

  // ── The coupon outranks the cookie ────────────────────────────────────────
  if (couponId != null) {
    const { data } = await admin
      .from("ambassadors")
      .select("id")
      .eq("coupon_id", couponId)
      .maybeSingle();
    if (data?.id) {
      return { ambassadorId: data.id as number, source: "coupon" };
    }
    // A coupon that belongs to no ambassador is one of our own promo codes. It
    // does not clear a link attribution — cl. 3.1 keeps the link and charges the
    // commission on whatever was actually paid — so fall through to the cookie.
  }

  // ── Otherwise the tracking link ───────────────────────────────────────────
  const code = refCode?.trim();
  if (!code) return null;

  const { data } = await admin
    .from("ambassadors")
    .select("id")
    .ilike("code", code)
    .maybeSingle();

  return data?.id ? { ambassadorId: data.id as number, source: "link" } : null;
}
