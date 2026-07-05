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
// Gift-first flashcards magnet (A/B variant vs. /questoes-revalida). Email gate up
// front; the 50-card deck is delivered by a magic link to /flashcards-revalida/acesso.
export const FLASHCARDS_REVALIDA_PATH = "/flashcards-revalida";
export const REVALIDA_2026_2_SLUG = "revalida-2026-2";
export const REVALIDA_2027_1_SLUG = "revalida-2027-1";
// NOTE: the 2027.2 turma slug has NO hyphen before the final 2 ('revalida-20272') —
// that's how the cohort row was created in the admin panel. A placeholder hint
// elsewhere says 'revalida-2027-2'; that is wrong. Verified against prod.
export const REVALIDA_20272_SLUG = "revalida-20272";

// leads.source value for the gift-first flashcards funnel — the discriminator that
// separates it from the quiz funnel ('simulado-honesto') in the drip/recovery crons
// and /admin/leads. Set on capture (captureFlashcardsLead).
export const FLASHCARDS_SOURCE = "flashcards-50";

// "Ainda não decidi" — the lead hasn't chosen a turma. NOT a real cohort: its
// welcome coupon is the all-turma FLASH5 and its checkout points at /loja (pick a
// turma there). Allowed by leads_target_cohort_check (schema-patch-flashcards-undecided.sql).
export const UNDECIDED_COHORT = "undecided";

// The turmas a lead may declare as their target exam (+ the 'undecided' sentinel).
// Single source of truth for both magnet funnels' server-side validation; mirrors
// the leads_target_cohort_check DB constraint.
export const VALID_TARGET_COHORTS: ReadonlySet<string> = new Set([
  REVALIDA_2026_2_SLUG,
  REVALIDA_2027_1_SLUG,
  REVALIDA_20272_SLUG,
  UNDECIDED_COHORT,
]);

// Per-turma WELCOME coupon: a small discount auto-applied at the end of the free
// test and delivered in ONE follow-up drip email (D2). This REPLACED the old large
// RETA2026/ULTIMA2026 stack for 2026-2 (deactivated 2026-07-02) — that turma is
// already marked down on the storefront, so the promo only adds a light 5% nudge.
// Each code is locked to its turma(s) in the DB (coupons.applies_to_cohort_slugs):
// REVALIDA5 (5%) only redeems on 2026-2; REVALIDA10 (10%) redeems on the two future
// turmas (2027.1 + 2027.2, which carry no storefront markdown yet). Keep in sync with
// schema-patch-revalida5-welcome-coupon.sql + schema-patch-target-cohort-add-20272.sql.
export const WELCOME_COUPONS: Record<string, { code: string; percent: number }> = {
  [REVALIDA_2026_2_SLUG]: { code: "REVALIDA5", percent: 5 },
  [REVALIDA_2027_1_SLUG]: { code: "REVALIDA10", percent: 10 },
  [REVALIDA_20272_SLUG]: { code: "REVALIDA10", percent: 10 },
  // Undecided leads: the all-turma FLASH5 (5%), applied at checkout after they pick.
  [UNDECIDED_COHORT]: { code: "FLASH5", percent: 5 },
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
  [REVALIDA_20272_SLUG]: { code: "VOLTA10", percent: 10 },
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

// Magic link that unlocks the 50-card flashcards deck. Sent to the lead's inbox as
// the D0 delivery of the gift-first funnel; clicking it stamps verified_at (the click
// IS the confirmation) and renders the study session. Token = leads.result_token.
export function flashcardsAccessUrl(token: string): string {
  return `${SITE_URL}${FLASHCARDS_REVALIDA_PATH}/acesso?t=${encodeURIComponent(token)}`;
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
  // Undecided leads have no turma yet → send them to the store to choose. The
  // all-turma coupon (FLASH5) can't prefill on the static /loja, so it's surfaced in
  // the reward/email copy and applied manually at checkout.
  if ((opts.cohort ?? "") === UNDECIDED_COHORT) {
    const p = new URLSearchParams({
      utm_source: "email",
      utm_medium: "drip",
      utm_campaign: opts.utmCampaign ?? "lead-drip",
    });
    return `${SITE_URL}/loja?${p.toString()}`;
  }
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
