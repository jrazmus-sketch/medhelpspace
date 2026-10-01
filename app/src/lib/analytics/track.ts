// Typed GA4 event helpers. Every call is a safe no-op unless gtag is actually
// loaded (i.e. we're on a tracked route with consent granted), so callers never
// need to guard. Import and call from client components.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function gtag(...args: unknown[]): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag(...args);
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  gtag("event", name, params ?? {});
}

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
export function trackSectionView(section: string): void {
  trackEvent(`view_${section}_section`, { section });
}

/** Scroll depth milestone on a long page (once per milestone per page load). */
export function trackScrollDepth(percent: 25 | 50 | 75 | 90): void {
  trackEvent(`scroll_${percent}`, { percent_scrolled: percent });
}

/** "Comprar" clicked. `location` = hero | nav | sticky_bar | pricing | loja. */
export function trackBuyClick(location: string, turma?: string): void {
  trackEvent("click_buy_now", { location, ...(turma ? { turma } : {}) });
}

/** The free simulado door clicked. `location` = hero | pricing_downsell | … */
export function trackFreeSimulatorClick(location: string): void {
  trackEvent("click_free_simulator", { location });
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
    items: [{ item_id: input.turma, item_name: input.turmaName, price: input.value, quantity: 1 }],
  });
}

/** The sales video's play button clicked (the YouTube player loads only after this). */
export function trackVideoPlay(location: string): void {
  trackEvent("click_play_video", { location });
}

/**
 * The video actually started playing (the player's first PLAYING state) → watch_video_start.
 * Not the same as click_play_video: a click can end without playback (YouTube blocked or
 * slow, a phone that wants a second tap), so the gap between the two is a real drop-off.
 */
export function trackVideoStart(location: string): void {
  trackEvent("watch_video_start", { video_percent: 0, location });
}

/** Milestones the sales video reports while playing; 100 = reached the end. */
export const VIDEO_MILESTONES = [25, 50, 75, 90] as const;

/**
 * Sales video watched to a milestone → watch_video_25 | _50 | _75 | _90 | _100. Own names on
 * purpose: GA4's enhanced measurement uses video_start / video_progress / video_complete
 * and may also pick up the YouTube iframe, so sharing those names would double-count.
 */
export function trackVideoProgress(percent: (typeof VIDEO_MILESTONES)[number] | 100, location: string): void {
  trackEvent(`watch_video_${percent}`, { video_percent: percent, location });
}

/** Push a Consent Mode v2 update when the visitor accepts/declines the banner. */
export function updateConsent(granted: boolean): void {
  gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
  });
}
