"use client";

import { useState } from "react";
import { SpecialtyIcon } from "@/components/content/specialty-icon";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type SuperGroupData = {
  label: string;
  items: {
    spec: { id: number; slug: string; name: string };
    href: string;
  }[];
};

export function TrackHubAccordion({ groups }: { groups: SuperGroupData[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(label: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
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
              borderRadius: "var(--radius)",
              outline: "1px solid var(--surface-2)",
              outlineOffset: "-1px",
              overflow: "hidden",
            }}
          >
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
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--foreground)",
                }}
              >
                {group.label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count} {count === 1 ? "especialidade" : "especialidades"}
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {group.items.map(({ spec, href }) => (
                    <SpecialtyCard key={spec.id} spec={spec} href={href} />
                  ))}
                </div>
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
}: {
  spec: { slug: string; name: string };
  href: string;
}) {
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
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-.01em",
            color: "var(--foreground)",
            lineHeight: 1.25,
          }}
        >
          {spec.name}
        </div>
        <div
          style={{
            marginTop: 5,
            display: "flex",
            alignItems: "center",
            gap: 3,
            fontSize: 11,
            fontWeight: 500,
            color: "var(--brand)",
          }}
        >
          Ouvir <ChevronRight size={9} strokeWidth={2.5} />
        </div>
      </div>
    </Link>
  );
}
