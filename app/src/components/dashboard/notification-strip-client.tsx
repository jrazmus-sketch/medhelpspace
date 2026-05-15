"use client";

import { useState, useEffect, useTransition } from "react";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { markAnnouncementsRead } from "@/actions/admin";
import type { AnnouncementWithCategory } from "@/types/supabase";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

export function NotificationStripClient({
  announcements,
  tickerLabel,
}: {
  announcements: AnnouncementWithCategory[];
  tickerLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localRead, setLocalRead] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();

  const unreadIds = announcements
    .filter((a) => !a.is_read && !localRead.has(a.id))
    .map((a) => a.id);
  const unreadCount = unreadIds.length;
  const latest = announcements[0];

  // Mark all unread as read when the panel is opened
  useEffect(() => {
    if (expanded && unreadIds.length > 0) {
      setLocalRead((prev) => new Set([...prev, ...unreadIds]));
      startTransition(() => {
        markAnnouncementsRead(unreadIds);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  if (!latest) return null;

  return (
    <div
      style={{
        borderRadius: "var(--radius)",
        border: "1px solid var(--surface-2)",
        overflow: "hidden",
        marginBottom: 20,
      }}
    >
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            minHeight: 42,
            background: "color-mix(in srgb, var(--brand) 10%, transparent)",
            borderRight: "1px solid var(--surface-2)",
            flexShrink: 0,
          }}
        >
          <Bell size={13} strokeWidth={2} style={{ color: "var(--brand)", flexShrink: 0 }} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: "var(--brand)",
              fontFamily: "var(--font-geist-mono)",
              whiteSpace: "nowrap",
            }}
          >
            {tickerLabel}
          </span>
          {unreadCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 17,
                height: 17,
                borderRadius: "50%",
                background: "var(--brand)",
                color: "var(--brand-fg)",
                fontSize: 9.5,
                fontWeight: 700,
                fontFamily: "var(--font-geist-mono)",
                flexShrink: 0,
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>

        {/* Middle: latest notification title */}
        <div
          style={{
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
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              flexShrink: 0,
              background: latest.category.color,
            }}
          />
          {latest.title}
        </div>

        {/* Right: expand toggle */}
        <div
          style={{
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
          }}
        >
          {expanded ? (
            <><ChevronUp size={13} strokeWidth={2.5} /> Ver menos</>
          ) : (
            <><ChevronDown size={13} strokeWidth={2.5} /> Ver mais</>
          )}
        </div>
      </button>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div
          style={{
            background: "var(--surface-2)",
            borderTop: "1px solid var(--surface-2)",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: "var(--muted-foreground)",
              letterSpacing: ".06em",
              padding: "2px 6px 6px",
            }}
          >
            {announcements.length}{" "}
            {announcements.length === 1 ? "atualização" : "atualizações"}
          </div>

          {announcements.map((n) => {
            const isUnread = !n.is_read && !localRead.has(n.id);
            const bodyText = n.body_html ? stripHtml(n.body_html) : null;
            return (
              <div
                key={n.id}
                style={{
                  background: "var(--surface-1)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 14px",
                  borderLeft: `3px solid ${n.category.color}`,
                  position: "relative",
                }}
              >
                {isUnread && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--brand)",
                    }}
                  />
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 17,
                      padding: "0 6px",
                      borderRadius: 3,
                      background: `color-mix(in srgb, ${n.category.color} 14%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${n.category.color} 28%, transparent)`,
                      color: n.category.color,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {n.category.label}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10.5,
                      color: "var(--muted-3, #4a4a4a)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {fmtDate(n.publish_at)}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    letterSpacing: "-.01em",
                    marginBottom: bodyText ? 4 : 0,
                  }}
                >
                  {n.title}
                </div>

                {bodyText && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--muted-foreground)",
                      lineHeight: 1.55,
                    }}
                  >
                    {bodyText}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
