import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// The authoring guide + templates are served from the importer screen out of
// src/content/clinact (bundled with the app). The canonical copies Karina
// receives live in docs/clinact. They must be byte-identical: the guide is
// versioned WITH the parser (§3.3), and a drift here would mean the panel
// hands her a different contract than the one in the repo.

const DOCS = path.resolve(import.meta.dirname, "..", "..", "docs", "clinact");
const BUNDLED = path.resolve(import.meta.dirname, "..", "src", "content", "clinact");

test("src/content/clinact mirrors docs/clinact exactly", () => {
  const files = readdirSync(DOCS).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const a = readFileSync(path.join(DOCS, f), "utf8");
    const b = readFileSync(path.join(BUNDLED, f), "utf8");
    assert.equal(b, a, `${f} drifted — copy docs/clinact/${f} to app/src/content/clinact/`);
  }
});
