"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { markAnnouncementsRead } from "@/actions/admin";
import type { AnnouncementWithCategory } from "@/types/supabase";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Admin-authored HTML - same pattern as quiz-player, text-lesson-renderer, etc.
function BodyHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
  }, [html]);
  return <div ref={ref} className={className} />;
}

export function NotificationStripClient({
  announcements,
  tickerLabel,
}: {
  announcements: AnnouncementWithCategory[];
  tickerLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [readSet, setReadSet] = useState<Set<number>>(
    () => new Set(announcements.filter((a) => a.is_read).map((a) => a.id)),
  );
  const [, startTransition] = useTransition();

  const unreadCount = announcements.filter((a) => !readSet.has(a.id)).length;
  const hasUrgentUnread = announcements.some(
    (a) => !readSet.has(a.id) && a.priority === "urgent",
  );

  const accentColor = hasUrgentUnread ? "var(--color-amber-500, #f59e0b)" : "var(--brand)";
  const latest = announcements[0];

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      const unreadIds = announcements.filter((a) => !readSet.has(a.id)).map((a) => a.id);
      if (unreadIds.length > 0) {
        setReadSet(new Set(announcements.map((a) => a.id)));
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

      <button
        type="button"
        onClick={handleExpand}
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
            ? <><ChevronUp size={13} strokeWidth={2.5} /> Ver menos</>
            : <><ChevronDown size={13} strokeWidth={2.5} /> Ver mais</>
          }
        </div>
      </button>

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
            {announcements.length} {announcements.length === 1 ? "atualização" : "atualizações"}
          </div>

          {announcements.map((a) => {
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
                  <BodyHtml
                    html={a.body_html}
                    className="prose prose-sm max-w-none"
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
