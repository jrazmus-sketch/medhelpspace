/**
 * Google Ads attribution for DIRECT purchases (2026-09-23): the ad click id is
 * kept in a cookie from any landing page to the checkout and frozen on the order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADS_CLICK_MAX_AGE_S, decodeAdsClick, encodeAdsClick, isValidGclid } from "@/lib/ads-click";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const NOW = Date.UTC(2026, 8, 23, 12);

test("a real-looking gclid round-trips through the cookie", () => {
  const g = "Cj0KCQjw_ABC-123xyz";
  assert.deepEqual(decodeAdsClick(encodeAdsClick(g, NOW - 1000), NOW), { gclid: g, landedAt: new Date(NOW - 1000) });
});

test("junk, tampered or expired cookies are ignored — never trusted", () => {
  assert.equal(isValidGclid("short"), false);
  assert.equal(isValidGclid("has space in it"), false);
  assert.equal(isValidGclid("x".repeat(513)), false);
  assert.equal(decodeAdsClick(null, NOW), null);
  assert.equal(decodeAdsClick("no-dot-here-at-all", NOW), null);
  assert.equal(decodeAdsClick("Cj0KCQjw_ABC-123xyz.notanumber", NOW), null);
  assert.equal(decodeAdsClick(encodeAdsClick("Cj0KCQjw_ABC-123xyz", NOW - ADS_CLICK_MAX_AGE_S * 1000 - 1), NOW), null, "older than 90 days");
  assert.equal(decodeAdsClick(encodeAdsClick("Cj0KCQjw_ABC-123xyz", NOW + 3_600_000), NOW), null, "from the future");
});

test("the database check never uses a regex quantifier above 255", () => {
  // Postgres rejects {n,m} with m > 255 at run time — that version would have
  // failed every checkout carrying a gclid.
  const patch = read("schema-patch-orders-gclid.sql");
  const checkLine = patch.split("\n").find((l) => l.includes("CHECK (gclid IS NULL")) ?? "";
  assert.doesNotMatch(checkLine, /\{\d+,\d+\}/);
  assert.match(checkLine, /length\(gclid\) BETWEEN 10 AND 512/);
});

test("the proxy stores the click and the charge route freezes it on the order", () => {
  assert.match(read("app/src/proxy.ts"), /ADS_CLICK_COOKIE, encodeAdsClick\(gclid/);
  const charge = read("app/src/app/api/pagbank/charge/route.ts");
  assert.match(charge, /decodeAdsClick\(request\.cookies\.get\(ADS_CLICK_COOKIE\)/);
  assert.match(charge, /gclid: adsClick\?\.gclid \?\? null/);
});

test("a sale reported from the order is never re-reported from the lead", () => {
  const oci = read("app/src/lib/admin/oci.ts");
  assert.match(oci, /emailsCoveredByOrder\.has\(email\)/);
  assert.match(oci, /OCI_CONVERSION_CHECKOUT = "Checkout started"/);
});

test("the Google Ads feed is password-protected and never cached", () => {
  const route = read("app/src/lib/admin/oci-feed.ts");
  assert.match(route, /startsWith\("Basic "\)/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /feedSinceIso: since/);
  // Only a hash is stored — never the password.
  assert.match(read("schema-patch-integration-credentials.sql"), /secret_sha256/);
});

test("Google Ads gets .csv URLs, one per conversion action", () => {
  const files = read("app/src/app/api/ads/[file]/route.ts");
  assert.match(files, /"purchase\.csv": "purchase"/);
  assert.match(files, /"checkout\.csv": "checkout"/);
  assert.match(files, /serveOciFeed\(request, key\)/);
});
