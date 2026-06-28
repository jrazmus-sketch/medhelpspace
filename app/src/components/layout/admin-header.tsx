"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Globe, LogOut, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { USE_MOCK_DATA } from "@/lib/mock-data";

export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { profile, isSuperAdmin, isContentAdmin, isBillingAdmin } = useAuth();

  const displayName = profile?.display_name ?? "A";
  const initial = displayName.charAt(0).toUpperCase();

  const toggleLocale = async () => {
    const next = i18n.language === "pt-BR" ? "en" : "pt-BR";
    i18n.changeLanguage(next);
    if (!USE_MOCK_DATA) {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_locale: next }),
      });
    }
  };

  function handleSignOut() {
    router.push("/auth/signout");
  }

  const navItems = [
    { href: "/admin", label: t("nav.dashboard"), exact: true },
    { href: "/admin/pages", label: t("nav.pages") },
    { href: "/admin/hubs", label: t("nav.hubs") },
    { href: "/admin/notifications", label: t("nav.notifications") },
    ...(isContentAdmin() ? [{ href: "/admin/email-templates", label: t("nav.emailTemplates") }] : []),
    { href: "/admin/members", label: t("nav.members") },
    { href: "/admin/cohorts", label: t("nav.cohorts") },
    ...(isSuperAdmin() || isBillingAdmin() ? [{ href: "/admin/billing", label: t("nav.billing") }] : []),
    ...(isSuperAdmin() || isBillingAdmin() ? [{ href: "/admin/notas-fiscais", label: t("nav.notasFiscais") }] : []),
    ...(isSuperAdmin() || isBillingAdmin() ? [{ href: "/admin/coupons", label: t("nav.coupons") }] : []),
    ...(isSuperAdmin() ? [{ href: "/admin/audit-log", label: t("nav.auditLog") }] : []),
    { href: "/admin/settings", label: t("nav.settings") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface-1">
      <div className="flex h-13 items-center gap-4 px-6">
        <Link href="/admin" className="flex items-center gap-2 font-bold text-brand">
          <span>MedHelp</span>
          <Badge variant="secondary" className="text-[10px]">
            Admin
          </Badge>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/app"
            className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:flex"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("adminBar.viewSite")}
          </Link>
          {/* Language toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLocale}
            className="gap-1.5 text-muted-foreground"
            title="Toggle language"
          >
            <Globe className="h-4 w-4" />
            <span className="text-xs font-medium">
              {i18n.language === "pt-BR" ? "EN" : "PT"}
            </span>
          </Button>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-8 w-8 rounded-full outline-none"
              aria-label="Menu admin"
            >
              <Avatar className="h-8 w-8 border border-brand/30">
                <AvatarFallback className="bg-brand/10 text-xs font-semibold text-brand">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div className="text-xs text-muted-foreground">{profile?.role ?? "member"}</div>
                  <div className="text-sm font-medium">{displayName}</div>
                </DropdownMenuLabel>
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
    </header>
  );
}
