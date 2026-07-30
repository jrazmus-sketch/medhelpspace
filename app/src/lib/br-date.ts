/**
 * Brazil-timezone calendar helpers.
 *
 * Every "today" in the product is the STUDENT's today (America/São_Paulo), not
 * the server's. Vercel runs in UTC, so `new Date().toISOString().split("T")[0]`
 * rolls over at 21:00 BRT — three hours during which the daily plan, the
 * progress counters, the day-of-week availability check and "pular hoje" all
 * silently referred to tomorrow.
 *
 * Brazil abolished DST in 2019, so São Paulo is a fixed UTC−03:00 today — but
 * nothing here hardcodes that. Every conversion goes through Intl, so historical
 * dates (São Paulo observed DST until 2019) and any future rule change resolve
 * correctly.
 *
 * Mirrors the approach already used by lib/cohort-timing.ts and the simulado
 * drip cron — this module is the shared, tested version of it.
 */

export const BR_TZ = "America/Sao_Paulo";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "en-CA" renders ISO-style YYYY-MM-DD. */
function ymdInBR(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: BR_TZ });
}

/** True only for a real calendar date — "2026-13-45" is well-shaped but invalid. */
function isRealDateKey(key: string): boolean {
  if (!YMD_RE.test(key)) return false;
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

const OFFSET_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BR_TZ, hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/**
 * São Paulo's UTC offset in ms at a given instant (negative — e.g. −3h today,
 * −2h during the pre-2019 summers). Derived from Intl rather than assumed.
 */
function brOffsetMs(atUtcMs: number): number {
  const p = OFFSET_FMT.formatToParts(new Date(atUtcMs));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second"),
  );
  return asIfUtc - atUtcMs;
}

/** Today's calendar date in Brazil, as YYYY-MM-DD. */
export function todayKeyBR(now: Date = new Date()): string {
  return ymdInBR(now);
}

/**
 * The Brazilian calendar date a timestamp falls on. Accepts anything Postgres
 * hands back (`2026-07-28T23:10:00+00:00`, `2026-07-28T23:10:00Z`, a Date).
 * A bare `YYYY-MM-DD` is already a calendar date and is returned untouched —
 * re-interpreting it as UTC midnight would shift it back a day.
 */
export function toDateKeyBR(input: string | Date | null | undefined): string {
  if (input == null) return "";
  if (typeof input === "string") {
    if (input === "") return "";
    // A bare calendar date is already what we want — but only if it is a real
    // one. "2026-13-45" matches the shape and must not be waved through.
    if (YMD_RE.test(input)) return isRealDateKey(input) ? input : "";
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return ymdInBR(d);
}

/** Day of week in Brazil: 0 = Sunday … 6 = Saturday. */
export function dayOfWeekBR(now: Date = new Date()): number {
  return dayOfWeekForKey(todayKeyBR(now));
}

/** Hour of day (0–23) in Brazil — for time-of-day copy like "Bom dia". */
export function hourBR(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: BR_TZ, hour12: false, hour: "2-digit",
  }).format(now);
  return Number(h) % 24;
}

/** Day of week for a YYYY-MM-DD key. Parsed as UTC so it never shifts. */
export function dayOfWeekForKey(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** Shift a YYYY-MM-DD key by N calendar days (negative shifts backwards). */
export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `fromKey` to `toKey` (positive when `toKey` is later). */
export function diffDaysKey(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Instant of local midnight in Brazil for a date key, as an ISO string —
 * the lower bound for `gte("created_at", …)` filters on timestamptz columns.
 */
export function startOfDayBRIso(key: string): string {
  const utcMidnight = Date.parse(`${key}T00:00:00Z`);
  // Shift by the offset in force at that moment, then re-check with the shifted
  // instant so a day that starts on a DST boundary still resolves exactly.
  let ms = utcMidnight - brOffsetMs(utcMidnight);
  ms = utcMidnight - brOffsetMs(ms);
  return new Date(ms).toISOString();
}

/** Exclusive upper bound: local midnight at the START of the next day. */
export function endOfDayBRIso(key: string): string {
  return startOfDayBRIso(addDaysKey(key, 1));
}
