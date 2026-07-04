// Shared URL builders for the magnet funnel (plain module — safe to import from
// server actions, the drip cron, and email rendering).

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://medhelpspace.com.br"
).replace(/\/$/, "");

// Renamed from /simulado-honesto (2026-07-01) — the free magnet is now framed as
// real past-exam questions, not a mock "simulado". A permanent redirect in
// next.config.ts keeps live ad clicks, already-sent drip-email links, and indexed
// SEO URLs working.
export const MAGNET_PATH = "/questoes-revalida";
export const RESULTADO_PATH = "/questoes-revalida/resultado";
export const FREE_DECK_PATH = "/flashcards-gratis";
export const REVALIDA_2026_2_SLUG = "revalida-2026-2";
export const REVALIDA_2027_1_SLUG = "revalida-2027-1";

// Per-turma WELCOME coupon: a small discount auto-applied at the end of the free
// test and delivered in ONE follow-up drip email (D2). This REPLACED the old large
// RETA2026/ULTIMA2026 stack for 2026-2 (deactivated 2026-07-02) — that turma is
// already marked down on the storefront, so the promo only adds a light 5% nudge.
// Each code is locked to its own turma in the DB (coupons.applies_to_cohort_slugs),
// so 5% never redeems on 2027.1 and 10% never redeems on 2026.2. Keep this in sync
// with schema-patch-revalida5-welcome-coupon.sql.
export const WELCOME_COUPONS: Record<string, { code: string; percent: number }> = {
  [REVALIDA_2026_2_SLUG]: { code: "REVALIDA5", percent: 5 },
  [REVALIDA_2027_1_SLUG]: { code: "REVALIDA10", percent: 10 },
};

// Dedicated recovery coupons shown in the Segment-B "come back and finish" nudges —
// one per turma, mirroring WELCOME_COUPONS. Kept separate from WELCOME for clean
// attribution (recovery vs. welcome). Turma-scoped rates: revalida-2026-2 is ALREADY
// discounted on the storefront so it caps at 5%; revalida-2027-1 gets 10%. Single
// source of truth for the cron (code + percent + checkout link) and the email copy
// ({{coupon}} / {{couponPercent}}). Seeded by schema-patch-lead-recovery.sql — keep in sync.
export const RECOVERY_COUPONS: Record<string, { code: string; percent: number }> = {
  [REVALIDA_2026_2_SLUG]: { code: "VOLTA5", percent: 5 },
  [REVALIDA_2027_1_SLUG]: { code: "VOLTA10", percent: 10 },
};

export function magnetUrl(): string {
  return `${SITE_URL}${MAGNET_PATH}`;
}

// Durable "meu material" page. EVERY email link to the plan/result points here —
// NOT the bare magnet URL, which cold-restarts at Q1 with only the 5 free
// questions. The token is leads.result_token (unguessable UUID); the page
// reconstructs score + plan + flashcards + offer from the stored lead row, so it
// survives cross-device opens. FREE-FUNNEL-V2-SCOPE.md Group 3.
export function resultUrl(token: string): string {
  return `${SITE_URL}${RESULTADO_PATH}?lead=${encodeURIComponent(token)}`;
}

// The free flashcard deck delivered as the magnet bonus (what {{deckUrl}} resolves
// to in the D0 email) and an SEO landing for the "flashcards revalida" long-tail.
export function freeDeckUrl(): string {
  return `${SITE_URL}${FREE_DECK_PATH}`;
}

export function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/api/leads/unsubscribe?t=${encodeURIComponent(token)}`;
}

// Segment-A recovery magic link (finished the test, never verified). Clicking it
// stamps verified_at server-side — the click IS the confirmation — then redirects to
// the durable reward page. The token is leads.result_token (unguessable UUID).
export function recoverUrl(token: string): string {
  return `${SITE_URL}${MAGNET_PATH}/recuperar?t=${encodeURIComponent(token)}`;
}

// Segment-B resume link (abandoned mid-quiz). Reopens the funnel with the lead's
// stored answers rehydrated, jumping to the next unanswered question so they finish
// where they stopped instead of restarting at Q1.
export function resumeUrl(token: string): string {
  return `${SITE_URL}${MAGNET_PATH}?retomar=${encodeURIComponent(token)}`;
}

// Offer/checkout link carrying the cohort, the lead's email (prefill → powers the
// §6.5 Guarantee-A match), UTM tags, and OPTIONALLY a coupon. The drip passes the
// turma's WELCOME_COUPONS code only on the D2 step; all other steps pass no coupon
// (checkout then lands on the turma's live storefront price).
export function offerCheckoutUrl(opts: {
  email: string;
  coupon?: string | null;
  cohort?: string;
  utmCampaign?: string;
}): string {
  const params = new URLSearchParams({
    cohort: opts.cohort ?? REVALIDA_2026_2_SLUG,
    email: opts.email,
    utm_source: "email",
    utm_medium: "drip",
    utm_campaign: opts.utmCampaign ?? "lead-drip",
  });
  if (opts.coupon) params.set("cupom", opts.coupon);
  return `${SITE_URL}/checkout?${params.toString()}`;
}
