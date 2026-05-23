"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { TrackHubAccordion, type SuperGroupData } from "./track-hub-accordion";

type TabKey = "quiz" | "simulados";

const TABS: { key: TabKey; label: string; desc: string; cta: string; color: string }[] = [
  {
    key: "quiz",
    label: "Questões Revalida",
    desc: "Questões estilo INEP comentadas — banco curado",
    cta: "Responder",
    color: "var(--brand)",
  },
  {
    key: "simulados",
    label: "Simulados",
    desc: "Treino de prova por casos clínicos",
    cta: "Treinar",
    color: "var(--c-simulados)",
  },
];

export function EstudoTabs({
  quizGroups,
  simuladosGroups,
  defaultTab,
}: {
  quizGroups: SuperGroupData[];
  simuladosGroups: SuperGroupData[];
  defaultTab: TabKey;
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

  const activeTab = TABS.find((t) => t.key === active)!;
  const activeGroups = active === "quiz" ? quizGroups : simuladosGroups;

  return (
    <div>
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Tipo de prática"
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "var(--surface-1)",
          borderRadius: "var(--radius)",
          outline: "1px solid var(--surface-2)",
          outlineOffset: "-1px",
          marginBottom: 16,
          width: "fit-content",
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => select(t.key)}
              style={{
                padding: "10px 18px",
                borderRadius: "calc(var(--radius) - 4px)",
                border: "none",
                background: isActive ? t.color : "transparent",
                color: isActive ? "#fff" : "var(--foreground)",
                fontSize: 13.5,
                fontWeight: 600,
                letterSpacing: "-.01em",
                cursor: "pointer",
                transition: "background .25s ease, color .25s ease",
                whiteSpace: "nowrap",
                minHeight: 44, // mobile tap target
              }}
              className={isActive ? "" : "hover:bg-surface-2"}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active tab description */}
      <p
        style={{
          margin: "0 0 20px",
          fontSize: 13.5,
          color: "var(--muted-foreground)",
          lineHeight: 1.5,
        }}
      >
        {activeTab.desc}
      </p>

      {/* Accordion */}
      {activeGroups.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Conteúdo em preparação.</p>
      ) : (
        <TrackHubAccordion
          key={active}
          groups={activeGroups}
          ctaLabel={activeTab.cta}
          accentColor={activeTab.color}
        />
      )}
    </div>
  );
}
