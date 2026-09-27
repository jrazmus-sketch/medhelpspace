import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildFirstTouch,
  firstTouchLandingPath,
  firstTouchReferrer,
  firstTouchUtm,
  parseFirstTouch,
  serializeFirstTouch,
} from "@/lib/magnet/first-touch";

const SRC = path.join(process.cwd(), "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8").split("\r\n").join("\n");

const adLanding = buildFirstTouch({
  search: "?gclid=Cj0abc&utm_source=google&utm_medium=cpc&utm_campaign=curso-2027",
  pathname: "/",
  referrer: "https://www.google.com/",
  host: "www.medhelpspace.com.br",
  now: new Date("2026-09-25T10:00:00Z"),
})!;

test("an ad landing is remembered with its gclid, tags, referrer, path and time", () => {
  assert.deepEqual(adLanding, {
    s: "google",
    m: "cpc",
    c: "curso-2027",
    g: "Cj0abc",
    r: "https://www.google.com/",
    p: "/?gclid=Cj0abc&utm_source=google&utm_medium=cpc&utm_campaign=curso-2027",
    at: "2026-09-25T10:00:00.000Z",
  });
  // Round-trips through the cookie value untouched.
  assert.deepEqual(parseFirstTouch(serializeFirstTouch(adLanding)), adLanding);
});

test("a referrer on our own host is not a source; a direct landing stores no referrer", () => {
  const internal = buildFirstTouch({ search: "", pathname: "/loja", referrer: "https://www.medhelpspace.com.br/", host: "www.medhelpspace.com.br" })!;
  assert.equal(internal.r, undefined);
  assert.equal(internal.p, "/loja");
  const direct = buildFirstTouch({ search: "", pathname: "/", referrer: "", host: "www.medhelpspace.com.br" })!;
  assert.equal(direct.r, undefined);
  assert.ok(direct.at);
});

test("Karina's case: back days later through a homepage CTA, the ad click still wins", () => {
  // What the funnel page sees at submit time: the site's own CTA tags, no gclid,
  // and our own site as referrer.
  const atSubmit = { source: "site", medium: "pricing_downsell", campaign: "home", gclid: null };
  const utm = firstTouchUtm(atSubmit, adLanding);
  assert.equal(utm.source, "google");
  assert.equal(utm.medium, "cpc");
  assert.equal(utm.campaign, "curso-2027");
  assert.equal(utm.gclid, "Cj0abc");
  assert.equal(firstTouchReferrer("https://www.medhelpspace.com.br/", adLanding), "https://www.google.com/");
  assert.equal(firstTouchLandingPath("/questoes-revalida?utm_source=site&utm_medium=pricing_downsell&utm_campaign=home", adLanding), adLanding.p);
});

test("an organic first touch never erases a real campaign seen at submit time", () => {
  const organic = buildFirstTouch({ search: "", pathname: "/", referrer: "https://www.google.com/", host: "www.medhelpspace.com.br" });
  const utm = firstTouchUtm({ source: "instagram", medium: "bio", campaign: "set", gclid: null }, organic);
  assert.equal(utm.source, "instagram");
  assert.equal(utm.campaign, "set");
  // …but the first landing's referrer and path still describe where they first came from.
  assert.equal(firstTouchReferrer("https://www.medhelpspace.com.br/", organic), "https://www.google.com/");
});

test("without a cookie everything behaves exactly as before", () => {
  const cur = { source: "site", medium: "hero", campaign: "home", gclid: "X" };
  assert.deepEqual(firstTouchUtm(cur, null), { source: "site", medium: "hero", campaign: "home", term: null, content: null, gclid: "X" });
  assert.equal(firstTouchReferrer("https://t.co/", null), "https://t.co/");
  assert.equal(firstTouchLandingPath("/x", null), "/x");
  assert.equal(parseFirstTouch("not json"), null);
  assert.equal(parseFirstTouch(null), null);
});

test("every lead-creating action reads the first touch", () => {
  const magnet = read("actions/magnet.ts");
  const simulado = read("actions/simulado.ts");
  for (const [file, src, inserts] of [
    ["actions/magnet.ts", magnet, 5],
    ["actions/simulado.ts", simulado, 1],
  ] as const) {
    const n = (src.match(/readFirstTouch\(\)/g) ?? []).length;
    assert.ok(n >= inserts, `${file}: ${n} readFirstTouch() call(s), expected at least ${inserts} (one per lead insert path)`);
    assert.doesNotMatch(src, /utm_source: input\.utm\?\.source/, `${file}: a lead insert bypasses the first-touch merge`);
  }
  assert.match(read("app/layout.tsx"), /<FirstTouchCapture \/>/, "the capture component is not mounted site-wide");
});
