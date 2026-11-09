import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/pagbank/rate-limit";
import { isMetaPixelPath } from "@/lib/meta/config";
import { isMirrorEvent, isValidEventId, sanitizeMirrorCustomData } from "@/lib/meta/capi-payload";
import { sendMirrorEvent } from "@/lib/meta/capi";

// Server mirror of the browser's PageView / InitiateCheckout (Karina 2026-11-09:
// the Pixel's own request carries no Test Events code, so PageView never showed
// in Events Manager). Same event_id as the browser event → Meta keeps one.
//
// Never trusts the browser beyond shape: the event name is allowlisted, the page
// must be one of META_PIXEL_PATHS on THIS host, custom data is field-by-field
// sanitized, and consent / live-or-test / internal are re-checked from cookies
// inside sendMirrorEvent. Purchase is NOT accepted here — only PagBank's
// confirmation sends a Purchase.
export const runtime = "nodejs";

// Own bucket: page views must never eat the payment routes' rate limit.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();
function allow(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_PER_WINDOW) return false;
  b.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  if (!allow(getClientIp(request.headers))) return new NextResponse(null, { status: 204 });

  let body: { name?: unknown; eventId?: unknown; url?: unknown; customData?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!isMirrorEvent(body.name) || !isValidEventId(body.eventId) || typeof body.url !== "string") {
    return new NextResponse(null, { status: 400 });
  }

  let page: URL;
  try {
    page = new URL(body.url);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (page.host !== request.nextUrl.host || !isMetaPixelPath(page.pathname)) {
    return new NextResponse(null, { status: 400 });
  }

  // Signed-in visitor → hashed external_id + admin exclusion. Anonymous is fine.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  await sendMirrorEvent(request, {
    eventName: body.name,
    eventId: body.eventId,
    pageUrl: `${page.origin}${page.pathname}`,
    userId,
    customData: body.name === "InitiateCheckout" ? sanitizeMirrorCustomData(body.customData) : {},
  });
  // Same answer whatever happened: the browser learns nothing from it.
  return new NextResponse(null, { status: 204 });
}
