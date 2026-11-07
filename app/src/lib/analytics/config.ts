// Central config for the (public + funnel) GA4 analytics layer.
// The gated /app study area, /admin, and /suporte are intentionally excluded —
// see isTrackedPath. Member-facing study behaviour is deliberately not tracked.

/**
 * GA4 measurement ID (G-XXXXXXXXXX). Public by design — it ships in the browser
 * bundle, so it is NOT a secret. When empty (no env var set), the whole analytics
 * layer is a no-op: no script loads and no event is ever sent.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

/**
 * Route prefixes that must NEVER be tracked (authenticated / internal areas).
 *
 * The ClinAct subscriber area is the ClinAct counterpart of /app (Karina
 * 2026-11-06: "não contabilizar … páginas privadas que não façam parte da
 * jornada pública"): the library, Minha Evolução, the subscription page and the
 * admin's signed preview link. Deliberately NOT excluded: /clinact (the sales
 * page), /clinact/assinar (the checkout — begin_checkout / purchase),
 * /clinact/gratis and /clinact/caso — the free-cases funnel ends with the
 * visitor opening one of the four free cases.
 */
export const ANALYTICS_EXCLUDED_PREFIXES = [
  "/app",
  "/admin",
  "/suporte",
  "/clinact/treinar",
  "/clinact/evolucao",
  "/clinact/assinatura",
  "/clinact/preview",
] as const;

/**
 * Set on a browser the first time an admin account is seen in it, and from
 * then on NOTHING is sent from that browser (Karina 2026-11-06: "não
 * contabilizar … testes internos"). A cookie, not just the role, so a returning
 * admin is excluded on the very first paint — before the profile has loaded.
 * To watch events in GA4 DebugView, use a private window with no admin login.
 */
export const INTERNAL_TRAFFIC_COOKIE = "mhs_internal";

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
