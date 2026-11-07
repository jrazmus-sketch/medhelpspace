import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CLINACT_LANDING_SECTIONS,
  LANDING_SECTIONS,
  SCROLL_MILESTONES,
  sectionViewEventName,
} from "@/lib/analytics/landing-sections";
import { VIDEO_MILESTONES, clinactPlanParam, clinactPlanSelectEventName, turmaSelectEventName } from "@/lib/analytics/track";
import { isTrackedPath } from "@/lib/analytics/config";

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
  // "Por trás da MedHelpSpace" (Karina 2026-10-09): tracked as view_founder_section.
  assert.match(read("components/landing/founder-section.tsx"), /FOUNDER_SECTION_ID = "por-tras"/);
  assert.match(read("components/landing/founder-section.tsx"), /id=\{FOUNDER_SECTION_ID\}/);
  assert.ok(LANDING_SECTIONS.some((s) => s.id === "por-tras" && s.section === "founder"));
  // A block taller than ~2.9 screens can never be 35% visible (pricing on a 375×667
  // phone is ~1970px), so "fills half the screen" must also count as reached.
  const events = read("components/analytics/landing-events.tsx");
  assert.match(events, /e\.intersectionRect\.height < screen \* 0\.5/);
});

test("the Revalida sales page mounts the tracker and every CTA fires its click event", () => {
  assert.match(read("app/revalida/page.tsx"), /<LandingEvents \/>/);
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
  // Karina 2026-10-01: both turmas read the same way in GA4, whatever the slug looks like.
  assert.equal(turmaSelectEventName("revalida-2027-1"), "select_revalida_2027_1");
  assert.equal(turmaSelectEventName("revalida-20272"), "select_revalida_2027_2");
  assert.equal(turmaSelectEventName("revalida-2026-2"), "select_revalida_2026_2");
});

test("the hero sales video: section id, click + watch milestones, YouTube only after the click", () => {
  const video = read("components/landing/hero-video.tsx");
  const section = LANDING_SECTIONS.find((s) => s.id === "video-vendas");
  assert.equal(section && sectionViewEventName(section.section), "view_sales_video_section");
  assert.match(video, /id="video-vendas"/);
  assert.match(video, /trackVideoPlay\("hero"\)/);
  assert.match(video, /trackVideoStart\("hero"\)/);
  assert.match(video, /for \(const m of VIDEO_MILESTONES\)/);
  assert.match(video, /trackVideoProgress\(m, "hero"\)/);
  assert.match(video, /trackVideoProgress\(100, "hero"\)/);
  assert.deepEqual([...VIDEO_MILESTONES], [25, 50, 75, 90]);
  assert.match(read("components/landing/hero-section.tsx"), /<HeroVideo \/>/);
  const track = read("lib/analytics/track.ts");
  // The Revalida family is the default: click_play_video / watch_video_start / watch_video_N.
  assert.match(track, /family: VideoFamily = "video"/);
  assert.match(track, /`click_play_\$\{family\}`/);
  assert.match(track, /`watch_\$\{family\}_start`/);
  assert.match(track, /`watch_\$\{family\}_\$\{percent\}`/);
  // privacy-enhanced host, and nothing YouTube in the markup until mode leaves "poster"
  assert.match(video, /host: "https:\/\/www\.youtube-nocookie\.com"/);
  assert.match(video, /mode === "poster" \? \(/);
});

// ── ClinAct sales page (Karina 2026-11-06) ────────────────────────────────────

test("ClinAct: her seven section events, on real ids, through the shared tracker", () => {
  assert.deepEqual(
    CLINACT_LANDING_SECTIONS.map((s) => sectionViewEventName(s.section)),
    [
      "view_clinact_video_section",
      "view_clinact_formats_section",
      "view_clinact_practice_section",
      "view_clinact_evolution_section",
      "view_clinact_founder_section",
      "view_clinact_free_cases_section",
      "view_clinact_pricing_section",
    ],
  );
  const sections = read("components/clinact/sales/sections.tsx");
  for (const key of ["formats", "practice", "evolution", "founder"]) {
    assert.match(sections, new RegExp(`id=\{CLINACT_SECTION_IDS\.${key}\}`), key);
  }
  assert.match(sections, /<SalesVideo id=\{CLINACT_SECTION_IDS\.video\}/);
  assert.match(sections, /ANCHOR_GRATUITOS = CLINACT_SECTION_IDS\.freeCases/);
  assert.match(sections, /ANCHOR_PLANOS = CLINACT_SECTION_IDS\.pricing/);
  assert.match(sections, /id=\{ANCHOR_GRATUITOS\}/);
  assert.match(sections, /id=\{ANCHOR_PLANOS\}/);
  assert.match(read("components/clinact/sales/sales-video.tsx"), /<section id=\{sectionId\}/);
  assert.match(read("app/clinact/page.tsx"), /<LandingEvents sections=\{CLINACT_LANDING_SECTIONS\} product="clinact" \/>/);
});

test("ClinAct: free-cases CTA by location, plan buttons, video family", () => {
  const sections = read("components/clinact/sales/sections.tsx");
  assert.match(sections, /FREE_CASES_EVENT = "click_clinact_free_cases"/);
  assert.match(sections, /freeCasesParams\("hero"\)/);
  assert.match(sections, /freeCasesParams\("free_cases_section"\)/);
  assert.equal(clinactPlanSelectEventName("mensal"), "select_clinact_monthly");
  assert.equal(clinactPlanSelectEventName("anual"), "select_clinact_annual");
  assert.equal(clinactPlanParam("anual"), "annual");
  assert.match(sections, /event=\{clinactPlanSelectEventName\(plan\.key\)\}/);
  const video = read("components/clinact/sales/sales-video.tsx");
  assert.match(video, /const FAMILY = "clinact_video"/);
  assert.match(video, /trackVideoPlay\(LOCATION, FAMILY\)/);
  assert.match(video, /trackVideoStart\(LOCATION, FAMILY\)/);
  assert.match(video, /trackVideoProgress\(m, LOCATION, FAMILY\)/);
  assert.match(video, /trackVideoProgress\(100, LOCATION, FAMILY\)/);
});

test("ClinAct: begin_checkout + purchase carry product=clinact; member area untracked", () => {
  const form = read("app/clinact/(membro)/assinar/subscribe-form.tsx");
  assert.match(form, /trackClinactBeginCheckout\(selected\.key/);
  assert.match(form, /trackClinactPurchase\(/);
  const track = read("lib/analytics/track.ts");
  assert.match(track, /product: "clinact"/);
  assert.match(track, /trackEventThen\(\s*"purchase"/);
  // Public journey tracked; subscriber area, Minha Evolução, account and preview not.
  for (const p of ["/clinact", "/clinact/assinar", "/clinact/gratis", "/clinact/caso/x", "/revalida", "/signup"]) {
    assert.ok(isTrackedPath(p), p);
  }
  for (const p of ["/clinact/treinar", "/clinact/treinar/casos", "/clinact/evolucao", "/clinact/assinatura", "/clinact/preview/t", "/app", "/admin/x"]) {
    assert.ok(!isTrackedPath(p), p);
  }
});
