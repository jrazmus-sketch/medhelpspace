import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";

// Storefront refresh at the start of every Brazilian day (00:01 BRT = 03:01 UTC).
//
// A turma's promotional price only counts inside its window (cohorts.sale_price_starts_at /
// sale_price_ends_at, lib/cohort-sale.ts), and every window boundary falls on a Brasília
// midnight (the admin edits it in days). The sales page and /loja are ISR-cached for up to an
// hour, so without this, R$ 1.498,50 could still be on "/" at 00:30 on 01/12 while the checkout
// (rendered per request) already charges R$ 2.997. This drops those caches right after the
// boundary. The charge itself never depends on it: it re-reads the price and refuses a checkout
// opened at the old one (expectedPriceCents in /api/pagbank/charge).
//
// Idempotent and cheap (three cache invalidations). Schedule: app/vercel.json.
// Auth: "Authorization: Bearer <CRON_SECRET>".

export const dynamic = "force-dynamic";

const STOREFRONT_PATHS = ["/", "/loja", "/questoes-revalida"];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`, "utf8");
  const actual = Buffer.from(authHeader ?? "", "utf8");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  for (const path of STOREFRONT_PATHS) revalidatePath(path);
  return NextResponse.json({ ok: true, revalidated: STOREFRONT_PATHS });
}
