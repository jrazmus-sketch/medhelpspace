import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOciExport } from "@/lib/admin/oci";

// Google Ads scheduled conversion upload (2026-09-23 — "I don't want to download
// CSVs"). Google Ads → Goals → Conversions → Uploads → Schedules → source HTTPS
// fetches this URL daily with HTTP Basic auth and imports the file itself.
//
// Returns every ad-click conversion of the last 90 days (Google's click window).
// Rows Google already has (same click id + conversion name + time) are ignored as
// duplicates, so sending the whole window every day is safe and self-healing.
//
// Auth: username + SHA-256 of the password in integration_credentials
// (schema-patch-integration-credentials.sql). Anything else → 401, no detail.

export const dynamic = "force-dynamic";

const CREDENTIAL = "google_ads_oci_feed";
const WINDOW_DAYS = 90;

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="medhelpspace-ads"', "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return unauthorized();
  let user = "";
  let pass = "";
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 0) return unauthorized();
    user = decoded.slice(0, i);
    pass = decoded.slice(i + 1);
  } catch {
    return unauthorized();
  }

  const admin = createAdminClient();
  const { data: cred } = await admin
    .from("integration_credentials")
    .select("username, secret_sha256")
    .eq("name", CREDENTIAL)
    .maybeSingle();
  if (!cred || cred.username !== user || !sameHex(sha256Hex(pass), cred.secret_sha256 as string)) {
    return unauthorized();
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { csv } = await buildOciExport({ feedSinceIso: since });
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="medhelpspace-conversions.csv"',
      "Cache-Control": "no-store",
    },
  });
}
