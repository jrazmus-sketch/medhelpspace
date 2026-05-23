"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

// Bottom nav is a quick-action surface, not a category browser. Content types
// live on the dashboard (Início) and in the desktop top nav. Notifications and
// theme remain in the top header (visible on mobile too).
const NAV_ITEMS = [
  { href: "/app",        label: "Início", Icon: Home,     exact: true },
  { href: "/app/plano",  label: "Plano",  Icon: Calendar              },
  { href: "/app/buscar", label: "Buscar", Icon: Search                },
  { href: "/app/perfil", label: "Perfil", Icon: User                  },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: "var(--background)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex h-14 items-stretch">
        {NAV_ITEMS.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-[3px] transition-colors",
                active ? "text-brand" : "text-muted-foreground",
              )}
            >
              <Icon size={19} strokeWidth={active ? 2 : 1.6} />
              <span style={{ fontSize: 9.5, fontWeight: active ? 600 : 400, letterSpacing: ".03em" }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
