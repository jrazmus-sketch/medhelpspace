"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, ClipboardList, Mic, ScrollText, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app",                  label: "Início",   Icon: Home,          exact: true },
  { href: "/app/plano",            label: "Plano",    Icon: Calendar                   },
  { href: "/app/estudo-por-questoes", label: "Questões", Icon: ClipboardList           },
  { href: "/app/medvoice",         label: "MedVoice", Icon: Mic                        },
  { href: "/app/resumos",          label: "Resumos",  Icon: ScrollText                 },
  { href: "/app/formula-medhelp",  label: "Fórmula",  Icon: FlaskConical               },
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
