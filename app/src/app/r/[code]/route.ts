import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  REF_COOKIE,
  REF_MAX_AGE_SECONDS,
  normalizeRefCode,
  safeDestination,
} from "@/lib/ambassadors/ref-link";

// Ambassador tracking link: https://medhelpspace.com.br/r/<CODE>
//
// Records the click, drops the 30-day attribution cookie, and forwards the
// visitor onward. This is the only place clicks are counted, so the panel's
// "cliques no link" (cl. 8.1) and any attribution dispute (cl. 8.3) read from one
// consistent record.
//
// A dead or unknown code must never look broken to the visitor — they were sent
// here by a person, not by us. Unknown codes simply redirect to the site with no
// cookie set.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const url = request.nextUrl;

  const destination = new URL(safeDestination(url.searchParams.get("destino")), request.url);

  // Carry advertising params through, so an ambassador link that also has UTMs
  // still attributes correctly in GA4 after the hop.
  for (const [key, value] of url.searchParams) {
    if (key === "destino") continue;
    destination.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(destination);

  // Exact match on the stored value, never a pattern: see normalizeRefCode.
  const refCode = normalizeRefCode(code);
  if (!refCode) return response;

  const admin = createAdminClient();
  const { data: ambassador, error: lookupError } = await admin
    .from("ambassadors")
    .select("id, code, status")
    .eq("code", refCode)
    .maybeSingle();

  // A failed lookup and an unknown code both send the visitor onward, but they
  // are not the same event: the first is our bug and has to be visible, or the
  // whole programme silently stops attributing and nobody finds out until an
  // ambassador asks why their sales show zero clicks.
  if (lookupError) {
    console.error("ambassador lookup failed for ref code", refCode, lookupError);
    return response;
  }

  // Unknown code → no cookie, no click, no error page.
  if (!ambassador) return response;

  // A terminated ambassador's link stops attributing but still resolves, so old
  // posts keep working as links (cl. 12.4: "links antigos poderão redirecionar
  // para página institucional sem gerar nova comissão").
  if (ambassador.status === "terminated") return response;

  // Awaited, not fire-and-forget: on Vercel the function is frozen the moment the
  // handler returns, and an un-awaited insert is cut off mid-flight.
  const { error } = await admin.from("ambassador_clicks").insert({
    ambassador_id: ambassador.id,
    landing_path: destination.pathname,
    referer: request.headers.get("referer"),
    user_agent: request.headers.get("user-agent"),
  });
  if (error) {
    // A lost click is a reporting gap, never a reason to break the visit.
    console.error("ambassador_clicks insert failed", ambassador.id, error);
  }

  // Last click wins: overwriting the cookie IS the rule from cl. 3.1.
  response.cookies.set(REF_COOKIE, ambassador.code as string, {
    maxAge: REF_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax", // must survive the cross-site hop from Instagram/WhatsApp
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
