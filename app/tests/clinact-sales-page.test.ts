import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { orderSections, type PageLayout } from "@/lib/site-sections-order";
import {
  CLINACT_PLANS,
  CLINACT_PLAN_LIST,
  annualInMonthlies,
  annualPerMonth,
  formatBRL,
} from "@/lib/clinact/plans";

// Etapa 3, sales page. Karina's decisions 2, 3, 5 and 6 (2026-09-01) are the
// ones that can be got wrong quietly, so they are asserted here.

const SRC = path.resolve(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

// ── Decision 6: the page does not go public before checkout works ───────────

test("an unreadable layout keeps the page PRIVATE, never public", () => {
  // getPageLayout's catch returns this shape; the gate must fail closed.
  const closed: PageLayout = { published: false, visible: {}, position: {} };
  assert.equal(closed.published, false);
  const src = read("lib/queries/site-sections.ts");
  assert.ok(/const CLOSED: PageLayout = \{ published: false/.test(src), "the fallback must be unpublished");
  assert.ok(src.includes("return CLOSED;"), "a read failure returns the closed layout");
});

test("the page renders the placeholder unless published or admin", () => {
  const page = read("app/clinact/page.tsx");
  assert.ok(
    page.includes("if (!layout.published && !isAdmin) return <Placeholder"),
    "public + unpublished must get the placeholder",
  );
  assert.ok(page.includes("Página não publicada"), "an admin is told the page is not live");
});

// ── Section visibility and order ────────────────────────────────────────────

const SECTIONS = [{ key: "a" }, { key: "b" }, { key: "c" }];

test("hidden sections are dropped and the rest keep the given order", () => {
  const layout: PageLayout = {
    published: true,
    visible: { b: false },
    position: { a: 2, c: 1 },
  };
  assert.deepEqual(orderSections(SECTIONS, layout).map((s) => s.key), ["c", "a"]);
});

test("a section with no row stays visible in its code order", () => {
  // Adding a section in code must work without a database write.
  const layout: PageLayout = { published: true, visible: {}, position: {} };
  assert.deepEqual(orderSections(SECTIONS, layout).map((s) => s.key), ["a", "b", "c"]);
});

test("visible is only false when explicitly false", () => {
  // The reason this is a real boolean and not a site_content string: "false"
  // as text is truthy, and a typo would silently publish a hidden section.
  const layout: PageLayout = { published: true, visible: { a: true, b: false }, position: {} };
  assert.deepEqual(orderSections(SECTIONS, layout).map((s) => s.key), ["a", "c"]);
});

// ── Decision 2: price comes from the plan config, never an editable string ──

test("the plan prices are the agreed ones, in cents", () => {
  assert.equal(CLINACT_PLANS.mensal.amount_cents, 2990);
  assert.equal(CLINACT_PLANS.anual.amount_cents, 29900);
  assert.equal(formatBRL(2990), "R$ 29,90");
});

test("the annual claim is computed, so it cannot drift from the price", () => {
  // Her copy: "dez mensalidades, doze meses".
  assert.equal(annualInMonthlies(), 10);
  assert.equal(annualPerMonth(), "R$ 24,92");
});

test("no price is rendered as an editable string", () => {
  const sections = read("components/clinact/sales/sections.tsx");
  // Prices must come through the plan helpers, never a SiteText fallback.
  assert.ok(!/SiteText[^>]*fallback="[^"]*R\$/.test(sections), "no price inside a SiteText fallback");
  assert.ok(sections.includes("formatBRL(plan.amount_cents)"), "the price is read from the plan");
  assert.equal(CLINACT_PLAN_LIST.length, 2);
});

// ── Decision 3: renewal terms cannot be hidden with the plans ───────────────

test("the renewal terms live inside the plans section", () => {
  const sections = read("components/clinact/sales/sections.tsx");
  const planos = sections.slice(sections.indexOf("function Planos()"), sections.indexOf("export const CLINACT_SECTIONS"));
  assert.ok(planos.includes("clinact.planos.renovacao"), "renewal text is part of Planos");
  assert.ok(/renovada automaticamente/.test(planos), "and states the auto-renewal plainly");
  // There is no separate hideable section for it, so hiding it is impossible
  // without hiding the prices too.
  assert.ok(!/key: "renovacao"/.test(sections), "renewal must not be its own toggleable section");
});

// ── Decision 5: no typed case count ────────────────────────────────────────

test("the page never states a number of cases", () => {
  const sections = read("components/clinact/sales/sections.tsx");
  const biblioteca = sections.slice(sections.indexOf("function Biblioteca()"), sections.indexOf("function Gratuitos"));
  assert.ok(!/\d+\s*casos/.test(biblioteca), "no hardcoded case count at launch");
  assert.ok(/biblioteca viva/.test(biblioteca), "her wording instead");
});

// ── Decision 1: signup-first, no anonymous play ────────────────────────────

test("the free-trial CTA goes to signup, carrying the destination", () => {
  const sections = read("components/clinact/sales/sections.tsx");
  assert.ok(sections.includes('/signup?next=%2Fclinact%2Ftreinar'), "signup-first with next");
  assert.ok(!/href="\/clinact\/treinar"\s*$/m.test(sections), "no anonymous jump into the cases");
});
