"use client";

import { useState } from "react";
import { SpecialtyIcon } from "@/components/content/specialty-icon";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { EditableText } from "@/components/admin/editable-text";

export type SuperGroupData = {
  label: string;
  iconSlug: string;
  items: {
    spec: { id: number; slug: string; name: string };
    href: string;
    progress?: number; // 0-100; rendered as a progress bar on the specialty card
  }[];
  /** When set, the group header label becomes inline-editable in admin edit
   *  mode (writes to `table`.`field` for row `id`). Omit for derived/static
   *  labels (e.g. specialty groups, "Outros"). */
  editable?: { table: "simulado_sections"; id: number; field: string };
};

export function TrackHubAccordion({
  groups,
  ctaLabel = "Ouvir",
  accentColor,
}: {
  groups: SuperGroupData[];
  ctaLabel?: string;
  /** Optional CSS color (or var) for a left-edge stripe on each row.
   *  Used by /app/estudo-por-questoes to echo the active tab's color. */
  accentColor?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(label: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {groups.map((group) => {
        const isOpen = open.has(group.label);
        const count = group.items.length;
        return (
          <div
            key={group.label}
            style={{
              position: "relative",
              borderRadius: "var(--radius)",
              // When an accent stripe is shown, use inset box-shadow for the
              // border so the stripe paints above it. (Outline paints last and
              // would visually clip the leftmost pixel of the stripe.)
              outline: accentColor ? "none" : "1px solid var(--surface-2)",
              outlineOffset: accentColor ? undefined : "-1px",
              boxShadow: accentColor ? "inset 0 0 0 1px var(--surface-2)" : undefined,
              overflow: "hidden",
            }}
          >
            {accentColor && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0, top: 0, bottom: 0,
                  width: 4,
                  background: accentColor,
                  transition: "background .25s ease",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              />
            )}
            {/* Header row */}
            <button
              onClick={() => toggle(group.label)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                background: isOpen ? "var(--surface-2)" : "var(--surface-1)",
                border: "none",
                cursor: "pointer",
                transition: "background .15s",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SpecialtyIcon specialtySlug={group.iconSlug} size={22} />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--foreground)",
                  }}
                >
                  {group.editable ? (
                    <EditableText
                      variant="plain"
                      table={group.editable.table}
                      id={group.editable.id}
                      field={group.editable.field}
                      value={group.label}
                      as="span"
                    />
                  ) : (
                    group.label
                  )}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count === 0
                    ? "Em breve"
                    : `${count} ${count === 1 ? "especialidade" : "especialidades"}`}
                </span>
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  style={{
                    color: "var(--muted-foreground)",
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform .2s cubic-bezier(.16,1,.3,1)",
                    flexShrink: 0,
                  }}
                />
              </div>
            </button>

            {/* Expanded content */}
            {isOpen && (
              <div
                style={{
                  padding: "16px 20px 20px",
                  background: "var(--surface-0, var(--background))",
                  borderTop: "1px solid var(--surface-2)",
                }}
              >
                {count === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: 0 }}>
                    Conteúdo em breve.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {group.items.map(({ spec, href, progress }) => (
                      <SpecialtyCard key={spec.id} spec={spec} href={href} progress={progress} ctaLabel={ctaLabel} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SpecialtyCard({
  spec,
  href,
  progress,
  ctaLabel,
}: {
  spec: { id: number; slug: string; name: string };
  href: string;
  progress?: number;
  ctaLabel: string;
}) {
  const hasProgress = typeof progress === "number" && progress > 0;
  return (
    <Link
      href={href}
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius)",
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        textDecoration: "none",
        outline: "1px solid var(--surface-2)",
        outlineOffset: "-1px",
        transition: "background .12s",
      }}
      className="hover:bg-surface-2 group"
    >
      <SpecialtyIcon specialtySlug={spec.slug} size={26} />
      <div>
        <EditableText
          variant="plain"
          table="specialties"
          id={spec.id}
          field="name"
          value={spec.name}
          as="div"
          className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground"
        />
        {hasProgress && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: `${Math.min(100, progress)}%`,
                height: "100%",
                background: "var(--brand)",
                borderRadius: 2,
              }} />
            </div>
            <div style={{
              marginTop: 4, fontSize: 10.5, color: "var(--muted-foreground)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {Math.round(progress)}%
            </div>
          </div>
        )}
        <div
          style={{
            marginTop: hasProgress ? 8 : 5,
            display: "flex",
            alignItems: "center",
            gap: 3,
            fontSize: 11,
            fontWeight: 500,
            color: "var(--brand)",
          }}
        >
          {ctaLabel} <ChevronRight size={9} strokeWidth={2.5} />
        </div>
      </div>
    </Link>
  );
}
