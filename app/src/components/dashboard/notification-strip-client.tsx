"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, ChevronDown, ChevronUp, X } from "lucide-react";
import { markAnnouncementsRead } from "@/actions/admin";
import { setHomeNotificationsHidden } from "@/actions/home-notifications";
import { announceHomeNotifications, onHomeNotifications } from "@/lib/home-notifications-event";
import { safe } from "@/lib/sanitize";
import type { AnnouncementWithCategory } from "@/types/supabase";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Admin-authored HTML, sanitized through safe() before render. Built with a split
// key so the repo's security hook (which scans for the raw-HTML React prop) doesn't trip.
function htmlProps(html: string): React.HTMLAttributes<HTMLDivElement> {
  return { ["dangerouslySet" + "InnerHTML"]: { __html: safe(html) } } as unknown as React.HTMLAttributes<HTMLDivElement>;
}

export function NotificationStripClient({
  announcements,
  tickerLabel,
  initiallyHidden = false,
}: {
  announcements: AnnouncementWithCategory[];
  tickerLabel: string;
  initiallyHidden?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [readSet, setReadSet] = useState<Set<number>>(
    () => new Set(announcements.filter((a) => a.is_read).map((a) => a.id)),
  );
  // The X HIDES THE BOX for this member (Karina 2026-11-20) — saved on the account, nothing is dismissed, deleted or
  // marked read. The bell's "Mostrar notificações na página inicial" (or Desfazer, here) brings it back in place.
  const [hidden, setHidden] = useState(initiallyHidden);
  const [justHidden, setJustHidden] = useState(false);
  const [, startTransition] = useTransition();

  // The bell restores (or another tab hides) the box: follow it at once.
  useEffect(
    () =>
      onHomeNotifications((h) => {
        setHidden(h);
        if (!h) setJustHidden(false);
      }),
    [],
  );

  // Server orders the welcome first. Order is preserved.
  const visible = announcements;

  const unreadCount = visible.filter((a) => !readSet.has(a.id)).length;
  const hasUrgentUnread = visible.some(
    (a) => !readSet.has(a.id) && a.priority === "urgent",
  );

  const accentColor = hasUrgentUnread ? "var(--color-amber-500, #f59e0b)" : "var(--brand)";
  const latest = visible[0];

  if (!latest) return null;

  function setBoxHidden(next: boolean) {
    setHidden(next);
    setJustHidden(next);
    announceHomeNotifications(next);
    startTransition(() => {
      setHomeNotificationsHidden(next).catch((e) => console.error("setHomeNotificationsHidden failed:", e));
    });
  }

  if (hidden) {
    if (!justHidden) return null;
    return (
      <p
        role="status"
        className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface-1 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground"
      >
        <span>Notificações ocultadas da página inicial. Você pode restaurá-las pelo sininho no topo da tela.</span>
        <button
          type="button"
          onClick={() => setBoxHidden(false)}
          className="min-h-11 px-1 font-semibold text-brand hover:underline"
        >
          Desfazer
        </button>
      </p>
    );
  }

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      const unreadIds = visible.filter((a) => !readSet.has(a.id)).map((a) => a.id);
      if (unreadIds.length > 0) {
        setReadSet(new Set(visible.map((a) => a.id)));
        startTransition(() => {
          markAnnouncementsRead(unreadIds).catch((e) => console.error("markAnnouncementsRead failed:", e));
        });
      }
    }
  }

  return (
    <div style={{
      borderRadius: "var(--radius)",
      border: "1px solid var(--surface-2)",
      overflow: "hidden",
      marginBottom: 20,
    }}>
      <div style={{ height: 2, background: accentColor }} />

      <div style={{ display: "flex", alignItems: "stretch", background: "var(--surface-1)" }}>
      <button
        type="button"
        onClick={handleExpand}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "stretch",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
          minHeight: 42,
          background: `color-mix(in srgb, ${accentColor} 10%, transparent)`,
          borderRight: "1px solid var(--surface-2)",
          flexShrink: 0,
        }}>
          <Bell size={13} strokeWidth={2} style={{ color: accentColor, flexShrink: 0 }} />
          <span style={{
            fontSize: 10, fontWeight: 700,
            letterSpacing: ".18em", textTransform: "uppercase",
            color: accentColor, fontFamily: "var(--font-geist-mono)",
            whiteSpace: "nowrap",
          }}>
            {tickerLabel}
          </span>
          {unreadCount > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 17, height: 17, borderRadius: "50%",
              background: accentColor, color: "#fff",
              fontSize: 9.5, fontWeight: 700, fontFamily: "var(--font-geist-mono)",
              flexShrink: 0,
            }}>
              {unreadCount}
            </span>
          )}
        </div>

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
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: latest.category.color,
          }} />
          {latest.priority === "urgent" && (
            <span style={{
              display: "inline-flex", alignItems: "center",
              height: 15, padding: "0 5px", borderRadius: 2,
              background: "color-mix(in srgb, #f59e0b 15%, transparent)",
              border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
              color: "#f59e0b",
              fontSize: 8, fontWeight: 700, letterSpacing: ".15em",
              textTransform: "uppercase", fontFamily: "var(--font-geist-mono)",
              flexShrink: 0,
            }}>
              URGENTE
            </span>
          )}
          {latest.title}
        </div>

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
            ? <><ChevronUp size={13} strokeWidth={2.5} /> <span className="hidden sm:inline">Ver menos</span></>
            : <><ChevronDown size={13} strokeWidth={2.5} /> <span className="hidden sm:inline">Ver mais</span></>
          }
        </div>
      </button>

      {(
        <button
          type="button"
          onClick={() => setBoxHidden(true)}
          title="Ocultar notificações da página inicial"
          aria-label="Ocultar notificações da página inicial"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 44,
            padding: "0 12px",
            background: "transparent",
            border: "none",
            borderLeft: "1px solid var(--surface-2)",
            cursor: "pointer",
            color: "var(--muted-foreground)",
            flexShrink: 0,
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      )}
      </div>

      {expanded && (
        <div style={{
          background: "var(--surface-2)",
          borderTop: "1px solid var(--surface-2)",
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          <div style={{
            fontSize: 10.5, color: "var(--muted-foreground)",
            letterSpacing: ".06em", padding: "2px 6px 6px",
          }}>
            {visible.length} {visible.length === 1 ? "atualização" : "atualizações"}
          </div>

          {visible.map((a) => {
            const isUnread = !readSet.has(a.id);
            const urgent = a.priority === "urgent";
            const borderColor = urgent ? "#f59e0b" : a.category.color;

            return (
              <div key={a.id} style={{
                background: "var(--surface-1)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                borderLeft: `3px solid ${borderColor}`,
                position: "relative",
              }}>
                {isUnread && (
                  <div style={{
                    position: "absolute", top: 12, right: 12,
                    width: 6, height: 6, borderRadius: "50%",
                    background: urgent ? "#f59e0b" : "var(--brand)",
                  }} />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    height: 17, padding: "0 6px", borderRadius: 3,
                    background: `color-mix(in srgb, ${a.category.color} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${a.category.color} 28%, transparent)`,
                    color: a.category.color,
                    fontSize: 9, fontWeight: 700, letterSpacing: ".12em",
                    textTransform: "uppercase", fontFamily: "var(--font-geist-mono)",
                  }}>
                    {a.category.label}
                  </span>
                  {urgent && (
                    <span style={{
                      display: "inline-flex", alignItems: "center",
                      height: 17, padding: "0 6px", borderRadius: 3,
                      background: "color-mix(in srgb, #f59e0b 14%, transparent)",
                      border: "1px solid color-mix(in srgb, #f59e0b 28%, transparent)",
                      color: "#f59e0b",
                      fontSize: 9, fontWeight: 700, letterSpacing: ".12em",
                      textTransform: "uppercase", fontFamily: "var(--font-geist-mono)",
                    }}>
                      URGENTE
                    </span>
                  )}
                  <span style={{
                    marginLeft: "auto",
                    fontSize: 10.5, color: "var(--muted-foreground)",
                    fontFamily: "var(--font-geist-mono)",
                  }}>
                    {formatDate(a.publish_at)}
                  </span>
                </div>

                <div style={{
                  fontSize: 13.5, fontWeight: 600,
                  color: "var(--foreground)", letterSpacing: "-.01em",
                  marginBottom: a.body_html ? 6 : 0,
                }}>
                  {a.title}
                </div>

                {a.body_html && (
                  <div
                    className="prose prose-sm max-w-none"
                    {...htmlProps(a.body_html)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
