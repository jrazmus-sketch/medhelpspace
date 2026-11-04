import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeDestination } from "@/lib/ambassadors/ref-link";
import { isClinactDestination } from "@/lib/clinact/destination";
import { CLINACT_CONFIRMATION_SUBJECT, clinactConfirmationEmailHtml } from "@/lib/clinact/confirmation-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailSettings, sendEmailRaw } from "@/lib/email";
import { USE_MOCK_DATA } from "@/lib/mock-data";

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
  const confirmNext = next && /^\/(?!\/)[A-Za-z0-9/_.=?-]*$/.test(next) ? next : null;
  // A signup that starts in ClinAct gets the "MedHelpSpace | ClinAct" header on
  // its confirmation e-mail (Karina 2026-11-03). A plain boolean because the
  // template can only test truthiness safely: `{{ if .Data.clinact_signup }}`.
  const clinactSignup = isClinactDestination(next);
  const userData = {
    display_name: displayName || null,
    ...(confirmNext ? { confirm_next: confirmNext } : {}),
    ...(clinactSignup ? { clinact_signup: true } : {}),
  };

  // ClinAct: the app sends the confirmation itself, branded ClinAct, instead
  // of Supabase's dashboard template (which names Revalida). generateLink
  // creates the user and returns the token WITHOUT sending anything; the link
  // has the exact shape the template builds, so /auth/confirm is unchanged.
  // If our send fails, fall through to Supabase's own e-mail — an
  // off-brand confirmation beats none.
  if (clinactSignup && !USE_MOCK_DATA) {
    const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { data: userData, redirectTo: confirmUrl.toString() },
    });
    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }
    // The link carries a live token, so its host comes from the configured
    // site address — never from the request, whose Host a caller controls.
    const settings = await getEmailSettings();
    const origin = new URL(settings.app_url).origin;
    const href = new URL("/auth/confirm", origin);
    href.searchParams.set("token_hash", link.properties.hashed_token);
    href.searchParams.set("type", "signup");
    if (next) href.searchParams.set("next", next);
    const sent = await sendEmailRaw({
      to: email,
      subject: CLINACT_CONFIRMATION_SUBJECT,
      html: clinactConfirmationEmailHtml(href.toString(), origin),
      from: settings.from_address,
    });
    if (sent.ok) return NextResponse.json({ sessionCreated: false });
    console.error("clinact signup: confirmation send failed, falling back to Supabase", sent.reason);
    await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmUrl.toString() } });
    return NextResponse.json({ sessionCreated: false });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData,
      emailRedirectTo: confirmUrl.toString(),
    },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ sessionCreated: !!data.session });
}
