"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, Circle, CircleDashed, CheckCircle2 } from "lucide-react";
import type { RoadmapData, RoadmapStatus } from "@/lib/study-plan/roadmap";

const STATUS_META: Record<RoadmapStatus, { label: string; color: string; Icon: typeof Circle }> = {
  nao_iniciado: { label: "Não iniciado", color: "var(--muted-foreground)", Icon: Circle },
  em_andamento: { label: "Em andamento", color: "#f59e0b", Icon: CircleDashed },
  dominado: { label: "Dominado", color: "#22c55e", Icon: CheckCircle2 },
};

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "nao_iniciado", label: "Não iniciados" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "dominado", label: "Dominados" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function RoteiroClient({ roadmap }: { roadmap: RoadmapData }) {
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { totals, tiers } = roadmap;

  const startedPct = totals.total ? Math.round((totals.started / totals.total) * 100) : 0;

  function toggleTier(tier: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  return (
    <>
      {/* Overall progress */}
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--surface-2)",
          borderRadius: "var(--radius)",
          padding: "16px 18px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {totals.started} de {totals.total} temas iniciados
          </span>
          <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>
            {totals.mastered} dominados
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
          <div
            style={{
              width: `${startedPct}%`,
              height: "100%",
              background: "var(--brand)",
              borderRadius: 999,
              transition: "width 0.4s",
            }}
          />
        </div>
      </div>

      {/* Status filter */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                border: active ? "1px solid var(--brand)" : "1px solid var(--surface-2)",
                background: active ? "color-mix(in srgb, var(--brand) 15%, transparent)" : "transparent",
                color: active ? "var(--brand)" : "var(--muted-foreground)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Tiers */}
      {tiers.map((tier) => {
        const visible = filter === "todos" ? tier.topics : tier.topics.filter((t) => t.status === filter);
        if (visible.length === 0) return null;
        const isCollapsed = collapsed.has(tier.tier);

        return (
          <section key={tier.tier} style={{ marginBottom: 20 }}>
            <button
              onClick={() => toggleTier(tier.tier)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 4px", background: "transparent", border: "none",
                cursor: "pointer", textAlign: "left",
                borderBottom: "1px solid var(--surface-2)",
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
                width: 22, height: 22, flexShrink: 0, borderRadius: 6,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "var(--brand)", color: "var(--brand-fg)",
              }}>
                {tier.tier}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                {tier.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "var(--font-geist-mono)" }}>
                {tier.mastered}/{tier.topics.length}
              </span>
              {isCollapsed ? (
                <ChevronRight size={16} style={{ color: "var(--muted-foreground)" }} />
              ) : (
                <ChevronDown size={16} style={{ color: "var(--muted-foreground)" }} />
              )}
            </button>

            {!isCollapsed && (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {visible.map((topic) => {
                  const meta = STATUS_META[topic.status];
                  const StatusIcon = meta.Icon;
                  return (
                    <li key={topic.id}>
                      <Link
                        href={topic.href}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 4px", minHeight: 44,
                          textDecoration: "none",
                          borderBottom: "1px solid var(--surface-1)",
                        }}
                        className="hover:bg-surface-1"
                      >
                        <StatusIcon size={18} style={{ color: meta.color, flexShrink: 0 }} strokeWidth={2} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>
                            {topic.name}
                          </span>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>
                            {topic.specialtyName} · {topic.incidence} no exame
                            {topic.accuracy != null && ` · ${Math.round(topic.accuracy * 100)}% acerto`}
                          </span>
                        </span>
                        <ChevronRight size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
