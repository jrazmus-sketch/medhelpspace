import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const origin = `${proto}://${host}`;

  // Accept both JSON (legacy client-side) and form-data (native HTML form)
  let email = "";
  let password = "";
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await request.json();
    email = body.email ?? "";
    password = body.password ?? "";
  } else {
    const fd = await request.formData();
    email = (fd.get("email") as string) ?? "";
    password = (fd.get("password") as string) ?? "";
  }

  if (!email || !password) {
    return NextResponse.redirect(`${origin}/login?error=empty`, { status: 303 });
  }

  // Build the success redirect first so we can attach cookies directly to it.
  const successResponse = NextResponse.redirect(`${origin}/app`, { status: 303 });

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
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
      { status: 303 },
    );
  }

  return successResponse;
}
