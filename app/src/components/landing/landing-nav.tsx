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
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
        {/* Logo + "Revalida" lockup. The course exists for one exam, so the word
            is part of the wordmark: same geometric face (Bricolage, extrabold) as
            the logo, set off by a hairline divider and a purple→fuchsia gradient
            fill so it draws the eye while reading as brand identity, not a tag.
            Slightly larger than the logo on desktop; matched size on mobile so the
            whole lockup + auth controls fit a 360px bar. */}
        <Link
          href="/"
          aria-label="MedHelpSpace Revalida — início"
          className="group flex items-center gap-1.5 sm:gap-2.5"
        >
          <span
            className="text-sm font-extrabold tracking-tight sm:text-lg"
            style={{ fontFamily: "var(--font-bricolage)", color: solid ? "var(--lp-fg)" : "#ffffff" }}
          >
            MedHelp<span style={{ color: "var(--brand)" }}>Space</span>
          </span>
          <span
            aria-hidden="true"
            className="h-3.5 w-px shrink-0 sm:h-5"
            style={{ background: solid ? "var(--lp-border)" : "rgba(255,255,255,0.20)" }}
          />
          <span
            className="text-sm font-extrabold leading-none tracking-tight transition-[filter] duration-300 group-hover:[filter:drop-shadow(0_0_18px_rgba(217,70,239,0.55))] sm:text-xl"
            style={{
              fontFamily: "var(--font-bricolage)",
              backgroundImage: "linear-gradient(120deg, #a855f7 0%, #e879f9 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
              filter: "drop-shadow(0 0 12px rgba(217,70,239,0.30))",
            }}
          >
            Revalida
          </span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
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
                Área do aluno
              </Link>
            </>
          ) : (
            <>
              {/* Visible on every breakpoint — a not-logged-in visitor on mobile
                  must always have a way in. To keep "Entrar" + the CTA inside a
                  ~360px bar, the CTA label collapses to "Comprar" below `sm`. */}
              <Link
                href="/login"
                className="-my-3 py-3 text-sm font-medium transition-colors"
                style={{ color: solid ? "var(--lp-fg-40)" : "rgba(255,255,255,0.55)" }}
              >
                Entrar
              </Link>

              <Link
                href="/loja"
                className="rounded-lg px-3.5 py-2 text-sm font-bold text-white transition-all hover:opacity-85 active:scale-95 sm:px-4"
                style={{ background: "var(--brand)" }}
              >
                <span className="sm:hidden">Comprar</span>
                <span className="hidden sm:inline">Comprar Agora</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
