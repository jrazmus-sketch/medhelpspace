// Typed GA4 event helpers. Every call is a safe no-op unless gtag is actually
// loaded (i.e. we're on a tracked route with consent granted), so callers never
// need to guard. Import and call from client components.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * GA loads `afterInteractive` — AFTER hydration — so an event fired in the first
 * moments (a section already on screen at load, e.g. the sales video) used to
 * find no gtag and vanish, and the tracker had already marked it "seen". Such a
 * call now waits up to 10 s for gtag. Nothing is queued anywhere GA could read
 * it later: if gtag never appears (consent denied, untracked route, internal
 * browser) the call is simply dropped, as before. Once gtag exists, GA's own
 * kill switch still decides what is sent.
 */
const GTAG_WAIT_MS = 10_000;
const GTAG_POLL_MS = 250;

function gtag(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") return window.gtag(...args);
  let waited = 0;
  const timer = window.setInterval(() => {
    waited += GTAG_POLL_MS;
    if (typeof window.gtag === "function") {
      window.clearInterval(timer);
      window.gtag(...args);
    } else if (waited >= GTAG_WAIT_MS) {
      window.clearInterval(timer);
    }
  }, GTAG_POLL_MS);
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  gtag("event", name, params ?? {});
}

/**
 * Send an event, THEN run `next` — for an event fired right before a client-side
 * navigation to a route GA must not track (its kill switch flips on arrival and
 * could drop a hit still in gtag's queue). `next` always runs exactly once: on
 * GA's callback, after `timeoutMs`, or at once when GA is not loaded.
 */
export function trackEventThen(name: string, params: Record<string, unknown>, next: () => void, timeoutMs = 1000): void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    next();
  };
  if (typeof window === "undefined" || typeof window.gtag !== "function") return go();
  window.setTimeout(go, timeoutMs);
  window.gtag("event", name, { ...params, event_callback: go, event_timeout: timeoutMs });
}

/** Which product an event belongs to — the `product` parameter (Karina 2026-11-06). */
export type Product = "revalida" | "clinact";

/** Account created — fires on the signup page and guest-checkout signup. */
export function trackSignUp(method: string = "email"): void {
  trackEvent("sign_up", { method });
}

/** Purchase confirmed. `value` is in BRL (reais, not cents). */
export function trackPurchase(input: {
  value: number;
  transactionId?: string;
  method?: string;
  currency?: string;
}): void {
  trackEvent("purchase", {
    transaction_id: input.transactionId,
    value: input.value,
    currency: input.currency ?? "BRL",
    payment_type: input.method,
    product: "revalida",
  });
}

/** A key marketing CTA was clicked (e.g. "comprar", "comecar-gratis"). */
export function trackCtaClick(cta: string): void {
  trackEvent("cta_click", { cta });
}

// ── Sales-page funnel events (Karina, 2026-09-30) ─────────────────────────────
// One event name per step so the funnel reads directly in GA4's event reports and
// Funnel exploration without registering dimensions first; the parameters are
// there for the breakdowns once `section` / `location` / `turma` / `funnel` are
// registered as custom dimensions.

/** A named section of the sales page scrolled into view (once per page load). */
export function trackSectionView(section: string, product?: Product): void {
  trackEvent(`view_${section}_section`, { section, ...(product ? { product } : {}) });
}

/**
 * Scroll depth milestone on a long page (once per milestone per page load). The
 * same names on every sales page (Karina 2026-11-06, ClinAct: "manter os mesmos
 * eventos"); `product` and the page path tell the pages apart.
 */
export function trackScrollDepth(percent: 25 | 50 | 75 | 90, product?: Product): void {
  trackEvent(`scroll_${percent}`, { percent_scrolled: percent, ...(product ? { product } : {}) });
}

/** "Comprar" clicked. `location` = hero | nav | sticky_bar | pricing | loja. */
export function trackBuyClick(location: string, turma?: string): void {
  trackEvent("click_buy_now", { location, ...(turma ? { turma } : {}) });
}

/** The free simulado door clicked. `location` = hero | pricing_downsell | … */
export function trackFreeSimulatorClick(location: string): void {
  trackEvent("click_free_simulator", { location });
}

/** "Teste 50 flashcards grátis →" on the sales page → /flashcards-revalida (Karina 2026-10-09). */
export function trackFreeFlashcardsClick(location: string): void {
  trackEvent("click_free_flashcards", { location });
}

/** A turma chosen in the pricing selector → e.g. select_revalida_2027_1. */
export function trackTurmaSelect(slug: string): void {
  trackEvent(turmaSelectEventName(slug), { turma: slug });
}

/**
 * Event name for a turma pick. The 2027.2 slug is `revalida-20272` (no separator), so
 * the year and the edition are split back apart → select_revalida_2027_2, matching
 * select_revalida_2027_1 (Karina 2026-10-01). The `turma` parameter keeps the real slug.
 */
export function turmaSelectEventName(slug: string): string {
  return `select_${slug.replace(/-/g, "_").replace(/_(\d{4})(\d)$/, "_$1_$2")}`;
}

/** A lead left an e-mail. `funnel` = flashcards | simulado15 | simulado100 | exit_intent. */
export function trackLeadSubmit(funnel: string): void {
  trackEvent("lead_submit", { funnel });
}

/** Checkout page opened for a turma. GA4's recommended shape; value in BRL. */
export function trackBeginCheckout(input: { turma: string; turmaName: string; value: number }): void {
  trackEvent("begin_checkout", {
    currency: "BRL",
    value: input.value,
    turma: input.turma,
    product: "revalida",
    items: [{ item_id: input.turma, item_name: input.turmaName, price: input.value, quantity: 1 }],
  });
}

// ── ClinAct (Karina 2026-11-06) ───────────────────────────────────────────────

/** The plan keys of lib/clinact/plans.ts as GA4 reads them: `plan` = monthly | annual. */
export type ClinactPlanParam = "monthly" | "annual";
export function clinactPlanParam(planKey: string): ClinactPlanParam {
  return planKey === "anual" ? "annual" : "monthly";
}

/** A ClinAct plan button on the sales page → select_clinact_monthly | select_clinact_annual. */
export function clinactPlanSelectEventName(planKey: string): string {
  return `select_clinact_${clinactPlanParam(planKey)}`;
}

/** The ClinAct item, in GA4's ecommerce shape. Value = what is charged today, in BRL. */
function clinactItem(planKey: string, value: number) {
  const plan = clinactPlanParam(planKey);
  return {
    currency: "BRL",
    value,
    product: "clinact",
    plan,
    items: [{ item_id: `clinact_${plan}`, item_name: `ClinAct ${plan === "annual" ? "anual" : "mensal"}`, price: value, quantity: 1 }],
  };
}

/** The ClinAct checkout (/clinact/assinar) opened, with the plan it opened on. */
export function trackClinactBeginCheckout(planKey: string, value: number): void {
  trackEvent("begin_checkout", clinactItem(planKey, value));
}

/**
 * The first ClinAct charge APPROVED (state "paid"), then `next` (the redirect to
 * the library, a route GA does not track). A charge still in analysis sends
 * nothing here: the access arrives later by webhook, with nobody on the page.
 */
export function trackClinactPurchase(input: { planKey: string; value: number; subscriptionId: string }, next: () => void): void {
  trackEventThen(
    "purchase",
    { ...clinactItem(input.planKey, input.value), transaction_id: input.subscriptionId, payment_type: "card" },
    next,
  );
}

/**
 * Which sales video an event is about. Each page's video has its own event family so
 * the two funnels never mix: the Revalida hero → click_play_video / watch_video_*,
 * the ClinAct page → click_play_clinact_video / watch_clinact_video_* (Karina 2026-11-06).
 */
export type VideoFamily = "video" | "clinact_video";

/** The sales video's play button clicked (the YouTube player loads only after this). */
export function trackVideoPlay(location: string, family: VideoFamily = "video"): void {
  trackEvent(`click_play_${family}`, { location });
}

/**
 * The video actually started playing (the player's first PLAYING state) → watch_video_start.
 * Not the same as click_play_video: a click can end without playback (YouTube blocked or
 * slow, a phone that wants a second tap), so the gap between the two is a real drop-off.
 */
export function trackVideoStart(location: string, family: VideoFamily = "video"): void {
  trackEvent(`watch_${family}_start`, { video_percent: 0, location });
}

/** Milestones the sales video reports while playing; 100 = reached the end. */
export const VIDEO_MILESTONES = [25, 50, 75, 90] as const;

/**
 * Sales video watched to a milestone → watch_video_25 | _50 | _75 | _90 | _100. Own names on
 * purpose: GA4's enhanced measurement uses video_start / video_progress / video_complete
 * and may also pick up the YouTube iframe, so sharing those names would double-count.
 */
export function trackVideoProgress(
  percent: (typeof VIDEO_MILESTONES)[number] | 100,
  location: string,
  family: VideoFamily = "video",
): void {
  trackEvent(`watch_${family}_${percent}`, { video_percent: percent, location });
}

/** Push a Consent Mode v2 update when the visitor accepts/declines the banner. */
export function updateConsent(granted: boolean): void {
  gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
  });
}
