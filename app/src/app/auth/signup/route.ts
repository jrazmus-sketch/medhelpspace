import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeDestination } from "@/lib/ambassadors/ref-link";

export async function POST(request: NextRequest) {
  const { email, password, displayName, next: rawNext } = await request.json();
  const supabase = await createClient();

  // Where the confirmation link should land. ClinAct's "Experimentar
  // gratuitamente" signs the person up and then drops them on the free cases,
  // so the destination has to survive the round trip through e-mail.
  // /auth/confirm applies the same guard again on the way back — this is
  // defence in depth, not a substitute for it.
  const next = typeof rawNext === "string" && rawNext && safeDestination(rawNext) === rawNext ? rawNext : null;
  const confirmUrl = new URL("/auth/confirm", new URL(request.url).origin);
  if (next) confirmUrl.searchParams.set("next", next);

  // The confirmation e-mail template builds its link from {{ .SiteURL }}, not
  // from emailRedirectTo, so the destination rides on the user instead:
  // `{{ if .Data.confirm_next }}&next={{ .Data.confirm_next }}{{ end }}`
  // (supabase/templates/confirmation.html). It also survives a resend from
  // /verify. Only values that sit safely in a query string unescaped are
  // stored — the template engine's escaping is not something we control.
  const confirmNext = next && /^[A-Za-z0-9/_.=?-]+$/.test(next) ? next : null;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || null, ...(confirmNext ? { confirm_next: confirmNext } : {}) },
      emailRedirectTo: confirmUrl.toString(),
    },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ sessionCreated: !!data.session });
}
