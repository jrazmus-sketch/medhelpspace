// Client-side consent storage for the analytics layer. One cookie, 1-year life.
// Read by both the AnalyticsProvider (decide whether to load GA) and the inline
// ga-init script (Consent Mode default) so a returning opt-out visitor is honored
// on the very first paint, before gtag has a chance to set anything.

export type AnalyticsConsent = "granted" | "denied";

const COOKIE_NAME = "mhs_analytics_consent";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function getStoredConsent(): AnalyticsConsent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)mhs_analytics_consent=([^;]+)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return value === "granted" || value === "denied" ? value : null;
}

export function setStoredConsent(value: AnalyticsConsent): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  // Notify the provider so it can (un)load GA immediately, no reload required.
  window.dispatchEvent(new Event("mhs-consent-change"));
}

export function hasConsentChoice(): boolean {
  return getStoredConsent() !== null;
}
