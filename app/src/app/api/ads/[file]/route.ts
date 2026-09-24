import { NextResponse, type NextRequest } from "next/server";
import { serveOciFeed } from "@/lib/admin/oci-feed";

// Google Ads Data manager (HTTPS source) refuses any URL that doesn't end in
// ".csv". One connection = one conversion action, so:
//   /api/ads/purchase.csv  → "Purchase" rows only
//   /api/ads/checkout.csv  → "Checkout started" rows only
// Same Basic auth and logic as /api/ads/conversions (lib/admin/oci-feed.ts).

export const dynamic = "force-dynamic";

const FILES: Record<string, string> = {
  "purchase.csv": "purchase",
  "checkout.csv": "checkout",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const key = FILES[file];
  if (!key) return new NextResponse("Not found", { status: 404 });
  return serveOciFeed(request, key);
}
