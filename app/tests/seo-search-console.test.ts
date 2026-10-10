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
