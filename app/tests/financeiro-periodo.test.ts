/**
 * Administração → Financeiro (Karina 2026-11-19): period filter (month/year, one date, a range, everything), CSV that
 * follows the filters, indicators per period, and internal tests hidden — never deleted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  inPeriod,
  csvFileName,
  buildBillingCsv,
  billingStats,
  type BillingCsvRow,
} from "@/lib/admin/billing-period";

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");

test("a month is the Brasília calendar month of the ORDER date (22h on 30/11 is November, not December)", () => {
  const nov = { mode: "month", year: 2026, month: 11 } as const;
  assert.equal(inPeriod("2026-12-01T01:30:00Z", nov), true); //  30/11 22h30 in Brasília
  assert.equal(inPeriod("2026-12-01T03:30:00Z", nov), false); // 01/12 00h30 in Brasília
  assert.equal(inPeriod("2026-11-01T02:59:00Z", nov), false); // 31/10 23h59 in Brasília
  assert.equal(inPeriod("2026-11-01T03:00:00Z", nov), true);
  assert.equal(inPeriod("2025-11-15T12:00:00Z", nov), false); // same month, another year
});

test("one date, a range (inclusive, either order, open ends) and 'everything'", () => {
  assert.equal(inPeriod("2026-11-19T15:00:00Z", { mode: "day", date: "2026-11-19" }), true);
  assert.equal(inPeriod("2026-11-20T15:00:00Z", { mode: "day", date: "2026-11-19" }), false);
  const r = { mode: "range", from: "2026-11-01", to: "2026-11-15" } as const;
  assert.equal(inPeriod("2026-11-01T12:00:00Z", r), true);
  assert.equal(inPeriod("2026-11-15T23:00:00Z", r), true); // 15/11 20h in Brasília
  assert.equal(inPeriod("2026-11-16T12:00:00Z", r), false);
  assert.equal(inPeriod("2026-11-10T12:00:00Z", { mode: "range", from: "2026-11-15", to: "2026-11-01" }), true);
  assert.equal(inPeriod("2026-11-30T12:00:00Z", { mode: "range", from: "2026-11-15", to: "" }), true);
  assert.equal(inPeriod("2026-11-01T12:00:00Z", { mode: "range", from: "2026-11-15", to: "" }), false);
  assert.equal(inPeriod("2020-01-01T12:00:00Z", { mode: "all" }), true);
  // An incomplete date filters nothing yet (the list does not go blank while she types).
  assert.equal(inPeriod("2026-11-19T15:00:00Z", { mode: "day", date: "" }), true);
});

test("the file name says which period it holds", () => {
  assert.equal(csvFileName({ mode: "month", year: 2026, month: 11 }, false), "financeiro-2026-11.csv");
  assert.equal(csvFileName({ mode: "day", date: "2026-11-19" }, false), "financeiro-2026-11-19.csv");
  assert.equal(csvFileName({ mode: "range", from: "2026-11-30", to: "2026-11-01" }, false), "financeiro-2026-11-01_a_2026-11-30.csv");
  assert.equal(csvFileName({ mode: "all" }, false), "financeiro-completo.csv");
  assert.equal(csvFileName({ mode: "all" }, true), "financeiro-testes-internos-completo.csv");
});

const row = (o: Partial<BillingCsvRow>): BillingCsvRow => ({
  id: "6f1c2c1e-0000-4000-8000-000000000001", createdAt: "2026-11-19T15:04:00Z", paidAt: "2026-11-19T15:05:00Z",
  pagbankChargeId: "CHAR_1", clientName: "Ana Souza", email: "ana@example.com", studentCpf: "12345678909",
  tomadorName: "Ana Souza", tomadorDoc: "12345678909", cohortName: "Revalida 2027.1",
  originalCents: 299700, discountCents: 0, surchargeCents: 18000, amountCents: 317700, paymentMethod: "credit_card",
  ccBrand: "visa", ccInstallments: 10, status: "paid", internalTest: false, ...o,
});

test("CSV for the accountant: date, order, client, product/turma, values, method, status — opens in Excel pt-BR", () => {
  const csv = buildBillingCsv([row({}), row({ paymentMethod: "pix", ccBrand: null, ccInstallments: null, status: "pending", paidAt: null, clientName: 'Bia "B"; Lima' })]);
  assert.ok(csv.startsWith("﻿"), "UTF-8 BOM so accents open correctly");
  const lines = csv.slice(1).trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  const head = lines[0].split(";");
  for (const h of ["Data do pedido", "Pedido", "Cliente", "Produto", "Turma", "Valor cobrado (R$)", "Método de pagamento", "Status"]) {
    assert.ok(head.includes(h), h);
  }
  const first = lines[1].split(";");
  assert.equal(first[head.indexOf("Data do pedido")], "19/11/2026 12:04");      // Brasília
  assert.equal(first[head.indexOf("Valor cobrado (R$)")], "3177,00");            // decimal comma
  assert.equal(first[head.indexOf("Acréscimo do parcelamento (R$)")], "180,00");
  assert.equal(first[head.indexOf("Método de pagamento")], "Cartão de crédito (visa)");
  assert.equal(first[head.indexOf("Status")], "Pago");
  assert.equal(first[head.indexOf("Teste interno")], "Não");
  assert.ok(lines[2].includes('"Bia ""B""; Lima"'), "a ; or quote inside a value is quoted");
  assert.ok(lines[2].includes(";Pendente;"));
});

test("a buyer-typed value can never run as a spreadsheet formula", () => {
  const csv = buildBillingCsv([row({ clientName: '=HYPERLINK("http://x","clique")', email: "+5511@x.com", tomadorName: "@SUM(A1)" })]);
  const line = csv.slice(1).split("\r\n")[1];
  assert.ok(line.includes(`"'=HYPERLINK(""http://x"",""clique"")"`), line);
  assert.ok(line.includes(";'+5511@x.com;"));
  assert.ok(line.includes(";'@SUM(A1);"));
  assert.ok(line.includes(";3177,00;"), "money untouched");
});

test("indicators: tests never count; a R$ 0 enrollment is not a paid sale; revenue = paid charges only", () => {
  const s = billingStats([
    { status: "paid", amountCents: 299700, internalTest: false },
    { status: "paid", amountCents: 100, internalTest: true },
    { status: "paid", amountCents: 0, internalTest: false },
    { status: "refunded", amountCents: 299700, internalTest: false },
    { status: "pending", amountCents: 299700, internalTest: false },
  ]);
  assert.deepEqual(s, { total: 4, paid: 1, revenueCents: 299700, pending: 1 });
});

test("hiding a test only flips orders.internal_test — no delete, no PagBank, no membership; audited; billing roles only", () => {
  const r = src("app", "api", "admin", "billing", "test", "route.ts");
  assert.match(r, /\["super_admin", "billing_admin"\]\.includes/);
  assert.match(r, /\.update\(\{ internal_test: test \}\)/);
  assert.doesNotMatch(r, /\.delete\(/);
  assert.doesNotMatch(r, /fetch\(/); // never calls PagBank (or anything else)
  assert.doesNotMatch(r, /from\("user_cohort_memberships"\)/);
  assert.equal(r.match(/\.update\(/g)?.length, 1, "one write: the flag");
  assert.match(r, /nfse_test_marked/);
  assert.match(r, /admin_audit_log/);
});

test("the page reads EVERY order (paged past the 1000-row cap) and the export uses the filtered list", () => {
  const p = src("app", "admin", "billing", "page.tsx");
  assert.match(p, /\.range\(from, from \+ 999\)/);
  assert.doesNotMatch(p, /\.limit\(500\)/);
  const c = src("app", "admin", "billing", "billing-client.tsx");
  assert.match(c, /buildBillingCsv\(filtered\)/);
  assert.match(c, /billingStats\(inPeriodRows\)/);
  // a confirmation is shown before anything is marked
  assert.match(c, /setTestConfirm\(true\)/);
});
