import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isYouTubeId, parseYouTubeId, SALES_VIDEO_KEY } from "@/lib/clinact/sales-video";
import { isSalesImageKey } from "@/lib/clinact/sales-images";
import { orderSections, type PageLayout } from "@/lib/site-sections-order";
import { CLINACT_COPY } from "@/lib/clinact/site-copy";

// Karina 2026-10-30 — "Vídeo de apresentação e ajustes na página de vendas do
// ClinAct": a block "Conheça o ClinAct por dentro" with the video between the
// opening and the four formats, and three titles in the lilac of "decisão.".

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8").replace(/\r\n/g, "\n");

test("every way an admin can paste a YouTube link gives the same id", () => {
  const id = "FhBSfjYIrqs";
  for (const input of [
    id,
    ` ${id} `,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=12s`,
    `youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
  ]) {
    assert.equal(parseYouTubeId(input), id, input);
  }
});

test("anything that is not a YouTube video is refused, so the page never embeds it", () => {
  for (const bad of [
    "",
    "hello",
    "https://vimeo.com/123456789",
    "https://evil.example/watch?v=FhBSfjYIrqs",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx",
    "javascript:alert(1)",
    "FhBSfjYIrqs\"><script>",
  ]) {
    assert.equal(parseYouTubeId(bad), null, bad);
  }
  assert.equal(isYouTubeId("FhBSfjYIrqs"), true);
  assert.equal(isYouTubeId("https://youtu.be/FhBSfjYIrqs"), false, "only the bare id is stored and rendered");
});

test("the block renders nothing until a video is set, and is placed after the opening", () => {
  const video = read("components/clinact/sales/sales-video.tsx");
  assert.match(video, /if \(!isYouTubeId\(id\)\) return null;/);
  assert.match(video, /content\[SALES_VIDEO_KEY\]/);
  const sections = read("components/clinact/sales/sections.tsx");
  const list = sections.slice(sections.indexOf("export const CLINACT_SECTIONS"));
  assert.ok(list.indexOf('key: "hero"') < list.indexOf('key: "video"'));
  assert.ok(list.indexOf('key: "video"') < list.indexOf('key: "competencias"'));
  assert.equal(CLINACT_COPY["clinact.video.title"], "Conheça o ClinAct por dentro");
});

test("a new section with no stored row lands after the section declared before it", () => {
  // Production stores hero..planos at 1..6 with no gap: the new section used to
  // TIE with competencias at 2 and only win by sort stability.
  const sections = ["hero", "video", "competencias", "casos"].map((key) => ({ key }));
  const stored: PageLayout = { published: true, visible: {}, position: { hero: 1, competencias: 2, casos: 3 } };
  assert.deepEqual(orderSections(sections, stored).map((s) => s.key), ["hero", "video", "competencias", "casos"]);
  // It follows its predecessor wherever the admin moved it.
  const moved: PageLayout = { published: true, visible: {}, position: { hero: 3, competencias: 1, casos: 2 } };
  assert.deepEqual(orderSections(sections, moved).map((s) => s.key), ["competencias", "casos", "hero", "video"]);
  // Hiding its predecessor does not move it.
  const hidden: PageLayout = { ...stored, visible: { hero: false } };
  assert.deepEqual(orderSections(sections, hidden).map((s) => s.key), ["video", "competencias", "casos"]);
});

test("the cover is an image slot, and the video id is not one (an upload can never overwrite it)", () => {
  assert.equal(isSalesImageKey("clinact.video.image"), true);
  assert.equal(isSalesImageKey(SALES_VIDEO_KEY), false);
  assert.ok(!(SALES_VIDEO_KEY in CLINACT_COPY), "the video id is data, not editable page copy");
});

test("the three titles are the lilac of \"decisão.\" — the same token, the whole phrase", () => {
  const src = read("components/clinact/sales/sections.tsx");
  assert.match(src, /<span className="text-brand-text">\s*<ClinactText k="clinact\.hero\.title_accent"/);
  assert.match(src, /const H2_ACCENT = H2\.replace\("text-foreground", "text-brand-text"\);/);
  // Each title's <h2> opening tag, up to its ClinactText.
  const titleTag = (k: string) => {
    const at = src.indexOf(`<ClinactText k="clinact.${k}.title"`);
    assert.ok(at > 0, k);
    return src.slice(src.lastIndexOf("<h2", at), at);
  };
  for (const k of ["casos", "evolucao", "planos"]) assert.match(titleTag(k), /H2_ACCENT/, k);
  // The others stay white.
  for (const k of ["competencias", "gratuitos", "video"]) assert.doesNotMatch(titleTag(k), /H2_ACCENT/, k);
});

test("saving the video only stores a parsed id, for content admins, and is audited", () => {
  const src = read("actions/clinact-page.ts");
  const fn = src.slice(src.indexOf("export async function setSalesVideo"));
  assert.match(fn, /CONTENT_ROLES\.includes\(who\.role\)/);
  assert.match(fn, /parseYouTubeId\(input\)/);
  assert.match(fn, /value: id/);
  assert.match(fn, /"clinact_page_video"/);
});
