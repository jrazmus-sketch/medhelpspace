import Link from "next/link";
import { SCENARIOS, type Scenario } from "@/lib/clinact/scenarios";
import { cn } from "@/lib/utils";

/**
 * The six clinical scenarios as compact chips (Karina 2026-10-13: no second
 * big grid — "botões/chips compactos").
 *
 * A scenario with NO case for the current combination stays in the row, faded
 * and without a link, instead of disappearing: the row is always the same six
 * and a student is never sent to an empty list. `allHref` adds the "Todos"
 * chip that clears the scenario (the listing's filter row).
 */
export function ScenarioChips({
  counts,
  active = null,
  hrefFor,
  allHref,
  label,
}: {
  counts: Record<Scenario, number>;
  active?: Scenario | null;
  hrefFor: (slug: Scenario) => string;
  allHref?: string;
  /** Visible label before the chips ("Cenário:"); omit when a heading already says it. */
  label?: string;
}) {
  const chip = "inline-flex min-h-11 items-center rounded-full px-4 text-xs font-medium";
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label ?? "Cenário clínico"}>
      {label ? <span className="mr-1 text-xs font-semibold text-muted-foreground">{label}</span> : null}
      {allHref ? (
        active ? (
          <Link href={allHref} className={cn(chip, "border border-border hover:bg-accent/50")}>
            Todos
          </Link>
        ) : (
          <span className={cn(chip, "bg-brand text-brand-fg")} aria-current="true">
            Todos
          </span>
        )
      ) : null}
      {SCENARIOS.map((s) => {
        const n = counts[s.slug] ?? 0;
        if (s.slug === active) {
          return (
            <span key={s.slug} className={cn(chip, "bg-brand text-brand-fg")} aria-current="true" title={s.label}>
              {s.short}
            </span>
          );
        }
        if (n === 0) {
          return (
            <span
              key={s.slug}
              aria-disabled
              title={`${s.label} — nenhum caso por aqui ainda`}
              className={cn(chip, "cursor-default border border-dashed border-border text-muted-foreground opacity-55")}
            >
              {s.short}
            </span>
          );
        }
        return (
          <Link key={s.slug} href={hrefFor(s.slug)} title={s.label} className={cn(chip, "border border-border hover:bg-accent/50")}>
            {s.short}
          </Link>
        );
      })}
    </div>
  );
}
