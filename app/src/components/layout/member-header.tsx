"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, User, Shield, Sun, Moon, Monitor, Search, Calendar, Hourglass, ChevronDown, Compass, LifeBuoy } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useTheme } from "@/components/theme/theme-provider";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SiteProgressPill, SiteProgressLine } from "@/components/layout/site-progress";
import type { SiteCompletion } from "@/lib/progress/site-completion";
import { useAuth } from "@/providers/auth-provider";
import {
  STUDY_TYPE_CONFIG,
  getStudyTypeFromPathname,
  type StudyTypeKey,
} from "@/lib/page-type";
import { ESTUDAR_GROUPS, ESTUDAR_NAV_OVERRIDES, isTypeActive } from "@/lib/estudar-nav";

type PersonalLink = { href: string; label: string; exact?: boolean; highlight?: boolean };

const PERSONAL_LINKS: PersonalLink[] = [
  { href: "/app",         label: "Início",    exact: true     },
  { href: "/app/plano",   label: "Meu Plano", highlight: true },
  { href: "/app/revisao", label: "Revisão"                    },
];

function renderPersonalLink(link: PersonalLink, pathname: string, badgeCount = 0) {
  const { href, label, exact, highlight } = link;
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      key={href}
      href={href}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13.5px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : highlight
            ? "text-brand hover:bg-brand/10"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {highlight && <Calendar className="h-3.5 w-3.5" />}
      {label}
      {badgeCount > 0 && (
        <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold tabular-nums text-brand-fg">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </Link>
  );
}

function EstudarMenu({
  pathname,
  currentType,
}: {
  pathname: string;
  currentType: StudyTypeKey | null;
}) {
  const router = useRouter();
  // "In a content section" — the trigger reflects that section's accent color.
  const active = currentType != null;
  const activeColor = currentType ? STUDY_TYPE_CONFIG[currentType].color : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex items-center gap-1 rounded-md px-3 py-1.5 text-[13.5px] font-medium outline-none transition-colors",
          active
            ? "bg-accent font-semibold"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        style={active ? { color: activeColor } : undefined}
      >
        Estudar
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={6} className="w-72 p-1.5">
        {ESTUDAR_GROUPS.map((group, gi) => (
          <DropdownMenuGroup key={group.label}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.keys.map((key) => {
              const cfg = STUDY_TYPE_CONFIG[key];
              const ov = ESTUDAR_NAV_OVERRIDES[key];
              const itemActive = isTypeActive(key, currentType);
              return (
                <DropdownMenuItem
                  key={key}
                  onClick={() => router.push(cfg.hubHref!)}
                  className="cursor-pointer items-start gap-2.5 px-2 py-2"
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{
                      background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
                      color: cfg.color,
                    }}
                  >
                    <cfg.Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight text-foreground">
                      {ov?.label ?? cfg.label}
                      {itemActive && (
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: cfg.color }}
                        />
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                      {ov?.desc ?? cfg.desc}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MemberHeader({
  bellSlot,
  show60d = false,
  reviewDueCount = 0,
  completion = null,
}: {
  bellSlot?: React.ReactNode;
  show60d?: boolean;
  reviewDueCount?: number;
  completion?: SiteCompletion | null;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, isAnyAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const currentType = getStudyTypeFromPathname(pathname);

  async function handleTheme(value: "light" | "dark" | "system") {
    setTheme(value);
    if (!USE_MOCK_DATA && profile) {
      const supabase = createClient();
      await supabase.from("profiles").update({ theme_preference: value }).eq("id", profile.id);
    }
  }

  const displayName = profile?.display_name ?? profile?.email ?? "M";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function handleSignOut() {
    router.push("/auth/signout");
  }

  // Narrow inline at each use site so TS keeps `completion` non-null for the props.
  const showProgress = !!completion && completion.total > 0;

  return (
    <header className="relative border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-[52px] max-w-[1400px] items-center gap-3 px-[10px] md:px-8">

        {/* Logo */}
        <Link href="/app" className="mr-3 flex items-center gap-2.5 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-brand text-brand-fg text-[13px] font-bold tracking-tight">
            M
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            MedHelp <span className="text-muted-foreground font-normal">· Space</span>
          </span>
        </Link>

        {/* Nav — desktop only. Tablet-portrait + phones use the bottom MobileNav;
            the horizontal nav needs ~lg width to fit logo + items + icons + pill. */}
        <nav className="hidden items-center lg:flex">
          {/* Personal cluster (Início, Meu Plano, + MedHelp 60D once unlocked) */}
          <div className="flex items-center gap-0.5">
            {PERSONAL_LINKS.map((link) =>
              renderPersonalLink(link, pathname, link.href === "/app/revisao" ? reviewDueCount : 0),
            )}
            {show60d && (
              <Link
                href="/app/medhelp-60d"
                aria-current={pathname.startsWith("/app/medhelp-60d") ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13.5px] font-semibold transition-colors",
                  pathname.startsWith("/app/medhelp-60d")
                    ? "bg-foreground text-background"
                    : "bg-brand/10 text-brand hover:bg-brand/15",
                )}
              >
                <Hourglass className="h-3.5 w-3.5" />
                MedHelp 60D
              </Link>
            )}
          </div>

          {/* Divider between personal and content */}
          <span aria-hidden="true" className="mx-3 h-5 w-px bg-border" />

          {/* Content cluster — six study types collapsed into one menu */}
          <EstudarMenu pathname={pathname} currentType={currentType} />
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {showProgress && completion && <SiteProgressPill data={completion} />}

          <Link
            href="/app/buscar"
            aria-label="Buscar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Search className="h-4 w-4" />
          </Link>

          {bellSlot}

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-8 w-8 rounded-[5px] outline-none"
              aria-label="Menu do usuário"
            >
              <Avatar className="h-8 w-8 rounded-[5px] border border-brand/20">
                <AvatarFallback className="rounded-[5px] bg-brand text-brand-fg text-[13px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-52" align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{profile?.display_name ?? "Usuário"}</span>
                    <span className="text-xs font-normal text-muted-foreground">{profile?.email}</span>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => router.push("/app/plano")}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Meu Plano de Estudos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/perfil")}>
                  <User className="mr-2 h-4 w-4" />
                  Meu perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/configuracoes")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/comecar")}>
                  <Compass className="mr-2 h-4 w-4" />
                  Comece por aqui
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/suporte")}>
                  <LifeBuoy className="mr-2 h-4 w-4" />
                  Suporte
                </DropdownMenuItem>
              </DropdownMenuGroup>

              {isAnyAdmin() && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/admin")}>
                    <Shield className="mr-2 h-4 w-4" />
                    Painel admin
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Tema</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleTheme("light")} className={theme === "light" ? "text-brand" : ""}>
                  <Sun className="mr-2 h-4 w-4" />
                  Claro
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleTheme("dark")} className={theme === "dark" ? "text-brand" : ""}>
                  <Moon className="mr-2 h-4 w-4" />
                  Escuro
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleTheme("system")} className={theme === "system" ? "text-brand" : ""}>
                  <Monitor className="mr-2 h-4 w-4" />
                  Sistema
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Site-wide completion meter — draws across the full header edge on load. */}
      {showProgress && completion && <SiteProgressLine pct={completion.overallPct} />}
    </header>
  );
}
