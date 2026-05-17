// Per-IP fixed-window rate limit for the PagBank webhook.
// Best-effort only: on serverless platforms (Vercel), the Map is per-instance,
// so cross-instance bursts can slip through. Still useful against a single
// attacker probing from one IP against a warm container.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    pruneIfStale(now);
    return true;
  }

  if (bucket.count >= MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

let lastPrune = 0;
function pruneIfStale(now: number) {
  if (now - lastPrune < WINDOW_MS) return;
  lastPrune = now;
  for (const [ip, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(ip);
  }
}

export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}
