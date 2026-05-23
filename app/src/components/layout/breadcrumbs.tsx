"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  const crumbs = segments.map((segment, i) => {
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
      {crumbs.map(({ segment, href, isLast }) => (
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
