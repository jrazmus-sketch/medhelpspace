"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, ChevronDown, LayoutDashboard, Eye, Check, X } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { setViewAs } from "@/actions/admin";
import { cn } from "@/lib/utils";
import type { ViewAsMode } from "@/lib/viewas";
import type { CohortOption } from "./admin-bar-server";

const STORAGE_KEY = "mhs-admin-bar-collapsed";

type Props = {
  viewas: ViewAsMode;
  cohorts: CohortOption[];
};

function formatCohortName(slug: string, cohorts: CohortOption[]): string {
  const match = cohorts.find((c) => c.slug === slug);
  return (match?.name ?? slug)
    .replace(/revalida-/i, "Turma ")
    .replace(/-(\d+)$/, "·$1");
}

function ViewAsOption({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent"
    >
      <Check className={cn("h-3.5 w-3.5 shrink-0 text-brand", !active && "invisible")} />
      <div>
        <div className={cn("text-sm", active ? "font-semibold text-foreground" : "text-foreground/80")}>
          {label}
        </div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
    </button>
  );
}

export function AdminBar({ viewas, cohorts }: Props) {
  // Capture before TypeScript narrows the type via early-return guards below
  const currentMode: ViewAsMode = viewas;

  const { profile, isAnyAdmin } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // localStorage unavailable
    }
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {}
  }

  function handleSetViewAs(mode: string) {
    setOpen(false);
    startTransition(async () => {
      await setViewAs(mode);
      router.refresh();
    });
  }

  if (!mounted || !profile || !isAnyAdmin()) return null;

  // ── Non-admin mode: amber indicator bar ─────────────────────────────────────

  if (viewas.type !== "admin") {
    const label =
      viewas.type === "unlocked"
        ? "Tudo liberado"
        : `Como membro · ${formatCohortName(viewas.slug, cohorts)}`;

    return (
      <div className="flex h-8 items-center gap-3 bg-amber-500 px-3 md:px-6">
        <Eye className="h-3.5 w-3.5 shrink-0 text-white/80" />
        <span className="truncate text-xs font-semibold text-white">
          Visualizando como: {label}
        </span>
        <button
          type="button"
          onClick={() => handleSetViewAs("admin")}
          disabled={pending}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold text-white/90 transition-colors hover:bg-white/20 disabled:opacity-60"
        >
          <X className="h-3 w-3" />
          Sair
        </button>
      </div>
    );
  }

  // ── Collapsed state ──────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Mostrar barra de admin"
        className="flex w-full items-center justify-center gap-1.5 bg-brand py-0.5 text-[10px] font-medium text-brand-fg/70 transition-colors hover:text-brand-fg"
      >
        <Shield className="h-2.5 w-2.5" />
        <span>admin</span>
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
    );
  }

  // ── Normal admin bar ─────────────────────────────────────────────────────────

  const roleLabel = profile.role.replace(/_/g, " ");

  return (
    <div className="relative flex h-8 items-center gap-3 bg-brand px-3 md:px-6">
      <Shield className="h-3.5 w-3.5 shrink-0 text-brand-fg/80" />

      <span className="hidden rounded bg-brand-fg/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-fg/90 md:inline">
        {roleLabel}
      </span>

      <span className="truncate text-xs font-medium text-brand-fg/90 md:text-[13px]">
        {profile.display_name ?? profile.email}
      </span>

      <div className="ml-auto flex items-center gap-1 md:gap-2">

        {/* View As dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={pending}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-brand-fg/80 transition-colors hover:bg-brand-fg/15 disabled:opacity-60"
          >
            <Eye className="h-3 w-3" />
            <span className="hidden sm:inline">Ver como</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </button>

          {open && (
            <>
              {/* Click-outside overlay */}
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

              <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[220px] overflow-hidden rounded-lg border border-border bg-background shadow-lg">

                <ViewAsOption
                  label="Admin (você)"
                  description="Acesso real da sua conta"
                  active={currentMode.type === "admin"}
                  onClick={() => handleSetViewAs("admin")}
                />
                <ViewAsOption
                  label="Tudo liberado"
                  description="Ignora datas e restrições"
                  active={currentMode.type === "unlocked"}
                  onClick={() => handleSetViewAs("unlocked")}
                />

                {cohorts.length > 0 && (
                  <>
                    <div className="mx-3 my-1 h-px bg-border" />
                    <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Como membro
                    </div>
                    {cohorts.map((c) => (
                      <ViewAsOption
                        key={c.id}
                        label={formatCohortName(c.slug, cohorts)}
                        active={currentMode.type === "cohort" && currentMode.slug === c.slug}
                        onClick={() => handleSetViewAs(`cohort:${c.slug}`)}
                      />
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <Link
          href="/admin"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-fg/15"
        >
          <LayoutDashboard className="h-3 w-3" />
          <span className="hidden md:inline">Painel Admin</span>
          <span className="md:hidden">Admin</span>
        </Link>

        <button
          type="button"
          onClick={toggle}
          aria-label="Minimizar barra de admin"
          className="rounded p-1 text-brand-fg/60 transition-colors hover:bg-brand-fg/15 hover:text-brand-fg"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
        </button>
      </div>
    </div>
  );
}
