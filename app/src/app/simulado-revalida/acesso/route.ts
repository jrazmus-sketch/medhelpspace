import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIM_SESSION_COOKIE, SIM_SESSION_MAX_AGE } from "@/lib/magnet/simulado";

// Magic-link entry for the simulado funnel. The resume link in the delivery email
// (lead-sim-access) points here with ?t=<result_token>.
//
// This is a ROUTE HANDLER, not a page, and deliberately so: cookies cannot be
// modified while rendering a server component, only in a Server Action or a route
// handler. It exchanges the token for the httpOnly session cookie and redirects to
// the exam, so the token leaves the URL after one hop and never sits in the address
// bar of a page a candidate might screenshot or share.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("t") ?? "").trim();

  // No/unknown token: send them to the exam, which shows the "we couldn't find your
  // simulado" state (and picks up an existing session if they already have one).
  const provaUrl = new URL("/simulado-revalida/prova", url.origin);
  if (!token) return NextResponse.redirect(provaUrl);

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("id, verified_at")
    .eq("result_token", token)
    .maybeSingle();

  if (!lead) return NextResponse.redirect(provaUrl);

  // Clicking the emailed link IS the confirmation (magic-link trust model).
  if (!lead.verified_at) {
    await admin.from("leads").update({ verified_at: new Date().toISOString() }).eq("id", lead.id);
  }

  const res = NextResponse.redirect(provaUrl);
  res.cookies.set(SIM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SIM_SESSION_MAX_AGE,
  });
  return res;
}
