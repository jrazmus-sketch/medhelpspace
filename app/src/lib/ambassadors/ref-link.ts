// Pure helpers for the ambassador tracking link. No server-only import and no
// Supabase access, so the redirect guard below is directly testable — it is the
// one piece of this feature where a mistake is a security bug rather than a
// reporting bug.

/** First-party attribution cookie. */
export const REF_COOKIE = "mhs_ref";

/** 30-day attribution window (Contrato, cl. 3.1). */
export const REF_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** True if the string contains a C0 control character or DEL. */
function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Resolve the `?destino=` parameter of /r/<code> to a safe redirect target.
 *
 * The whole URL is public and shareable, so `destino` is attacker-controlled:
 * anyone can mint `medhelpspace.com.br/r/ANY?destino=<somewhere else>`. Handing
 * that to a redirect unchecked turns our domain into a phishing hop — the link
 * genuinely does start on medhelpspace.com.br, which is exactly what makes it
 * effective.
 *
 * Only same-origin absolute paths are allowed; everything else falls back to "/".
 */
export function safeDestination(raw: string | null | undefined): string {
  if (!raw) return "/";

  // Must be a rooted path...
  if (!raw.startsWith("/")) return "/";
  // ...but "//evil.com" is protocol-relative and leaves the origin.
  if (raw.startsWith("//")) return "/";
  // A backslash lets some parsers re-read the string as an authority ("/\evil.com").
  if (raw.includes("\\")) return "/";
  // A colon can reintroduce a scheme once a parser normalizes the value.
  if (raw.includes(":")) return "/";
  // Control characters (NUL, tab, CR/LF) can split headers or mask the checks above.
  if (hasControlChars(raw)) return "/";

  return raw;
}

/** The shareable link shown to an ambassador in their panel. */
export function buildRefUrl(origin: string, code: string, destino?: string): string {
  const url = new URL(`/r/${encodeURIComponent(code)}`, origin);
  if (destino) url.searchParams.set("destino", destino);
  return url.toString();
}

/**
 * Normalize a ref code from a URL or cookie into the exact value stored in
 * `ambassadors.code`, or null if it cannot be one.
 *
 * Codes are minted by `criarEmbaixador`, which uppercases and constrains them to
 * [A-Z0-9._-]; the unique index is on UPPER(code). Applying the same two rules
 * here means the caller can look the code up with an exact match instead of a
 * pattern.
 *
 * That distinction is the point. `_` is a single-character LIKE wildcard and `%`
 * matches anything, so a pattern lookup lets a visitor mint /r/M_RIA10 — or just
 * /r/% — and be credited to whichever ambassador happens to match. Attribution
 * decides who gets paid, so the lookup has to be exact.
 */
export function normalizeRefCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase();
  if (!code) return null;
  if (!/^[A-Z0-9._-]+$/.test(code)) return null;
  return code;
}
