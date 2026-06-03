"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Crumb } from "@/lib/breadcrumbs";

const SEGMENT_LABELS: Record<string, string> = {
  app: "Início",
  admin: "Admin",
  "estudo-por-questoes": "Estudo por Questões",
  "questoes-revalida": "Questões Revalida",
  simulados: "Simulados",
  "formula-medhelp": "Fórmula MedHelp",
  flashcards: "Flashcards",
  audiocards: "Audiocards",
  medvoice: "MedVoice",
  "medhelp-60d": "MedHelp 60D",
  perfil: "Meu Perfil",
  configuracoes: "Configurações",
};

function labelFor(segment: string) {
  return (
    SEGMENT_LABELS[segment] ??
    segment
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export function Breadcrumbs({
  className,
  crumbs,
}: {
  className?: string;
  crumbs?: Crumb[];
}) {
  if (crumbs && crumbs.length > 0) {
    return <CrumbsBar className={className} crumbs={crumbs} />;
  }
  return <UrlDerivedCrumbs className={className} />;
}

function CrumbsBar({ className, crumbs }: { className?: string; crumbs: Crumb[] }) {
  const home = crumbs[0];
  const rest = crumbs.slice(1);
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1 text-sm text-muted-foreground", className)}
    >
      <Link href={home.href ?? "/"} className="hover:text-foreground" aria-label={home.label}>
        <Home className="h-3.5 w-3.5" />
      </Link>
      {rest.map((c, i) => {
        const isLast = i === rest.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
            {isLast || !c.href ? (
              <span className="font-medium text-foreground" aria-current={isLast ? "page" : undefined}>
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="hover:text-foreground">
                {c.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function UrlDerivedCrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  const built = segments.map((segment, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    return { segment, href, isLast };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1 text-sm text-muted-foreground", className)}
    >
      <Link href="/" className="hover:text-foreground" aria-label="Início">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {built.map(({ segment, href, isLast }) => (
        <span key={href} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
          {isLast ? (
            <span className="font-medium text-foreground" aria-current="page">
              {labelFor(segment)}
            </span>
          ) : (
            <Link href={href} className="hover:text-foreground">
              {labelFor(segment)}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
