"use client";

import { useState } from "react";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";

type Category = "exame" | "conteudo" | "noticias" | "geral";

const CATEGORY_LABELS: Record<Category, string> = {
  exame:    "Exame",
  conteudo: "Conteúdo",
  noticias: "Notícias",
  geral:    "Geral",
};

const CATEGORY_COLORS: Record<Category, string> = {
  exame:    "var(--brand)",
  conteudo: "var(--c-medvoice)",
  noticias: "var(--c-success, #4ade80)",
  geral:    "var(--muted-foreground)",
};

// ── Wireframe placeholder data ─────────────────────────────────────────────────
// Replace with DB fetch when backend is built.
const NOTIFICATIONS = [
  {
    id: 1,
    category: "exame" as Category,
    title: "Mudança de data — Revalida 2027.1",
    body: "A data da prova foi atualizada oficialmente. Confirme no portal do CFM e ajuste sua agenda de revisão.",
    date: "15 mai 2026",
    isNew: true,
  },
  {
    id: 2,
    category: "conteudo" as Category,
    title: "Novo conteúdo: MedVoice Cardiologia",
    body: "5 novos áudios de Cardiologia foram adicionados. Ouça agora na seção MedVoice.",
    date: "10 mai 2026",
    isNew: true,
  },
  {
    id: 3,
    category: "geral" as Category,
    title: "Bem Vindo ao MedHelp Space!",
    body: null,
    date: "09 abr 2026",
    isNew: false,
  },
];

export function NotificationStrip() {
  const [expanded, setExpanded] = useState(false);

  const newCount = NOTIFICATIONS.filter((n) => n.isNew).length;
  const latest = NOTIFICATIONS[0];

  return (
    <div style={{
      borderRadius: "var(--radius)",
      border: "1px solid var(--surface-2)",
      overflow: "hidden",
      marginBottom: 20,
    }}>
      {/* Top accent line */}
      <div style={{ height: 2, background: "var(--brand)" }} />

      {/* ── Ticker bar (always visible) ── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "stretch",
          background: "var(--surface-1)",
          border: "none",
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
        }}
      >
        {/* Left: icon + label + badge */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
          minHeight: 42,
          background: "color-mix(in srgb, var(--brand) 10%, transparent)",
          borderRight: "1px solid var(--surface-2)",
          flexShrink: 0,
        }}>
          <Bell size={13} strokeWidth={2} style={{ color: "var(--brand)", flexShrink: 0 }} />
          <span style={{
            fontSize: 10, fontWeight: 700,
            letterSpacing: ".18em", textTransform: "uppercase",
            color: "var(--brand)", fontFamily: "var(--font-geist-mono)",
            whiteSpace: "nowrap",
          }}>
            Novidades
          </span>
          {newCount > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 17, height: 17, borderRadius: "50%",
              background: "var(--brand)", color: "var(--brand-fg)",
              fontSize: 9.5, fontWeight: 700, fontFamily: "var(--font-geist-mono)",
              flexShrink: 0,
            }}>
              {newCount}
            </span>
          )}
        </div>

        {/* Middle: latest notification title */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          fontSize: 13,
          color: "var(--foreground)",
          letterSpacing: "-.01em",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          gap: 10,
        }}>
          {/* Category dot */}
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: CATEGORY_COLORS[latest.category],
          }} />
          {latest.title}
        </div>

        {/* Right: expand toggle */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "0 16px",
          borderLeft: "1px solid var(--surface-2)",
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--brand)",
          whiteSpace: "nowrap",
        }}>
          {expanded
            ? <><ChevronUp size={13} strokeWidth={2.5} /> Ver menos</>
            : <><ChevronDown size={13} strokeWidth={2.5} /> Ver mais</>
          }
        </div>
      </button>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div style={{
          background: "var(--surface-2)",
          borderTop: "1px solid var(--surface-2)",
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          {/* Count */}
          <div style={{
            fontSize: 10.5, color: "var(--muted-foreground)",
            letterSpacing: ".06em", padding: "2px 6px 6px",
          }}>
            {NOTIFICATIONS.length} {NOTIFICATIONS.length === 1 ? "atualização" : "atualizações"}
          </div>

          {/* Cards */}
          {NOTIFICATIONS.map((n) => (
            <div key={n.id} style={{
              background: "var(--surface-1)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              borderLeft: `3px solid ${CATEGORY_COLORS[n.category]}`,
              position: "relative",
            }}>
              {/* Unread dot */}
              {n.isNew && (
                <div style={{
                  position: "absolute", top: 12, right: 12,
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--brand)",
                }} />
              )}

              {/* Category + date */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  height: 17, padding: "0 6px", borderRadius: 3,
                  background: `color-mix(in srgb, ${CATEGORY_COLORS[n.category]} 14%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${CATEGORY_COLORS[n.category]} 28%, transparent)`,
                  color: CATEGORY_COLORS[n.category],
                  fontSize: 9, fontWeight: 700, letterSpacing: ".12em",
                  textTransform: "uppercase", fontFamily: "var(--font-geist-mono)",
                }}>
                  {CATEGORY_LABELS[n.category]}
                </span>
                <span style={{
                  marginLeft: "auto",
                  fontSize: 10.5, color: "var(--muted-3, #4a4a4a)",
                  fontFamily: "var(--font-geist-mono)",
                }}>
                  {n.date}
                </span>
              </div>

              {/* Title */}
              <div style={{
                fontSize: 13.5, fontWeight: 600,
                color: "var(--foreground)", letterSpacing: "-.01em",
                marginBottom: n.body ? 4 : 0,
              }}>
                {n.title}
              </div>

              {/* Body */}
              {n.body && (
                <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.55 }}>
                  {n.body}
                </div>
              )}
            </div>
          ))}

          {/* Wireframe label */}
          <div style={{
            textAlign: "center", padding: "6px 0 2px",
            fontSize: 9, fontFamily: "var(--font-geist-mono)",
            letterSpacing: ".18em", textTransform: "uppercase",
            color: "var(--muted-3, #4a4a4a)",
          }}>
            — wireframe —
          </div>
        </div>
      )}
    </div>
  );
}
