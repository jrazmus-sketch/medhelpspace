import type { NextRequest } from "next/server";
import { serveOciFeed } from "@/lib/admin/oci-feed";

// Combined file, or one action via ?action=purchase|checkout. Google Ads Data
// manager only accepts URLs ending in .csv — use /api/ads/purchase.csv and
// /api/ads/checkout.csv there (see ../[file]/route.ts). Logic: lib/admin/oci-feed.ts.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return serveOciFeed(request, request.nextUrl.searchParams.get("action"));
}
