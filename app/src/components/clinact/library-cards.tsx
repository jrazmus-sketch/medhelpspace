import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FORMAT_BLURBS, FORMAT_LABELS, FORMAT_SKILL, SKILL_LABELS, type CaseFormat } from "@/lib/clinact/types";

/** "3 casos" / "1 caso" — never "1 casos". */
export function caseCount(n: number): string {
  return `${n} ${n === 1 ? "caso" : "casos"}`;
}

/**
 * A format card — the "how do I want to train today?" door. The verb is the
 * point of the format, so it leads (Karina, 2026-09-02: "Código Clínico —
 * CONECTAR"). Used both on the library home and inside a specialty.
 */
export function FormatCard({ format, href, count }: { format: CaseFormat; href: string; count: number }) {
  const empty = count === 0;
  return (
    <Link
      href={href}
      aria-disabled={empty || undefined}
      className={`flex min-h-24 flex-col justify-between rounded-xl border border-border bg-surface-1 p-4 transition-colors ${
        empty ? "pointer-events-none opacity-50" : "hover:bg-accent/50"
      }`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">{SKILL_LABELS[FORMAT_SKILL[format]]}</p>
        <p className="mt-0.5 font-semibold leading-snug">{FORMAT_LABELS[format]}</p>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{FORMAT_BLURBS[format]}</p>
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {empty ? "Em breve" : caseCount(count)}
        {empty ? null : <ChevronRight className="h-3 w-3" />}
      </p>
    </Link>
  );
}

/**
 * A specialty card — the "what do I want to train?" door, following the
 * Revalida "Estude por especialidade" grid she asked us to reuse. Only
 * specialties that actually have published cases are listed, so no card ever
 * leads to an empty shelf.
 */
export function SpecialtyCard({ name, href, count }: { name: string; href: string; count: number }) {
  return (
    <Link
      href={href}
      className="flex min-h-20 flex-col justify-between rounded-xl border border-border bg-surface-1 p-4 transition-colors hover:bg-accent/50"
    >
      <p className="font-semibold leading-snug">{name}</p>
      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-brand">
        {caseCount(count)} <ChevronRight className="h-3 w-3" />
      </p>
    </Link>
  );
}

/** Where the reader is, and the way back — both doors produce a path. */
export function Trail({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Você está em" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden /> : null}
          {item.href ? (
            <Link href={item.href} className="inline-flex min-h-11 items-center hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
