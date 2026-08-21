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
// Free 100-question simulado (third funnel): 100 REAL past-Revalida (INEP) questions,
// 5 blocos of 20 by grande área. Email-first like the flashcards funnel — the test is
// multi-hour, so the magic link doubles as the resume link from question 1.
export const SIMULADO_PATH = "/simulado-revalida";
// Short, pasteable alias for the same landing page — for WhatsApp groups, Instagram
// bios, print, anywhere a human types or reads the URL. A rewrite in next.config.ts
// serves SIMULADO_PATH's page at this path, so it is an alias and NOT a second funnel:
// leads still land with source=SIMULADO_SOURCE. Keep SIMULADO_PATH for everything a
// machine follows (drip emails, magic links, ads, sitemap) — that is the canonical URL.
export const SIMULADO_SHORT_PATH = "/simulado";
// Same page again. Kept because link-preview caches are per-URL: when a card has to be
// re-scraped, only a path the crawler has never seen gets a clean read.
export const SIMULADO_SHORT_PATH_ALT = "/simulado-gratis";
export const REVALIDA_2026_2_SLUG = "revalida-2026-2";
export const REVALIDA_2027_1_SLUG = "revalida-2027-1";
// NOTE: the 2027.2 turma slug has NO hyphen before the final 2 ('revalida-20272') —
// that's how the cohort row was created in the admin panel. A placeholder hint
// elsewhere says 'revalida-2027-2'; that is wrong. Verified against prod.
export const REVALIDA_20272_SLUG = "revalida-20272";

// leads.source value for the gift-first flashcards funnel. FIRST-TOUCH attribution
// only — it records which magnet captured the address and is never overwritten.
// Set on capture (captureFlashcardsLead); read by /admin/leads.
export const FLASHCARDS_SOURCE = "flashcards-50";
// leads.source for the 100-question simulado funnel. Same first-touch semantics.
export const SIMULADO_SOURCE = "simulado-100";

// ── Which sequence owns leads.drip_step ───────────────────────────────────────
// `source` must NOT be used to route the drips. It is first-touch, so a lead the
// quiz funnel captured in July who later does the simulado still reads
// source='simulado-honesto' — the simulado cron never saw them and the quiz cron
// kept mailing them. That bug shipped twice (simulado 2026-07-26, flashcards the
// same day) before the routing moved onto its own column.
//
// leads.drip_funnel holds exactly one value. The most recently entered funnel wins,
// and the entry point resets drip_step + the per-funnel counters when it changes, so
// the new ladder starts at rung 0. Each cron filters `.eq("drip_funnel", …)`.
// Patch: schema-patch-leads-fc-entered-at.sql.
export const DRIP_FUNNEL = {
  quiz: "quiz",
  simulado: "simulado",
  flashcards: "flashcards",
} as const;
export type DripFunnel = (typeof DRIP_FUNNEL)[keyof typeof DRIP_FUNNEL];

// "Ainda não decidi" — the lead hasn't chosen a turma. NOT a real cohort: its
// welcome coupon is the all-turma FLASH5 and its checkout points at /loja (pick a
// turma there). Allowed by leads_target_cohort_check (schema-patch-flashcards-undecided.sql).
export const UNDECIDED_COHORT = "undecided";

// NOTE: the hardcoded VALID_TARGET_COHORTS allowlist that used to live here is
// GONE (2026-07-26). It mirrored a CHECK constraint that listed four slugs, which
// meant a turma created in the admin panel was rejected by every funnel until
// somebody remembered to edit both — and the rejection was silent, filing the
// lead under the fallback turma instead. Validation now reads the live `cohorts`
// table: isValidTargetCohort / resolveTargetCohort in lib/magnet/cohort-rollover
// (server-only), enforced in the DB by the leads_target_cohort_valid trigger.
// The slug constants above are still the right way to REFER to a specific turma.

// Per-turma WELCOME coupon: a small discount auto-applied at the end of the free
// test and delivered in ONE follow-up drip email (D2). Each code is locked to its
// turma(s) in the DB (coupons.applies_to_cohort_slugs): REVALIDA10 (10%) redeems on
// the two live turmas (2027.1 + 2027.2). The 2026-2 entry is legacy — that turma
// went off sale 2026-07-11 and its REVALIDA5 coupon was deactivated; the entry stays
// so a not-yet-reassigned 2026-2 lead renders a stable (if unredeemable) code instead
// of crashing. Keep in sync with schema-patch-retire-cohort-2026-2.sql.
export const WELCOME_COUPONS: Record<string, { code: string; percent: number }> = {
  [REVALIDA_2026_2_SLUG]: { code: "REVALIDA5", percent: 5 },
  [REVALIDA_2027_1_SLUG]: { code: "REVALIDA10", percent: 10 },
  [REVALIDA_20272_SLUG]: { code: "REVALIDA10", percent: 10 },
  // Undecided leads: the all-turma FLASH5 (5%), applied at checkout after they pick.
  [UNDECIDED_COHORT]: { code: "FLASH5", percent: 5 },
};

// Dedicated recovery coupons shown in the Segment-B "come back and finish" nudges —
// one per turma, mirroring WELCOME_COUPONS. Kept separate from WELCOME for clean
// attribution (recovery vs. welcome). The 2026-2 entry is legacy (turma off sale,
// VOLTA5 deactivated 2026-07-11) — kept only for not-yet-reassigned leads. Single
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

// Magic link that opens the 100-question simulado. Sent as the D0 delivery of the
// simulado funnel; the click stamps verified_at (the click IS the confirmation) and
// the SAME link resumes at the next unanswered question. Token = leads.result_token.
export function simuladoAccessUrl(token: string): string {
  return `${SITE_URL}${SIMULADO_PATH}/acesso?t=${encodeURIComponent(token)}`;
}

// One-click turma answer. Used by the undecided track ("Para qual prova você
// está estudando?") and by the post-exam rollover notice, where it doubles as
// "not the right turma? fix it here".
//
// Like /simulado-revalida/acesso this is a magic link: the click is the
// confirmation, and the route exchanges the token for the httpOnly session cookie
// and redirects, so the token never sits in the address bar of a page the
// candidate might screenshot or share. Passing an empty `cohortSlug` links to the
// picker without pre-answering.
export function turmaPickUrl(token: string, cohortSlug: string): string {
  const p = new URLSearchParams({ t: token });
  if (cohortSlug) p.set("c", cohortSlug);
  return `${SITE_URL}/api/leads/turma?${p.toString()}`;
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
    cohort: opts.cohort ?? REVALIDA_2027_1_SLUG,
    email: opts.email,
    utm_source: "email",
    utm_medium: "drip",
    utm_campaign: opts.utmCampaign ?? "lead-drip",
  });
  if (opts.coupon) params.set("cupom", opts.coupon);
  return `${SITE_URL}/checkout?${params.toString()}`;
}
