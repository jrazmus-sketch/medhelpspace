"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Hourglass, RotateCcw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudyTypeFromPathname } from "@/lib/page-type";
import { MobileEstudarSheet } from "@/components/layout/mobile-estudar-sheet";

// Bottom nav is a quick-action surface. Início + Plano are core destinations;
// "Estudar" opens a bottom sheet of the six content types (the mobile twin of
// the desktop dropdown); MedHelp 60D takes the far-right slot once unlocked.
// Search, notifications, theme, and profile/settings all live in the top
// header (visible on mobile too), so none of them are duplicated here.
function NavCell({
  href, label, Icon, active,
}: { href: string; label: string; Icon: LucideIcon; active: boolean }) {
  return (
    <Link
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
}

export function MobileNav({ show60d = false }: { show60d?: boolean } = {}) {
  const pathname = usePathname();
  const currentType = getStudyTypeFromPathname(pathname);

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
        <NavCell href="/app" label="Início" Icon={Home} active={pathname === "/app"} />
        <NavCell href="/app/plano" label="Plano" Icon={Calendar} active={pathname.startsWith("/app/plano")} />
        <NavCell href="/app/revisao" label="Revisão" Icon={RotateCcw} active={pathname.startsWith("/app/revisao")} />
        <MobileEstudarSheet currentType={currentType} />
        {show60d && (
          <NavCell
            href="/app/medhelp-60d"
            label="60D"
            Icon={Hourglass}
            active={pathname.startsWith("/app/medhelp-60d")}
          />
        )}
      </div>
    </nav>
  );
}
