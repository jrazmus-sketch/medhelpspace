import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Skip auth checks entirely when running in mock-data mode. Mirrors USE_MOCK_DATA
// in lib/mock-data.ts: no Supabase URL, OR the explicit dev override flag
// (CLAUDE.md documents NEXT_PUBLIC_USE_MOCK_DATA=true as a way to force mock mode
// even when a Supabase URL is configured).
const MOCK_MODE =
  !SUPABASE_URL || process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Mock mode: let everything through ──────────────────────────────────────
  if (MOCK_MODE) return NextResponse.next({ request });

  // ── Build the response object so session cookies can be refreshed ──────────
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Write cookies to both the forwarded request and the response so
        // the browser receives refreshed session tokens.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            secure: process.env.NODE_ENV === "production",
          }),
        );
      },
    },
  });

  // IMPORTANT: getUser() validates the session server-side. getSession()
  // only reads the cookie and cannot detect a revoked token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;
  const isProtected =
    pathname.startsWith("/app") || pathname.startsWith("/admin");
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // Unauthenticated user hitting a protected route → login
  if (isProtected && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting login/signup → dashboard
  if (isAuthPage && isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets; run on everything else.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
