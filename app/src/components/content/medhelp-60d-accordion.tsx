"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Target, Brain, ClipboardCheck, type LucideIcon } from "lucide-react";

type Medhelp60Section = {
  /** Stable key used for open/close state. */
  id: string;
  /** Big title shown in the header (e.g. "Revalida Up"). */
  title: string;
  /** Descriptive line under the title (e.g. "Decisão Estratégica"). */
  subtitle: string;
  Icon: LucideIcon;
  /** When set, the row navigates here instead of expanding an inline body. */
  href?: string;
};

// Static section definitions. Kept here (not passed from the server) because
// lucide icon components are functions and can't cross the server→client prop
// boundary. Sections with an href navigate to their own page; the rest expand
// to an "em breve" placeholder until their content ships.
const SECTIONS: Medhelp60Section[] = [
  { id: "revalida-up",    title: "Revalida Up",    subtitle: "Decisão Estratégica", Icon: Target, href: "/app/medhelp-60d/revalida-up" },
  { id: "memorecards",    title: "MemoreCards",    subtitle: "Alta Fixação",        Icon: Brain },
  { id: "simulados-100q", title: "Simulados 100Q", subtitle: "Performance INEP",    Icon: ClipboardCheck },
];

/**
 * The three MedHelp 60D sections rendered as accordion toggles. Matches the
 * visual language of TrackHubAccordion (surface tokens, chevron rotation,
 * brand left-accent stripe) so it sits naturally beside the rest of the app.
 */
export function Medhelp60Accordion() {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {SECTIONS.map((section) => {
        const isLink = !!section.href;
        const isOpen = open.has(section.id);

        const headerInner = (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <span
                aria-hidden="true"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: "var(--radius)",
                  background: "color-mix(in srgb, var(--brand) 12%, transparent)",
                  color: "var(--brand)",
                }}
              >
                <section.Icon size={20} strokeWidth={1.8} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: "clamp(16px, 3vw, 19px)",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.2,
                    color: "var(--foreground)",
                  }}
                >
                  {section.title}
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: 3,
                    fontSize: 12.5,
                    color: "var(--muted-foreground)",
                    lineHeight: 1.3,
                  }}
                >
                  {section.subtitle}
                </span>
              </span>
            </div>
            <ChevronRight
              size={16}
              strokeWidth={2}
              style={{
                color: "var(--muted-foreground)",
                transform: !isLink && isOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform .2s cubic-bezier(.16,1,.3,1)",
                flexShrink: 0,
              }}
            />
          </>
        );

        const headerStyle: React.CSSProperties = {
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "18px 20px",
          background: !isLink && isOpen ? "var(--surface-2)" : "var(--surface-1)",
          border: "none",
          cursor: "pointer",
          transition: "background .15s",
          textAlign: "left",
          textDecoration: "none",
        };

        return (
          <div
            key={section.id}
            style={{
              position: "relative",
              borderRadius: "var(--radius)",
              boxShadow: "inset 0 0 0 1px var(--surface-2)",
              overflow: "hidden",
            }}
          >
            {/* Brand left-accent stripe */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                background: "var(--brand)",
                pointerEvents: "none",
                zIndex: 2,
              }}
            />

            {/* Header row — navigates (href) or toggles an inline placeholder */}
            {isLink ? (
              <Link href={section.href!} style={headerStyle}>
                {headerInner}
              </Link>
            ) : (
              <button onClick={() => toggle(section.id)} aria-expanded={isOpen} style={headerStyle}>
                {headerInner}
              </button>
            )}

            {/* Expanded content — empty placeholder for the not-yet-built sections */}
            {!isLink && isOpen && (
              <div
                style={{
                  padding: "18px 20px 22px",
                  background: "var(--surface-0, var(--background))",
                  borderTop: "1px solid var(--surface-2)",
                }}
              >
                <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: 0 }}>
                  Conteúdo em breve.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
