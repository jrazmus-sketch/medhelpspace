import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// MedHelpSpace home page (Karina 2026-11-05): "/" became a two-product chooser
// and the Revalida sales page moved to /revalida. These pin the move so nothing
// that means "the Revalida page" quietly points back at the chooser.

const SRC = path.join(process.cwd(), "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

test("the home page offers exactly the two products, each to its own sales page", () => {
  const home = read("app/page.tsx");
  assert.match(home, /href="\/revalida"/);
  assert.match(home, /href="\/clinact"/);
  // Her descriptions, verbatim, as the editable fallbacks.
  assert.match(home, /fallback="Preparação para o Revalida INEP\."/);
  assert.match(home, /fallback="Treino de raciocínio clínico com casos interativos\."/);
  assert.equal((home.match(/fallback="Conhecer"/g) ?? []).length, 2);
  // The chooser is not a sales page: no Revalida sections, no pricing.
  assert.doesNotMatch(home, /LandingEvents|PricingCTA|getCohortsForSale/);
});

test("every card click is tracked by product", () => {
  assert.match(read("components/home/product-card.tsx"), /trackEvent\("select_product", \{ product, location: "home" \}\)/);
});

test("old /#anchor links are forwarded to the same anchor on /revalida", () => {
  assert.match(read("app/page.tsx"), /<LegacyHashForward \/>/);
  assert.match(read("components/home/legacy-hash-forward.tsx"), /window\.location\.replace\(`\/revalida\$\{window\.location\.search\}\$\{hash\}`\)/);
});

test("the Revalida sales page lives at /revalida with its own share card and canonical", () => {
  const page = read("app/revalida/page.tsx");
  assert.match(page, /alternates: \{ canonical: "\/revalida" \}/);
  assert.match(page, /openGraph: \{/);
  assert.match(page, /export const revalidate = 3600/);
});

test("Revalida-only surfaces point at /revalida, never at the chooser", () => {
  for (const p of [
    "app/loja/page.tsx",
    "app/questoes-revalida/page.tsx",
    "app/questoes-revalida/resultado/page.tsx",
    "app/flashcards-revalida/page.tsx",
    "app/flashcards-gratis/page.tsx",
    "app/simulado-revalida/page.tsx",
    "components/landing/landing-nav.tsx",
    "components/landing/landing-footer.tsx",
    "components/magnet/flashcards-session.tsx",
    "components/magnet/magnet-reward.tsx",
    "components/magnet/simulado-report.tsx",
  ]) {
    const src = read(p);
    assert.doesNotMatch(src, /href="\/(#[^"]*|\?[^"]*)?"/, p);
  }
  assert.match(read("components/landing/landing-footer.tsx"), /href="\/revalida#faq"/);
});

test("ambassador links land on the Revalida page by default", () => {
  assert.match(read("app/r/[code]/route.ts"), /safe === "\/" \? "\/revalida" : safe/);
});

test("price edits and the midnight refresh revalidate /revalida", () => {
  assert.match(read("actions/admin.ts"), /revalidatePath\("\/revalida"\)/);
  assert.match(read("actions/inline-edit.ts"), /revalidatePath\("\/revalida"\)/);
  assert.match(read("app/api/cron/storefront-refresh/route.ts"), /"\/revalida", "\/loja"/);
  assert.match(read("actions/site-pages.ts"), /\["\/revalida", "\/loja"\]/);
});

test("the sitemap lists the home page, /revalida and /clinact", () => {
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /url: SITE,/);
  assert.match(sitemap, /\$\{SITE\}\/revalida/);
  assert.match(sitemap, /\$\{SITE\}\/clinact/);
});
