import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Skip auth checks entirely when running in mock-data mode. Mirrors USE_MOCK_DATA
// in lib/mock-data.ts: no Supabase URL, OR the explicit dev override flag
// (CLAUDE.md documents NEXT_PUBLIC_USE_MOCK_DATA=true as a way to force mock mode
// even when a Supabase URL is configured).
//
// HARD PRODUCTION GUARD: mock mode is a dev-only convenience. The whole expression
// is gated on NODE_ENV !== "production" so that neither a missing Supabase URL nor a
// stray NEXT_PUBLIC_USE_MOCK_DATA=true in the prod/preview env can disable auth + the
// membership paywall in a production build. `next build`/`next start` set
// NODE_ENV=production, so this branch is dead-code-eliminated from the prod bundle.
const MOCK_MODE =
  process.env.NODE_ENV !== "production" &&
  (!SUPABASE_URL || process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true");

// Marks a browser as belonging to the team: set (1 year) the first time an
// admin-role user opens /admin in it. /api/funnel-event stamps beacons from
// cookie-carrying browsers is_internal so the team's own visits to the public
// funnel never inflate the Landed/Started stages on /admin/leads.
const INTERNAL_COOKIE = "mhs_internal";
const ADMIN_ROLES = ["super_admin", "content_admin", "support_admin", "billing_admin"];

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

  // ── Internal-traffic marker ─────────────────────────────────────────────
  // One profiles query per admin browser, and only while the cookie is absent
  // — anonymous visitors and members never trigger it.
  if (user && pathname.startsWith("/admin") && !request.cookies.has(INTERNAL_COOKIE)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (ADMIN_ROLES.includes((profile?.role as string) ?? "member")) {
      response.cookies.set(INTERNAL_COOKIE, "1", {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, AND route handlers (/api/*).
    //
    // /api is excluded on purpose: the proxy's only jobs are to refresh the
    // session cookie for *page* navigations and to gate /app + /admin. It never
    // protected /api (those routes do their own getUser() + role checks). Worse,
    // running getUser() here for every /api call means a public, session-free
    // endpoint like /api/pagbank/installments — which the checkout card form
    // polls as the buyer types — triggers a refresh-token rotation. Two such
    // requests racing on the single-use refresh token (or the poll racing the
    // charge POST) makes supabase-ssr invalidate the session, so the very next
    // request (the credit-card charge) arrives with no user and dies on the
    // "Não autenticado" guard. Pix never mounts the card form, so it never hit
    // this. API routes refresh their own session inside the route handler.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
