// Central config for the (public + funnel) GA4 analytics layer.
// The gated /app study area, /admin, and /suporte are intentionally excluded —
// see isTrackedPath. Member-facing study behaviour is deliberately not tracked.

/**
 * GA4 measurement ID (G-XXXXXXXXXX). Public by design — it ships in the browser
 * bundle, so it is NOT a secret. When empty (no env var set), the whole analytics
 * layer is a no-op: no script loads and no event is ever sent.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

/** Route prefixes that must NEVER be tracked (authenticated / internal areas). */
export const ANALYTICS_EXCLUDED_PREFIXES = ["/app", "/admin", "/suporte"] as const;

/**
 * Default analytics consent for a first-time visitor.
 * "granted" = notice + opt-out (current LGPD posture — data on by default, easy
 * opt-out). Flip this single constant to "denied" to switch the entire site to
 * strict opt-in: GA then loads only after the visitor accepts. No other change.
 */
export const ANALYTICS_DEFAULT_CONSENT: "granted" | "denied" = "granted";

/** True when the path is a public / funnel route we're allowed to track. */
export function isTrackedPath(pathname: string): boolean {
  return !ANALYTICS_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
