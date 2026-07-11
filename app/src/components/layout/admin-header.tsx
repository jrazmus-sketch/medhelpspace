"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AdminBell } from "@/components/layout/admin-bell";
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
import { Globe, LogOut, ExternalLink, ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { USE_MOCK_DATA } from "@/lib/mock-data";

type NavLeaf = { href: string; label: string; exact?: boolean; show?: boolean };
type NavGroup = { id: string; label: string; items: NavLeaf[] };

export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { profile, isSuperAdmin, isContentAdmin, isSupportAdmin, isBillingAdmin } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll + wire Escape while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);

  // Dashboard stays a top-level link; everything else is grouped by domain.
  // Role gates preserve exactly who could see each section before the regroup.
  const dashboard: NavLeaf = { href: "/admin", label: t("nav.dashboard"), exact: true };
  const groups: NavGroup[] = [
    {
      id: "content",
      label: t("nav.group.content"),
      items: [
        { href: "/admin/pages", label: t("nav.pages") },
        { href: "/admin/hubs", label: t("nav.hubs") },
        { href: "/admin/notifications", label: t("nav.notifications") },
        { href: "/admin/email-templates", label: t("nav.emailTemplates"), show: isContentAdmin() },
        { href: "/admin/estudio", label: t("nav.studio"), show: isSuperAdmin() || isContentAdmin() },
        { href: "/admin/simulado-100", label: t("nav.simuladoReview"), show: isSuperAdmin() || isContentAdmin() },
      ],
    },
    {
      id: "people",
      label: t("nav.group.people"),
      items: [
        { href: "/admin/members", label: t("nav.members") },
        { href: "/admin/suporte", label: t("nav.support"), show: isSupportAdmin() || isBillingAdmin() },
      ],
    },
    {
      id: "commerce",
      label: t("nav.group.commerce"),
      items: [
        { href: "/admin/leads", label: t("nav.leads"), show: isSuperAdmin() || isBillingAdmin() },
        { href: "/admin/cohorts", label: t("nav.cohorts") },
        { href: "/admin/billing", label: t("nav.billing"), show: isSuperAdmin() || isBillingAdmin() },
        { href: "/admin/notas-fiscais", label: t("nav.notasFiscais"), show: isSuperAdmin() || isBillingAdmin() },
        { href: "/admin/coupons", label: t("nav.coupons"), show: isSuperAdmin() || isBillingAdmin() },
      ],
    },
    {
      id: "system",
      label: t("nav.group.system"),
      items: [
        { href: "/admin/audit-log", label: t("nav.auditLog"), show: isSuperAdmin() },
        { href: "/admin/settings", label: t("nav.settings") },
      ],
    },
  ];

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show !== false) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-surface-1">
        <div className="flex h-13 items-center gap-2 px-4 sm:px-6 lg:gap-4">
          {/* Hamburger — below the desktop nav breakpoint */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t("nav.menu")}
            className="-ml-1.5 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/admin" className="flex shrink-0 items-center gap-2 font-bold text-brand">
            <span>MedHelp</span>
            <Badge variant="secondary" className="text-[10px]">
              Admin
            </Badge>
          </Link>

          {/* Desktop grouped nav */}
          <nav className="hidden items-center gap-0.5 lg:flex">
            <Link
              href={dashboard.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(dashboard.href, true)
                  ? "bg-brand/10 text-brand"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {dashboard.label}
            </Link>

            {visibleGroups.map((group) => {
              const groupActive = group.items.some((i) => isActive(i.href, i.exact));
              return (
                <DropdownMenu key={group.id}>
                  <DropdownMenuTrigger
                    className={cn(
                      "group inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors",
                      groupActive
                        ? "bg-brand/10 text-brand"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {group.label}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150 group-data-[popup-open]:rotate-180" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    {group.items.map((item) => {
                      const active = isActive(item.href, item.exact);
                      return (
                        <DropdownMenuItem
                          key={item.href}
                          onClick={() => router.push(item.href)}
                          className={cn("cursor-pointer", active && "font-medium text-brand")}
                        >
                          <span className="flex w-1.5 justify-center">
                            {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                          </span>
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              href="/app"
              className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("adminBar.viewSite")}
            </Link>
            {/* Language toggle — desktop; mirrored in the mobile drawer */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLocale}
              className="hidden gap-1.5 text-muted-foreground lg:inline-flex"
              title="Toggle language"
            >
              <Globe className="h-4 w-4" />
              <span className="text-xs font-medium">
                {i18n.language === "pt-BR" ? "EN" : "PT"}
              </span>
            </Button>

            <span className="hidden lg:inline-flex">
              <ThemeToggle />
            </span>

            <AdminBell />

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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <div
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 animate-in fade-in bg-black/50"
          />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] animate-in slide-in-from-left flex-col bg-surface-1 shadow-2xl duration-200">
            <div className="flex h-13 shrink-0 items-center justify-between border-b border-border px-4">
              <Link href="/admin" className="flex items-center gap-2 font-bold text-brand">
                <span>MedHelp</span>
                <Badge variant="secondary" className="text-[10px]">
                  Admin
                </Badge>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t("common.close")}
                className="-mr-1.5 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <MobileLink
                href={dashboard.href}
                label={dashboard.label}
                active={isActive(dashboard.href, true)}
                onNavigate={() => setMobileOpen(false)}
              />

              {visibleGroups.map((group) => (
                <div key={group.id} className="mt-5">
                  <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <MobileLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={isActive(item.href, item.exact)}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  ))}
                </div>
              ))}
            </nav>

            <div className="shrink-0 space-y-1 border-t border-border p-3">
              <Link
                href="/app"
                onClick={() => setMobileOpen(false)}
                className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
                {t("adminBar.viewSite")}
              </Link>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={toggleLocale}
                  className="flex min-h-11 flex-1 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Globe className="h-4 w-4" />
                  {i18n.language === "pt-BR" ? "English" : "Português"}
                </button>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MobileLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm transition-colors",
        active
          ? "bg-brand/10 font-medium text-brand"
          : "text-foreground hover:bg-accent",
      )}
    >
      <span className="flex w-1.5 justify-center">
        {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
      </span>
      {label}
    </Link>
  );
}
