"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";

export function LandingNav({ embedded = false }: { embedded?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  // Auth state is read client-side (getSession reads the cookie locally) so these
  // ISR-cached public pages stay static. A logged-in visitor must never be shown a
  // plain "Entrar" link: /login redirects authenticated users to /app, and a
  // non-member is then bounced to /loja — i.e. clicking "Entrar" silently dead-ends.
  // Show "Sair" + "Meu painel" instead so they can always reach their account or log out.
  const { user, loading } = useAuth();
  const loggedIn = !loading && !!user;

  useEffect(() => {
    if (embedded) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [embedded]);

  // `solid` = readable foreground palette + opaque background.
  // Embedded nav sits in normal flow (e.g. below the announcement bar on
  // /loja and /checkout) over the page background, so it's always solid.
  const solid = embedded || scrolled;

  return (
    <header
      className={
        embedded
          ? "relative z-40"
          : "fixed inset-x-0 top-0 z-50 transition-all duration-300"
      }
      style={{
        background: solid ? "color-mix(in srgb, var(--lp-base) 90%, transparent)" : "transparent",
        backdropFilter: solid ? "blur(20px)" : "none",
        borderBottom: solid ? "1px solid var(--lp-border)" : "none",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <Link
          href="/"
          className="text-lg font-extrabold tracking-tight"
          style={{ fontFamily: "var(--font-bricolage)", color: solid ? "var(--lp-fg)" : "#ffffff" }}
        >
          MedHelp<span style={{ color: "var(--brand)" }}>Space</span>
        </Link>

        <div className="flex items-center gap-4">
          {loggedIn ? (
            <>
              {/* Full navigation (not Next <Link>) — /auth/signout is a route handler
                  that clears the session and 307s to /login. Visible on every
                  breakpoint so the logout escape hatch also works on mobile. */}
              <a
                href="/auth/signout"
                className="text-sm font-medium transition-colors"
                style={{ color: solid ? "var(--lp-fg-40)" : "rgba(255,255,255,0.55)" }}
              >
                Sair
              </a>

              <Link
                href="/app"
                className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-all hover:opacity-85 active:scale-95"
                style={{ background: "var(--brand)" }}
              >
                Meu painel
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm font-medium transition-colors sm:block"
                style={{ color: solid ? "var(--lp-fg-40)" : "rgba(255,255,255,0.55)" }}
              >
                Entrar
              </Link>

              <Link
                href="/loja"
                className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-all hover:opacity-85 active:scale-95"
                style={{ background: "var(--brand)" }}
              >
                Comprar Agora
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
