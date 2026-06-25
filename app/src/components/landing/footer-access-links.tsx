"use client";

import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";

// The footer's "Acesso" links, made auth-aware. A logged-in visitor must not be
// shown "Entrar na plataforma" (→ /login), which redirects authenticated users
// away and dead-ends non-members on /loja. Mirror the nav: logged-in users get
// "Meu painel" + "Sair" instead. Kept as a tiny client island so the footer
// itself stays a server component.
export function FooterAccessLinks() {
  const { user, loading } = useAuth();
  const loggedIn = !loading && !!user;

  if (loggedIn) {
    return (
      <ul className="space-y-2.5 text-sm">
        <li>
          <Link href="/app" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>
            Meu painel
          </Link>
        </li>
        <li>
          {/* Full navigation — /auth/signout is a route handler, not a page. */}
          <a href="/auth/signout" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>
            Sair
          </a>
        </li>
      </ul>
    );
  }

  return (
    <ul className="space-y-2.5 text-sm">
      <li>
        <Link href="/login" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>
          Entrar na plataforma
        </Link>
      </li>
      <li>
        <Link href="/signup" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>
          Criar conta
        </Link>
      </li>
    </ul>
  );
}
