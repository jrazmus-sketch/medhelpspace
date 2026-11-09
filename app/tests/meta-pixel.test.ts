/**
 * Meta Pixel + Conversions API (Karina 2026-11-04 / 2026-11-09).
 *
 * Locks the rules she set: the Pixel exists only on public sales / checkout /
 * signup pages (never member areas or clinical content), Purchase is sent ONLY
 * from the server after PagBank confirms (Revalida race winner, ClinAct first
 * invoice), personal data leaves only hashed, and nothing about cards / CPF.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isMetaPixelPath, isValidMetaTestCode, META_PIXEL_ID, META_PIXEL_LIVE } from "@/lib/meta/config";
import {
  buildMirrorPayload,
  buildPurchasePayload,
  isMirrorEvent,
  isValidEventId,
  normalizePhoneBR,
  asContext,
  sanitizeMirrorCustomData,
  type MetaContext,
} from "@/lib/meta/capi-payload";

const SRC = path.join(process.cwd(), "src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

test("Pixel id is the 'MedHelpSpace | Web' dataset Karina sent", () => {
  assert.equal(META_PIXEL_ID, "1642376477393533");
});

test("Pixel pages: public sales / checkout / signup only", () => {
  for (const p of ["/", "/revalida", "/loja", "/checkout", "/signup", "/clinact", "/clinact/assinar", "/clinact/gratis", "/revalida/"]) {
    assert.ok(isMetaPixelPath(p), p);
  }
  for (const p of [
    "/app",
    "/app/cardiologia",
    "/admin",
    "/clinact/treinar",
    "/clinact/caso/no-inicio-do-plantao", // free cases are clinical content
    "/clinact/evolucao",
    "/clinact/assinatura",
    "/clinact/preview/x",
    "/simulado-revalida",
    "/login",
    "/embaixador",
  ]) {
    assert.ok(!isMetaPixelPath(p), p);
  }
});

test("test-mode codes look like Meta's Test Events codes", () => {
  assert.ok(isValidMetaTestCode("TEST12345"));
  assert.ok(isValidMetaTestCode("test4A2B"));
  assert.ok(!isValidMetaTestCode("off"));
  assert.ok(!isValidMetaTestCode("TEST"));
  assert.ok(!isValidMetaTestCode("TEST1; path=/"));
  assert.ok(!isValidMetaTestCode(null));
});

test("phones are normalised to 55 + DDD + number before hashing", () => {
  assert.equal(normalizePhoneBR("(11) 98765-4321"), "5511987654321");
  assert.equal(normalizePhoneBR("1133334444"), "551133334444");
  assert.equal(normalizePhoneBR("+55 11 98765-4321"), "5511987654321");
  assert.equal(normalizePhoneBR("123"), null);
  assert.equal(normalizePhoneBR(null), null);
});

const ctx: MetaContext = {
  v: 1,
  fbp: "fb.1.1700000000000.123",
  fbc: null,
  ip: "177.10.10.10",
  ua: "Mozilla/5.0",
  url: "https://www.medhelpspace.com.br/checkout",
  test_event_code: null,
  captured_at: "2026-11-09T12:00:00.000Z",
};

test("Purchase payload: value in BRL, ids for dedup, PII only hashed", () => {
  const body = buildPurchasePayload({
    eventId: "revalida_abc",
    valueCents: 149850,
    userId: "user-1",
    email: "  Aluna@Example.com ",
    phone: "(11) 98765-4321",
    context: ctx,
    customData: { product: "revalida", turma: "revalida-2027-1" },
    eventTime: 1794243000,
  });
  const ev = body.data[0];
  assert.equal(ev.event_name, "Purchase");
  assert.equal(ev.event_id, "revalida_abc");
  assert.equal(ev.action_source, "website");
  assert.equal(ev.custom_data.currency, "BRL");
  assert.equal(ev.custom_data.value, 1498.5);
  assert.equal((ev.custom_data as Record<string, unknown>).product, "revalida");
  const ud = ev.user_data as Record<string, unknown>;
  assert.deepEqual(ud.em, [sha("aluna@example.com")]);
  assert.deepEqual(ud.ph, [sha("5511987654321")]);
  assert.deepEqual(ud.external_id, [sha("user-1")]);
  assert.equal(ud.fbp, ctx.fbp);
  assert.equal("fbc" in ud, false);
  assert.equal("test_event_code" in body, false);
  const json = JSON.stringify(body);
  assert.ok(!json.includes("aluna@example.com") && !json.includes("98765"), "no clear-text PII");
});

test("a Test Events browser's code rides on the event", () => {
  const body = buildPurchasePayload({
    eventId: "clinact_SUBS_1",
    valueCents: 990,
    userId: "u",
    email: null,
    phone: null,
    context: { ...ctx, test_event_code: "TEST999" },
    customData: {},
    eventTime: 1,
  });
  assert.equal(body.test_event_code, "TEST999");
});

test("a stored context is only trusted in its known shape", () => {
  assert.equal(asContext(null), null);
  assert.equal(asContext({ v: 2 }), null);
  assert.ok(asContext(ctx));
});

test("Purchase is sent only from the two server confirmation paths", () => {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) {
        const src = readFileSync(full, "utf8");
        if (/send(Revalida|ClinactFirst)Purchase\(/.test(src) && !full.endsWith(path.join("meta", "capi.ts"))) {
          callers.push(path.relative(SRC, full).replace(/\\/g, "/"));
        }
      }
    }
  };
  walk(SRC);
  assert.deepEqual(callers.sort(), ["lib/clinact/invoices.ts", "lib/pagbank/finalize.ts"]);
  // Revalida: after the paid-flip race is won, never for R$ 0.
  const fin = read("lib/pagbank/finalize.ts");
  assert.ok(fin.indexOf("await sendRevalidaPurchase(") > fin.indexOf("if (!winners || winners.length === 0)"));
  assert.match(fin, /if \(expectedCents > 0\) \{[\s\S]{0,200}await sendRevalidaPurchase\(orderId\)/);
  // ClinAct: first invoice only.
  assert.match(read("lib/meta/capi.ts"), /\(i\.occurrence \?\? 1\) === 1/);
});

test("no browser-side Purchase for Meta, and the Pixel never auto-tracks", () => {
  assert.ok(!/fbq\([^)]*["']Purchase["']/.test(read("lib/meta/pixel.ts")));
  const comp = read("components/analytics/meta-pixel.tsx");
  assert.match(comp, /fbq\.disablePushState = true/);
  assert.match(comp, /'autoConfig', false/);
});

test("browser mirror: only PageView / InitiateCheckout, untrusted fields stripped", () => {
  assert.ok(isMirrorEvent("PageView") && isMirrorEvent("InitiateCheckout"));
  assert.ok(!isMirrorEvent("Purchase"), "Purchase may only come from PagBank's confirmation");
  assert.ok(isValidEventId("2f0c1a8e-1b2c-4d5e-8f90-123456789abc"));
  assert.ok(!isValidEventId("x"));
  assert.ok(!isValidEventId("abc def ghi"));
  const clean = sanitizeMirrorCustomData({
    currency: "BRL",
    value: 20.9,
    content_ids: ["clinact_monthly", "<script>"],
    content_name: "ClinAct mensal",
    content_type: "product",
    num_items: 1,
    product: "clinact",
    plan: "monthly",
    email: "a@b.com",
    turma: "x@y",
    em: ["hash"],
  });
  assert.deepEqual(clean, {
    currency: "BRL",
    value: 20.9,
    content_ids: ["clinact_monthly"],
    content_name: "ClinAct mensal",
    content_type: "product",
    num_items: 1,
    product: "clinact",
    plan: "monthly",
  });
});

test("mirror payload: same event_id, test code, no custom data on PageView", () => {
  const body = buildMirrorPayload({
    eventName: "PageView",
    eventId: "2f0c1a8e-1b2c-4d5e-8f90-123456789abc",
    userId: null,
    context: { ...ctx, test_event_code: "TEST35482" },
    customData: { value: 1 },
    eventTime: 1,
  });
  assert.equal(body.data[0].event_id, "2f0c1a8e-1b2c-4d5e-8f90-123456789abc");
  assert.equal(body.test_event_code, "TEST35482");
  assert.equal("custom_data" in body.data[0], false);
  assert.equal("external_id" in (body.data[0].user_data as object), false);
});

test("browser events share one event_id between Pixel and server", () => {
  const px = read("lib/meta/pixel.ts");
  assert.match(px, /fbq\?\.\("track", name, params \?\? \{\}, \{ eventID: eventId \}\)/);
  assert.match(px, /JSON\.stringify\(\{ name, eventId,/);
  assert.match(px, /scrubUrlForMeta\(\);\s*\n\s*const eventId/);
  assert.match(read("app/api/meta/event/route.ts"), /isMetaPixelPath\(page\.pathname\)/);
});

test("the CAPI context is captured only with advertising consent", () => {
  const capi = read("lib/meta/capi.ts");
  assert.match(capi, /ADS_CONSENT_COOKIE\)\?\.value !== "granted"\) return null/);
  assert.equal(typeof META_PIXEL_LIVE, "boolean");
});
