// Pure helpers for error tracking (app_errors). No server imports, so the
// instrumentation hook, the browser-report route and the tests share them.

export type AppErrorKind = "server" | "client";

export type AppErrorReport = {
  kind: AppErrorKind;
  message: string;
  route: string | null;
  digest: string | null;
  stack: string | null;
  path: string | null;
  userAgent: string | null;
};

const MAX_STACK_LINES = 15;

/**
 * Group "the same error" across occurrences: ids, numbers and quoted values
 * change between requests and would otherwise make every occurrence a new row.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/(["'`]).*?\1/g, "$1…$1")
    .replace(/\d+/g, "<n>")
    .slice(0, 200);
}

/**
 * The PATH of a URL, never its query string or fragment: on this site those
 * carry lead tokens and magic links, which must not end up in an error log.
 */
export function pathOnly(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "https://x.invalid").pathname.slice(0, 300);
  } catch {
    const cut = url.split(/[?#]/)[0];
    return cut.startsWith("/") ? cut.slice(0, 300) : null;
  }
}

export function trimStack(stack: string | null | undefined): string | null {
  if (!stack) return null;
  return stack.split("\n").slice(0, MAX_STACK_LINES).join("\n").slice(0, 3000);
}

/** Stable key for one distinct error. A digest (server errors) is the best identity. */
export async function errorFingerprint(r: Pick<AppErrorReport, "kind" | "route" | "digest" | "message">): Promise<string> {
  const basis = [r.kind, r.route ?? "", r.digest ?? normalizeMessage(r.message)].join("|");
  const bytes = new TextEncoder().encode(basis);
  const hash = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
