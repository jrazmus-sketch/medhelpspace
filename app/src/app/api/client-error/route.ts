import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { recordAppError } from "@/lib/app-errors-server";
import { pathOnly, trimStack } from "@/lib/app-errors";

// Browser crashes reported by the error boundaries (app/error.tsx,
// app/global-error.tsx) into app_errors. Public by necessity — the crash may
// happen before anyone logs in — so it is defended instead of authenticated:
//   · same-origin only (Origin must match the host), so other sites cannot
//     post into it;
//   · its own per-IP bucket (prefixed key, so it never eats the payment
//     routes' budget);
//   · a hard body cap, and every field truncated;
//   · the query string is dropped from the reported URL (lead tokens).
// Always answers 204: a report endpoint must never itself surface an error.
export const runtime = "nodejs";

const MAX_BODY = 8 * 1024;

export async function POST(request: NextRequest) {
  const ok = () => new NextResponse(null, { status: 204 });

  // Same-origin only. Origin is sent on POSTs by current browsers; the
  // Referer is the fallback for the few that omit it on a beacon.
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  let sameOrigin = false;
  try {
    sameOrigin = !!source && new URL(source).host === request.nextUrl.host;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return ok();
  if (!checkRateLimit(`client-error:${getClientIp(request.headers)}`)) return ok();

  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY) return ok();

  let body: { message?: unknown; stack?: unknown; digest?: unknown; url?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return ok();
  }
  const str = (v: unknown, max: number) => (typeof v === "string" && v ? v.slice(0, max) : null);

  const path = pathOnly(str(body.url, 2000));
  await recordAppError({
    kind: "client",
    message: str(body.message, 500) ?? "Erro no navegador",
    // Browser errors have no route pattern; the path groups them.
    route: path,
    digest: str(body.digest, 100),
    stack: trimStack(str(body.stack, 6000)),
    path,
    userAgent: str(request.headers.get("user-agent"), 300),
  });
  return ok();
}
