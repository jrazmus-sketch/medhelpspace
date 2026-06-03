"use client";

import { useTransition, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { STUDY_TYPE_CONFIG } from "@/lib/page-type";
import { TypeChip } from "./type-chip";
import { TrackHubAccordion, type SuperGroupData } from "./track-hub-accordion";
import { EditableText } from "@/components/admin/editable-text";

type TabKey = "quiz" | "simulados";

// Server-fetched overrides from the `study_types` table.
export type StudyTypeOverrideRow = {
  id: number;
  label: string;
  description: string;
};

const CTA_FOR: Record<TabKey, string> = {
  quiz: "Responder",
  simulados: "Treinar",
};

const PAGE_NOUN: Record<TabKey, (n: number) => string> = {
  quiz:      (n) => `${n} ${n === 1 ? "página" : "páginas"} de questões`,
  simulados: (n) => `${n} ${n === 1 ? "simulado" : "simulados"}`,
};

function countPages(groups: SuperGroupData[]): number {
  return groups.reduce((sum, g) => sum + g.items.length, 0);
}

export function EstudoTabs({
  quizGroups,
  simuladosGroups,
  defaultTab,
  overrides,
  countOverrides,
}: {
  quizGroups: SuperGroupData[];
  simuladosGroups: SuperGroupData[];
  defaultTab: TabKey;
  overrides: Record<TabKey, StudyTypeOverrideRow>;
  /** Explicit card counts that override the item-derived count. Used when the
   *  accordion shows placeholder sections (e.g. simulados' Geral / Por Temas)
   *  but the selector card should still reflect the real content total. */
  countOverrides?: Partial<Record<TabKey, number>>;
}) {
  const [active, setActive] = useState<TabKey>(defaultTab);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(key: TabKey) {
    if (key === active) return;
    setActive(key);
    const params = new URLSearchParams(searchParams.toString());
    if (key === "quiz") params.delete("tab");
    else params.set("tab", key);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const order: TabKey[] = ["quiz", "simulados"];
  const counts: Record<TabKey, number> = {
    quiz: countOverrides?.quiz ?? countPages(quizGroups),
    simulados: countOverrides?.simulados ?? countPages(simuladosGroups),
  };

  const activeGroups = active === "quiz" ? quizGroups : simuladosGroups;
  const activeCfg = STUDY_TYPE_CONFIG[active];

  return (
    <div>
      {/* Header — sized to match sibling type-hub pages.
          Chip reacts to the active source; key={active} replays the entrance
          animation so the swap is visually punctuated. */}
      <header style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{
          fontSize: "clamp(20px, 5vw, 26px)",
          fontWeight: 600,
          letterSpacing: "-.025em",
          lineHeight: 1.15,
          margin: 0,
        }}>
          Estudo por Questões
        </h1>
        <span
          key={active}
          style={{
            display: "inline-flex",
            animation: "dash-fade-up 0.32s cubic-bezier(.16,1,.3,1) both",
          }}
        >
          <TypeChip typeKey={active} size="md" />
        </span>
      </header>

      {/* Two choice cards — visually match the dashboard's "Escolha como estudar" cards
          so the user gets a continuation of the same affordance language. */}
      <div
        role="tablist"
        aria-label="Tipo de prática"
        className="grid grid-cols-2 gap-2.5 sm:gap-3"
        style={{ marginBottom: 28 }}
      >
        {order.map((key) => {
          const cfg = STUDY_TYPE_CONFIG[key];
          const Icon = cfg.Icon;
          const isActive = key === active;

          // Active: full gradient (mirrors dashboard cards).
          // Inactive: surface-1 + 1px outline, accent color reserved for the icon.
          const background = isActive
            ? `linear-gradient(140deg, color-mix(in srgb, ${cfg.color} 92%, #1a0030) 0%, ${cfg.color} 100%)`
            : "var(--surface-1)";
          const titleColor = isActive ? "#fff" : "var(--foreground)";
          const iconColor = isActive ? "rgba(255,255,255,0.92)" : cfg.color;
          const descColor = isActive ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)";
          const countColor = isActive ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)";

          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => select(key)}
              style={{
                borderRadius: "var(--radius)",
                padding: "16px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                background,
                border: "none",
                outline: isActive ? "none" : "1px solid var(--surface-2)",
                outlineOffset: "-1px",
                textAlign: "left",
                cursor: isActive ? "default" : "pointer",
                minHeight: 132,
                transition: "background .25s ease, outline-color .25s ease",
              }}
              className={isActive ? "" : "hover:bg-surface-2"}
            >
              <Icon size={22} strokeWidth={1.6} style={{ color: iconColor, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: "clamp(14px, 2.2vw, 16px)",
                  fontWeight: 700,
                  letterSpacing: "-.02em",
                  lineHeight: 1.2,
                  color: titleColor,
                }}>
                  <EditableText
                    variant="plain"
                    table="study_types"
                    id={overrides[key].id}
                    field="label"
                    value={overrides[key].label}
                    as="span"
                  />
                </div>
                <div className="hidden sm:block" style={{
                  fontSize: 12,
                  marginTop: 6,
                  lineHeight: 1.4,
                  color: descColor,
                }}>
                  <EditableText
                    variant="plain"
                    table="study_types"
                    id={overrides[key].id}
                    field="description"
                    value={overrides[key].description}
                    as="span"
                  />
                </div>
                <div style={{
                  fontSize: 11,
                  marginTop: 8,
                  fontWeight: 600,
                  letterSpacing: ".04em",
                  color: countColor,
                  fontFamily: "var(--font-geist-mono)",
                }}>
                  {PAGE_NOUN[key](counts[key])}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Accordion for the active source.
          key={active} forces remount on toggle → the wrapper's fade-up animation
          replays, giving a clear visual signal that the content has switched. */}
      <div
        key={active}
        style={{ animation: "dash-fade-up 0.36s cubic-bezier(.16,1,.3,1) both" }}
      >
        {activeGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Conteúdo em preparação.
          </p>
        ) : (
          <TrackHubAccordion
            groups={activeGroups}
            ctaLabel={CTA_FOR[active]}
            accentColor={activeCfg.color}
          />
        )}
      </div>
    </div>
  );
}
