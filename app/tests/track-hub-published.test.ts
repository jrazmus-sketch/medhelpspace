/**
 * Karina 2026-11-16: /app/flashcards lost its accordion layout. The track hub listed
 * DRAFT pages too, so the retired Trauma Raquimedular deck (a draft tagged Cirurgia
 * Geral) gave that specialty a second page and flipped the hub into the fallback list.
 * The hub must only ever list published pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("track hub lists only published pages", () => {
  const src = readFileSync(path.join(process.cwd(), "src/components/content/track-hub-renderer.tsx"), "utf8");
  const q = src.slice(src.indexOf('.from("pages")'), src.indexOf('.order("title")'));
  assert.match(q, /\.eq\("status", "publish"\)/);
});
