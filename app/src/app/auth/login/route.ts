import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeDestination } from "@/lib/ambassadors/ref-link";

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;

  // Accept both JSON (legacy client-side) and form-data (native HTML form)
  let email = "";
  let password = "";
  let rawNext = "";
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await request.json();
    email = body.email ?? "";
    password = body.password ?? "";
    rawNext = body.next ?? "";
  } else {
    const fd = await request.formData();
    email = (fd.get("email") as string) ?? "";
    password = (fd.get("password") as string) ?? "";
    rawNext = (fd.get("next") as string) ?? "";
  }

  // Where to land after signing in. The proxy already sends people here as
  // /login?next=<where they were going> — until now that was declared and then
  // ignored, so everyone landed on /app. A ClinAct subscriber has no Revalida
  // cohort, so /app would bounce them straight back out.
  //
  // `next` reaches us from the query string, so it is attacker-controlled:
  // same guard as the ambassador links and /auth/confirm.
  const next = rawNext && safeDestination(rawNext) === rawNext ? rawNext : "/app";
  const backToLogin = (error: string) =>
    `${origin}/login?error=${error}${next !== "/app" ? `&next=${encodeURIComponent(next)}` : ""}`;

  if (!email || !password) {
    // Keep the destination across a failed attempt, or the second try lands
    // somewhere else than the first would have.
    return NextResponse.redirect(backToLogin("empty"), { status: 303 });
  }

  // Build the success redirect first so we can attach cookies directly to it.
  const successResponse = NextResponse.redirect(`${origin}${next}`, { status: 303 });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies onto the redirect response directly so they are
          // guaranteed to be present when the browser follows the redirect.
          cookiesToSet.forEach(({ name, value, options }) => {
            successResponse.cookies.set(name, value, {
              ...options,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            });
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.redirect(backToLogin(encodeURIComponent(error.message)), { status: 303 });
  }

  return successResponse;
}
