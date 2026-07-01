// Shared URL builders for the magnet funnel (plain module — safe to import from
// server actions, the drip cron, and email rendering).

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://medhelpspace.com.br"
).replace(/\/$/, "");

export const MAGNET_PATH = "/simulado-honesto";
export const RESULTADO_PATH = "/simulado-honesto/resultado";
export const FREE_DECK_PATH = "/flashcards-gratis";
export const REVALIDA_2026_2_SLUG = "revalida-2026-2";
export const REVALIDA_2027_1_SLUG = "revalida-2027-1";

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

// Offer/checkout link carrying the cohort, the lead's email (prefill → powers the
// §6.5 Guarantee-A match), UTM tags, and OPTIONALLY a coupon. 2027.1 links pass no
// coupon (full price); 2026.2 links carry RETA2026 / ULTIMA2026.
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
