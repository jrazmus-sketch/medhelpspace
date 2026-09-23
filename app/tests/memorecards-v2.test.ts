/**
 * MemoreCards v2 (Karina, 2026-09-23) — the rules her e-mail turns on, tested on the
 * real module the viewer imports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  availableThemes,
  isThemeFinished,
  nextPosition,
  prevPosition,
  sortThemes,
  startPosition,
  themeSlug,
  themeTitle,
  type MemorecardTheme,
} from "@/lib/memorecards-shared";

const SRC = join(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const card = (n: number) => ({ url: `https://cdn/x/${n}.webp`, width: 1122, height: 1402 });
const theme = (pageId: number, slug: string, cards: number): MemorecardTheme => ({
  pageId,
  slug,
  title: slug,
  cards: Array.from({ length: cards }, (_, i) => card(i + 1)),
});

// Abdome Agudo Hemorrágico (5 cards) → Obstrutivo (6) → Perfurativo (0, not produced
// yet) → Vascular (3): her own example, plus an empty theme in the middle.
const THEMES = [
  theme(1, "abdome-agudo-hemorragico", 5),
  theme(2, "abdome-agudo-obstrutivo", 6),
  theme(3, "abdome-agudo-perfurativo", 0),
  theme(4, "abdome-agudo-vascular", 3),
];
const SEQ = availableThemes(THEMES);

test("a theme with no cards stays out of the study sequence", () => {
  assert.deepEqual(SEQ.map((t) => t.slug), [
    "abdome-agudo-hemorragico",
    "abdome-agudo-obstrutivo",
    "abdome-agudo-vascular",
  ]);
});

test("the last card of a theme leads into the FIRST card of the next theme", () => {
  // "Abdome Agudo Hemorrágico — Card 5/5 → avançar → Abdome Agudo Obstrutivo — Card 1/6"
  assert.deepEqual(nextPosition(SEQ, { theme: 0, card: 4 }), { theme: 1, card: 0 });
});

test("an empty theme is skipped over, not stopped at", () => {
  assert.deepEqual(nextPosition(SEQ, { theme: 1, card: 5 }), { theme: 2, card: 0 });
  assert.equal(SEQ[2].slug, "abdome-agudo-vascular");
});

test("inside a theme, next and previous move one card", () => {
  assert.deepEqual(nextPosition(SEQ, { theme: 1, card: 2 }), { theme: 1, card: 3 });
  assert.deepEqual(prevPosition(SEQ, { theme: 1, card: 2 }), { theme: 1, card: 1 });
});

test("going back from a theme's first card lands on the previous theme's LAST card", () => {
  assert.deepEqual(prevPosition(SEQ, { theme: 1, card: 0 }), { theme: 0, card: 4 });
});

test("the very first card has nothing before it", () => {
  assert.equal(prevPosition(SEQ, { theme: 0, card: 0 }), null);
});

test("the end of the specialty is 'end' — never a jump into another specialty", () => {
  assert.equal(nextPosition(SEQ, { theme: 2, card: 2 }), "end");
});

test("a ?tema= link opens that theme; an unknown or empty theme opens the start", () => {
  assert.deepEqual(startPosition(SEQ, "abdome-agudo-vascular"), { theme: 2, card: 0 });
  assert.deepEqual(startPosition(SEQ, "abdome-agudo-perfurativo"), { theme: 0, card: 0 });
  assert.deepEqual(startPosition(SEQ, null), { theme: 0, card: 0 });
});

test("a theme counts as studied on its last card (the Revisão re-read trigger)", () => {
  assert.equal(isThemeFinished(SEQ, { theme: 0, card: 4 }), true);
  assert.equal(isThemeFinished(SEQ, { theme: 0, card: 3 }), false);
});

test("theme names and links come from the Revalida Up page", () => {
  assert.equal(themeTitle("Cirrose Revalida Up"), "Cirrose");
  assert.equal(themeTitle("Úlcera Péptica e Helicobacter pylori Revalida UP"), "Úlcera Péptica e Helicobacter pylori");
  assert.equal(themeSlug("cirrose-revalida-up"), "cirrose");
});

test("themes sort the way a Brazilian reader expects", () => {
  const sorted = sortThemes([{ title: "Hérnia" }, { title: "Apendicite" }, { title: "Câncer Colorretal" }, { title: "Colecistite" }]);
  assert.deepEqual(sorted.map((t) => t.title), ["Apendicite", "Câncer Colorretal", "Colecistite", "Hérnia"]);
});

// ── Guards on the wiring ─────────────────────────────────────────────────────

test("the viewer never advances on a timer", () => {
  // "não deve existir um temporizador trocando automaticamente um MemoreCard por outro"
  const viewer = read("components/content/memorecards-viewer.tsx");
  assert.doesNotMatch(viewer, /setInterval|setTimeout/);
});

test("the image is contained, never cropped", () => {
  const viewer = read("components/content/memorecards-viewer.tsx");
  assert.match(viewer, /object-contain/);
  assert.doesNotMatch(viewer, /object-cover/);
});

test("the specialty page checks the 60D unlock before reading any card", () => {
  const page = read("app/app/memorecards/[specialty]/page.tsx");
  const gate = page.indexOf("get60dAccess()");
  const load = page.indexOf("getSpecialtyMemorecards(");
  assert.ok(gate > 0 && load > gate, "the 60D check must run before the cards are loaded");
});

test("the 60D accordion links to the new section", () => {
  assert.match(read("components/content/medhelp-60d-accordion.tsx"), /href: "\/app\/memorecards"/);
});

// ── Legacy pages ─────────────────────────────────────────────────────────────

test("every legacy MemoreCards page points at v2, whatever its page type", async () => {
  const { legacyMemorecardsHref } = await import("@/lib/memorecards-shared");
  assert.equal(legacyMemorecardsHref("memorecards", 1), "/app/memorecards");
  assert.equal(legacyMemorecardsHref("gastroenterologia-memorecards", 1), "/app/memorecards/gastroenterologia");
  assert.equal(legacyMemorecardsHref("emergencia-memorecards", 1), "/app/memorecards/emergencia");
});

test("nothing else in 60D is redirected — Fórmula and Simulados 100Q stay put", async () => {
  const { legacyMemorecardsHref } = await import("@/lib/memorecards-shared");
  assert.equal(legacyMemorecardsHref("cirrose-formula", 1), null);
  assert.equal(legacyMemorecardsHref("simulado-100q-3", 1), null);
  assert.equal(legacyMemorecardsHref("medhelp-60d", 1), null);
  assert.equal(legacyMemorecardsHref("memorecards", null), null, "outside 60D a slug is not a legacy deck");
});

test("the content route redirects legacy decks before choosing a renderer", () => {
  const route = read("app/app/[specialty]/[slug]/page.tsx");
  assert.ok(route.indexOf("legacyMemorecardsHref(") < route.indexOf("function PageBody"),
    "the redirect must not depend on the page type (16 of the 18 old decks are plain-content)");
});

test("Simulados 100Q no longer get the MemoreCards tip", () => {
  const route = read("app/app/[specialty]/[slug]/page.tsx");
  assert.doesNotMatch(route, /return "memorecards"/);
});

test("the MemoreCards tip is on the index, never over the viewer", () => {
  assert.match(read("app/app/memorecards/page.tsx"), /coachKey="memorecards"/);
  assert.doesNotMatch(read("app/app/memorecards/[specialty]/page.tsx"), /Coachmark/);
});

// ── Full screen + zoom (Justin, 2026-09-23) ─────────────────────────────────

test("full screen fits a 4:5 card to the screen's height on a laptop, width on a phone", async () => {
  const { fitCard } = await import("@/lib/memorecards-zoom");
  const laptop = fitCard({ w: 1280, h: 700 }, 4 / 5);
  assert.equal(Math.round(laptop.h), 700);
  assert.equal(Math.round(laptop.w), 560);
  const phone = fitCard({ w: 375, h: 650 }, 4 / 5);
  assert.equal(Math.round(phone.w), 375);
});

test("zoom stays between 1× and 4×", async () => {
  const { zoomAt, IDENTITY } = await import("@/lib/memorecards-zoom");
  const card = { w: 375, h: 469 }, stage = { w: 375, h: 650 };
  assert.equal(zoomAt(IDENTITY, 10, { x: 0, y: 0 }, card, stage).s, 4);
  assert.equal(zoomAt(IDENTITY, 0.2, { x: 0, y: 0 }, card, stage).s, 1);
});

test("zooming keeps the point under the finger in place", async () => {
  const { zoomAt, IDENTITY } = await import("@/lib/memorecards-zoom");
  const card = { w: 400, h: 500 }, stage = { w: 400, h: 500 };
  const at = { x: 100, y: -120 };
  const z = zoomAt(IDENTITY, 2, at, card, stage);
  // content point under `at` before: (at - t)/s = at; after: t + at*s must equal at
  assert.equal(z.x + at.x * z.s, at.x);
  assert.equal(z.y + at.y * z.s, at.y);
});

test("an enlarged card can never be dragged off the screen", async () => {
  const { clampZoom } = await import("@/lib/memorecards-zoom");
  const card = { w: 400, h: 500 }, stage = { w: 400, h: 500 };
  const z = clampZoom({ s: 2, x: 9999, y: -9999 }, card, stage);
  assert.equal(z.x, 200); // (400·2 − 400) / 2
  assert.equal(z.y, -250);
  assert.deepEqual(clampZoom({ s: 1, x: 50, y: 50 }, card, stage), { s: 1, x: 0, y: 0 });
});

test("a pinch zooms around the fingers and follows them", async () => {
  const { pinch, IDENTITY } = await import("@/lib/memorecards-zoom");
  const card = { w: 400, h: 500 }, stage = { w: 400, h: 500 };
  const z = pinch(IDENTITY, { x: 0, y: 0 }, 100, { x: 0, y: 0 }, 200, card, stage);
  assert.equal(z.s, 2);
  assert.deepEqual([z.x, z.y], [0, 0]);
});

test("double-tap zooms in, and a second double-tap returns to the whole card", async () => {
  const { toggleZoom, IDENTITY, TAP_SCALE } = await import("@/lib/memorecards-zoom");
  const card = { w: 400, h: 500 }, stage = { w: 400, h: 500 };
  const inZ = toggleZoom(IDENTITY, { x: 50, y: 50 }, card, stage);
  assert.equal(inZ.s, TAP_SCALE);
  assert.deepEqual(toggleZoom(inZ, { x: 0, y: 0 }, card, stage), IDENTITY);
});

test("a swipe changes card only while the card is NOT enlarged", async () => {
  const { isSwipe, IDENTITY } = await import("@/lib/memorecards-zoom");
  assert.equal(isSwipe(IDENTITY, -80, 5), 1);
  assert.equal(isSwipe(IDENTITY, 80, 5), -1);
  assert.equal(isSwipe(IDENTITY, 30, 0), 0, "too short");
  assert.equal(isSwipe(IDENTITY, 60, 80), 0, "mostly vertical");
  assert.equal(isSwipe({ s: 2, x: 0, y: 0 }, -200, 0), 0, "zoomed in: that drag was a pan");
});

test("full screen stops the page from pinch-zooming and closes on Esc", () => {
  const fs = read("components/content/memorecards-fullscreen.tsx");
  assert.match(fs, /touchAction: "none"/);
  assert.match(fs, /"Escape"/);
  assert.match(fs, /requestFullscreen/);
  assert.doesNotMatch(fs, /setInterval|setTimeout/, "still no timer");
});
