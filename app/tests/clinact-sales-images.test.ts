import { test } from "node:test";
import assert from "node:assert/strict";
import { isSalesImageKey, isSalesImageUrl } from "@/lib/clinact/sales-images";

const BASE = "https://medhelpspace.b-cdn.net/clinact/site";

test("only an image we uploaded, on our CDN folder, is rendered", () => {
  assert.equal(isSalesImageUrl(`${BASE}/casos-image-1790345955735.png`), true);
  assert.equal(isSalesImageUrl(`${BASE}/evolucao-image-1790345955735.webp`), true);
  assert.equal(isSalesImageUrl(`${BASE}/evolucao-image-1.jpg`), true);
});

test("anything a hand-edited site_content row could hold is refused", () => {
  for (const bad of [
    "",
    null,
    undefined,
    "javascript:alert(1)",
    "https://evil.example/clinact/site/x.png",
    "https://medhelpspace.b-cdn.net/clinact/media/x.png", // case media, not a site slot
    `${BASE}/../media/x.png`,
    `${BASE}/x.svg`, // SVG can carry script
    `${BASE}/x.png?onerror=1`,
    `${BASE}/sub/x.png`,
  ]) {
    assert.equal(isSalesImageUrl(bad), false, String(bad));
  }
});

test("only the declared slots can be written", () => {
  assert.equal(isSalesImageKey("clinact.casos.image"), true);
  assert.equal(isSalesImageKey("clinact.evolucao.image"), true);
  // An upload must never be able to overwrite a copy row.
  assert.equal(isSalesImageKey("clinact.hero.title"), false);
  assert.equal(isSalesImageKey("clinact.planos.renovacao"), false);
});
