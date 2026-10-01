import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LANDING_SECTIONS, SCROLL_MILESTONES, sectionViewEventName } from "@/lib/analytics/landing-sections";

// GA4 sales-page funnel (Karina 2026-09-30). Every event she asked for has a
// single, stable name, and every place it must fire is wired.

const SRC = path.join(process.cwd(), "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8").split("\r\n").join("\n");

test("the section list covers Questões, MedVoice, 60D and pricing, with stable event names", () => {
  const sections = LANDING_SECTIONS.map((s) => s.section);
  for (const s of ["questions", "medvoice", "medhelp60d", "pricing"]) assert.ok(sections.includes(s), s);
  assert.equal(sectionViewEventName("questions"), "view_questions_section");
  assert.equal(sectionViewEventName("medvoice"), "view_medvoice_section");
  assert.equal(sectionViewEventName("medhelp60d"), "view_medhelp60d_section");
  assert.equal(sectionViewEventName("pricing"), "view_pricing_section");
  assert.deepEqual([...SCROLL_MILESTONES], [25, 50, 75, 90]);
  // every id in the list is a real DOM id somewhere on the homepage tree
  const showcase = read("components/landing/system-showcase.tsx");
  assert.match(showcase, /id=\{`feature-\$\{f\.id\}`\}/, "showcase rows must carry feature-<id>");
  const featureIds = [...showcase.matchAll(/^\s+id: "([a-z-]+)",/gm)].map((m) => m[1]);
  for (const s of LANDING_SECTIONS) {
    if (s.id.startsWith("feature-")) assert.ok(featureIds.includes(s.id.slice("feature-".length)), s.id);
  }
  assert.match(read("components/landing/sixty-d-section.tsx"), /id="medhelp60d"/);
  assert.match(read("components/landing/pricing-cta.tsx"), /id="precos"/);
  assert.match(read("components/landing/faq-section.tsx"), /id="faq"/);
});

test("the homepage mounts the tracker and every CTA fires its click event", () => {
  assert.match(read("app/page.tsx"), /<LandingEvents \/>/);
  assert.match(read("components/landing/hero-section.tsx"), /trackBuyClick\("hero"\)/);
  assert.match(read("components/landing/hero-section.tsx"), /trackFreeSimulatorClick\("hero"\)/);
  assert.match(read("components/landing/landing-nav.tsx"), /trackBuyClick\("nav"\)/);
  assert.match(read("components/landing/sticky-cta-bar.tsx"), /trackBuyClick\("sticky_bar"\)/);
  const pricing = read("components/landing/pricing-cta.tsx");
  assert.match(pricing, /trackTurmaSelect\(c\.slug\)/);
  assert.match(pricing, /trackBuyClick\("pricing", cohort\.slug\)/);
  assert.match(pricing, /trackFreeSimulatorClick\("pricing_downsell"\)/);
  const loja = read("app/loja/page.tsx");
  assert.match(loja, /event="click_buy_now"/);
  assert.match(loja, /params=\{\{ location: "loja", turma: cohort\.slug \}\}/);
});

test("checkout, leads and WhatsApp use Karina's event names", () => {
  const checkout = read("app/checkout/checkout-client.tsx");
  assert.match(checkout, /trackBeginCheckout\(\{ turma: cohortSlug/);
  assert.match(checkout, /trackPurchase\(/);
  assert.match(read("components/magnet/flashcards-gate.tsx"), /trackLeadSubmit\("flashcards"\)/);
  assert.match(read("components/magnet/magnet-quiz.tsx"), /trackLeadSubmit\("simulado15"\)/);
  assert.match(read("components/magnet/simulado-gate.tsx"), /trackLeadSubmit\("simulado100"\)/);
  assert.match(read("components/magnet/exit-intent-capture.tsx"), /trackLeadSubmit\("exit_intent"\)/);
  assert.match(read("components/marketing/whatsapp-button.tsx"), /trackEvent\("click_whatsapp"/);
  const track = read("lib/analytics/track.ts");
  for (const name of ["click_buy_now", "click_free_simulator", "lead_submit", "begin_checkout", "purchase"]) {
    assert.ok(track.includes(`"${name}"`), `track.ts must emit ${name}`);
  }
  assert.match(track, /`select_\$\{slug\.replace\(\/-\/g, "_"\)\}`/, "select_revalida_2027_1 shape");
});

test("the hero sales video: section id, click + watch milestones, YouTube only after the click", () => {
  const video = read("components/landing/hero-video.tsx");
  assert.ok(LANDING_SECTIONS.some((s) => s.id === "video-vendas" && s.section === "video"), "view_video_section");
  assert.match(video, /id="video-vendas"/);
  assert.match(video, /trackVideoPlay\("hero"\)/);
  assert.match(video, /trackVideoProgress\(m, "hero"\)/);
  assert.match(video, /trackVideoProgress\(100, "hero"\)/);
  assert.match(read("components/landing/hero-section.tsx"), /<HeroVideo \/>/);
  const track = read("lib/analytics/track.ts");
  assert.ok(track.includes('"click_play_video"'), "click_play_video");
  assert.match(track, /`watch_video_\$\{percent\}`/, "watch_video_25 … watch_video_100");
  // privacy-enhanced host, and nothing YouTube in the markup until mode leaves "poster"
  assert.match(video, /host: "https:\/\/www\.youtube-nocookie\.com"/);
  assert.match(video, /mode === "poster" \? \(/);
});
