import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Karina 2026-10-12 ("URLs curtas para rastreamento das redes sociais"): the social
// profiles link to /instagram, /tiktok and /youtube, which land on the homepage with
// that network's UTMs. Temporary on purpose, so the UTMs can change later.
// (Read as text: next.config.ts uses __dirname, so it cannot be imported as ESM here.)
const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

test("social short links: exact paths, sources and mediums", () => {
  assert.match(config, /\{ path: "\/instagram", source: "instagram", medium: "organic_social" \}/);
  assert.match(config, /\{ path: "\/tiktok", source: "tiktok", medium: "organic_social" \}/);
  assert.match(config, /\{ path: "\/youtube", source: "youtube", medium: "organic_video" \}/);
});

test("social short links land on the homepage with campaign perfil_revalida, TEMPORARY (307)", () => {
  assert.match(
    config,
    /destination: `\/\?utm_source=\$\{source\}&utm_medium=\$\{medium\}&utm_campaign=perfil_revalida`,\s*permanent: false,/,
  );
});
