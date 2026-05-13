"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

function SimpleThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Alternar tema"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-[1.1rem] w-[1.1rem]" />
      ) : (
        <Moon className="h-[1.1rem] w-[1.1rem]" />
      )}
    </button>
  );
}

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled ? "lp-nav-scrolled" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          MedHelp<span className="text-brand">Space</span>
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <SimpleThemeToggle />
          <Link
            href="/login"
            className="hidden rounded-lg px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground sm:block"
          >
            Entrar
          </Link>
          <Link
            href="/loja"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand/85 active:scale-95"
          >
            Comprar Agora
          </Link>
        </div>
      </div>
    </header>
  );
}
