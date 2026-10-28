import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Karina 2026-10-28: a 100%-off order (R$ 0) is a "Matrícula gratuita", not a
// paid sale — never awaiting issue, never in the pending-NFS-e notice, never in
// sales/revenue totals, never an NFS-e of value zero; kept in the history as
// "Matrícula gratuita — sem cobrança", and markable as an internal test.

const read = (p: string) => readFileSync(path.resolve(p), "utf8");
const client = read("src/app/admin/notas-fiscais/notas-fiscais-client.tsx");
const ptBR = JSON.parse(read("src/locales/admin/pt-BR.json"));

test("fiscal screen: free enrollment is its own situation, never a sale", () => {
  assert.match(client, /const isFree = \(r: FiscalRow\) => r\.totalCents === 0/);
  assert.match(client, /free: \(r\) => !r\.internalTest && isFree\(r\)/);
  // Every sale filter (and "Todos") goes through isSale, which excludes it.
  assert.match(client, /pending: \(r\) => isSale\(r\) && notaState\(r\) === "pending"/);
  // No NFS-e form on a free enrollment; the internal-test toggle stays.
  assert.match(client, /\{!isFree\(row\) && \(/);
  assert.match(client, /send\(row\.internalTest \? "untest" : "test"\)/);
});

test("her wording, verbatim", () => {
  assert.equal(ptBR.notasFiscais.freeBadge, "Matrícula gratuita — sem cobrança");
  assert.equal(ptBR.notasFiscais.statusFree, "Matrículas gratuitas");
});

test("pending-NFS-e notice, dashboard totals and Google Ads leave it out", () => {
  assert.match(read("src/lib/admin/nfse.ts"), /\.gt\("amount_cents", 0\)/);
  assert.match(
    read("src/lib/admin/dashboard-stats.ts"),
    /\.filter\(\s*\(o\) => o\.amount_cents > 0 && !o\.internal_test,?\s*\)/,
  );
  // Order-based purchase count + export; the lead path skips a free-only buyer.
  const oci = read("src/lib/admin/oci.ts");
  assert.equal(oci.match(/\.gt\("amount_cents", 0\)/g)?.length, 2);
  assert.match(oci, /emailsWithFreeOrder\.has\(email\) && !emailToValue\.has\(email\)/);
});

test("server refuses an NFS-e of value zero", () => {
  const route = read("src/app/api/admin/nfse/issue/route.ts");
  assert.match(route, /if \(row\.amount_cents === 0\)/);
  assert.match(route, /Matrícula gratuita — sem cobrança: não gera NFS-e\./);
});

test("checkout: no ambassador attribution and no GA4 purchase for a free enrollment", () => {
  assert.match(read("src/app/api/pagbank/charge/route.ts"), /if \(!isFullDiscount\) \{\s*try \{\s*attribution = await resolveAttribution/);
  const checkout = read("src/app/checkout/checkout-client.tsx");
  assert.match(checkout, /if \(!paid \|\| purchaseTracked\.current \|\| isFullDiscount\) return;/);
  assert.match(checkout, /isFullDiscount \? "Matrícula confirmada!" : "Pagamento confirmado!"/);
});
