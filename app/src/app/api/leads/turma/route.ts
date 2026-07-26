import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidTargetCohort } from "@/lib/magnet/cohort-rollover";
import { SIMULADO_SOURCE } from "@/lib/magnet/links";
import { SIM_SESSION_COOKIE, SIM_SESSION_MAX_AGE } from "@/lib/magnet/simulado";

// One-click "para qual prova você está estudando?" — the answer step of the
// undecided track, and the correction link on the post-exam rollover notice.
//
// A ROUTE HANDLER for the same reason /simulado-revalida/acesso is one: the click
// arrives from an inbox, has to WRITE, and must not leave the lead's token sitting
// in the address bar. It exchanges the token for the httpOnly session cookie and
// redirects to the confirmation page, which reads the cookie instead.
//
// Trust model is the magic link's: possession of the token is the confirmation,
// so an unverified lead who clicks here becomes verified — exactly as they would
// by clicking the resume link.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  const slug = (url.searchParams.get("c") ?? "").trim();

  const dest = new URL("/simulado-revalida/turma", url.origin);
  if (!token) return NextResponse.redirect(dest);

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("id, source, verified_at, target_cohort, previous_target_cohort")
    .eq("result_token", token)
    .maybeSingle();

  // Unknown token → the picker page, which shows its own "we couldn't find you"
  // state rather than leaking whether the token existed.
  if (!lead) return NextResponse.redirect(dest);

  const patch: Record<string, unknown> = {};
  if (!lead.verified_at) patch.verified_at = new Date().toISOString();

  const current = lead.target_cohort as string | null;
  if (slug && slug !== current && (await isValidTargetCohort(slug))) {
    patch.target_cohort = slug;
    // Never overwrite an existing record: previous_target_cohort holds the
    // ORIGINAL choice so /admin/leads can render "2026.2 → 2027.1" rather than
    // silently rewriting what the lead actually picked.
    patch.previous_target_cohort = (lead.previous_target_cohort as string | null) ?? current;
    dest.searchParams.set("ok", "1");
  }

  if (Object.keys(patch).length > 0) {
    await admin.from("leads").update(patch).eq("id", lead.id);
  }

  const res = NextResponse.redirect(dest);
  // Only a simulado lead gets an exam session out of this — for a lead from
  // another funnel the cookie would be meaningless, and handing out exam access
  // as a side effect of answering a segmentation question is not a trade we need.
  if (lead.source === SIMULADO_SOURCE) {
    res.cookies.set(SIM_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SIM_SESSION_MAX_AGE,
    });
  }
  return res;
}
