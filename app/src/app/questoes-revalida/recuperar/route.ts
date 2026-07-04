import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resultUrl, magnetUrl } from "@/lib/magnet/links";

// Segment-A recovery magic link. A lead who finished all 15 free questions but never
// typed the 6-digit code gets ONE email whose button lands here. The click on a link
// sent to their own inbox IS the verification (the standard magic-link trust model):
// we stamp verified_at — which also drops them into the normal verified drip
// (lead-drip filters verified_at IS NOT NULL) — then hand them to their durable
// reward page, which rebuilds the plan + flashcards from the stored row.
//
// The result_token is the auth (unguessable UUID). Idempotent: a second click on an
// already-verified lead just re-lands on the reward page.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (!token) return NextResponse.redirect(magnetUrl());

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("id, verified_at")
    .eq("result_token", token)
    .maybeSingle();

  if (!lead) return NextResponse.redirect(magnetUrl());

  // Verify on first click only. drip_status is left untouched: an 'active' lead now
  // enters the verified drip; an 'unsubscribed'/'bounced' one stays suppressed
  // (respected), and a 'converted' buyer is unaffected.
  if (!lead.verified_at) {
    await admin
      .from("leads")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", lead.id);
  }

  return NextResponse.redirect(resultUrl(token));
}
