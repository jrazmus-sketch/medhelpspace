"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(3,3,3,0.88)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="text-lg font-extrabold tracking-tight text-white"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          MedHelp<span style={{ color: "var(--brand)" }}>Space</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <button
            aria-label="Alternar tema"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-colors hover:text-white/70"
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <Link
            href="/login"
            className="hidden text-sm font-medium text-white/45 transition-colors hover:text-white sm:block"
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
        </div>
      </div>
    </header>
  );
}
