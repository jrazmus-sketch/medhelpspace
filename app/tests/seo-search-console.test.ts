import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Karina 2026-10-09 ("Atualizações na página principal do Revalida + Google Search Console").
const SRC = path.join(process.cwd(), "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

test("Search Console verification stays in the root metadata (Google re-checks it — never remove)", () => {
  assert.match(read("app/layout.tsx"), /google:\s*"clZiznT9gN2S0fepnRETppbt5XkUPxr1c0FQhFAGaHA"/);
  // the homepage must not override `verification` (Next merges metadata per top-level key)
  assert.doesNotMatch(read("app/page.tsx"), /verification\s*:/);
});

test("the Flashcards row links to the free-50 landing with a plain, crawlable <a href>", () => {
  const showcase = read("components/landing/system-showcase.tsx");
  assert.match(showcase, /cta: \{ href: "\/flashcards-revalida", label: "Teste 50 flashcards grátis →" \}/);
  assert.match(showcase, /<a\s+href=\{f\.cta\.href\}/);
});

// Karina 2026-10-13: the Search Console property is https://www.medhelpspace.com.br/ and the
// apex 308s to www, so sitemap, robots and every canonical must name www — never a redirect.
test("sitemap + robots + metadataBase use the www host; free-50 landing listed, open deck not", async () => {
  const { default: sitemap } = await import("@/app/sitemap");
  const { default: robots } = await import("@/app/robots");
  const urls = sitemap().map((e) => e.url);
  for (const u of urls) assert.match(u, /^https:\/\/www\.medhelpspace\.com\.br(\/|$)/, u);
  assert.ok(urls.includes("https://www.medhelpspace.com.br/flashcards-revalida"));
  assert.ok(!urls.some((u) => u.includes("/flashcards-gratis")), "open deck is noindex — keep it out");
  const r = robots();
  assert.equal(r.sitemap, "https://www.medhelpspace.com.br/sitemap.xml");
  assert.equal(r.host, "https://www.medhelpspace.com.br");
  assert.match(read("app/layout.tsx"), /metadataBase: new URL\("https:\/\/www\.medhelpspace\.com\.br"\)/);
});

test("/flashcards-gratis keeps working for the e-mail links but is noindex", () => {
  const page = read("app/flashcards-gratis/page.tsx");
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.doesNotMatch(page, /canonical:/);
  assert.match(read("lib/magnet/links.ts"), /FREE_DECK_PATH = "\/flashcards-gratis"/);
});
