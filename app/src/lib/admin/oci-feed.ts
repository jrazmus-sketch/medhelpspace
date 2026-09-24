import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOciExport, OCI_CONVERSION_CHECKOUT, OCI_CONVERSION_PURCHASE } from "@/lib/admin/oci";

// Shared by /api/ads/conversions and /api/ads/{purchase,checkout}.csv.
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

const CREDENTIAL = "google_ads_oci_feed";
const WINDOW_DAYS = 90;

// Google Ads Data manager binds ONE conversion action per HTTPS connection, so
// each action gets its own URL: ?action=purchase / ?action=checkout returns only
// that action's rows (a connection must never receive another action's rows).
// Without the parameter: every row (the original combined file).
const ACTION_FILTER: Record<string, string> = {
  purchase: OCI_CONVERSION_PURCHASE,
  checkout: OCI_CONVERSION_CHECKOUT,
};

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

/**
 * Serve the feed. `actionKey`: "purchase" | "checkout" for one action's rows, or
 * null for the combined file. An unknown key is a 400.
 */
export async function serveOciFeed(request: NextRequest, actionKey: string | null) {
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

  const only = actionKey ? ACTION_FILTER[actionKey] : null;
  if (actionKey && !only) return new NextResponse("Unknown action", { status: 400 });

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { csv: full } = await buildOciExport({ feedSinceIso: since });
  // Header = first two lines (Parameters + column names); rows follow. The
  // conversion name is the 2nd column and never contains a comma.
  const lines = full.split("\n").filter(Boolean);
  // Per-action files are for Google Ads Data manager, which reads a PLAIN CSV:
  // column names on line 1 (no "Parameters:TimeZone=…" line — that is the old
  // uploader's format) and the time zone inside each time. Brazil has had no DST
  // since 2019, so São Paulo is a fixed -03:00.
  const csv = only
    ? [
        lines[1],
        ...lines
          .slice(2)
          .filter((l) => l.split(",")[1] === only)
          .map((l) => {
            const c = l.split(",");
            c[2] = `${c[2]}-03:00`;
            return c.join(",");
          }),
      ].join("\n") + "\n"
    : full;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="medhelpspace-${actionKey ?? "conversions"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
