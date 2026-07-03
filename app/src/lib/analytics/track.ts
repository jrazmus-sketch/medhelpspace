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

/** Push a Consent Mode v2 update when the visitor accepts/declines the banner. */
export function updateConsent(granted: boolean): void {
  gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
  });
}
