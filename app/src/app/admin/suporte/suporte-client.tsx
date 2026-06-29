"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { LifeBuoy, ArrowLeft, Send, Mail, Monitor, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadTicketDetail, replyToTicket, updateTicketStatus } from "@/actions/admin-support";
import {
  SUPPORT_STATUSES,
  MESSAGE_MAX,
  type SupportStatus,
  type SupportTicket,
} from "@/lib/support";
import type { AdminTicketDetail } from "@/lib/admin/support-tickets";

const STATUS_STYLES: Record<SupportStatus, string> = {
  open: "bg-brand/15 text-brand",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  resolved: "bg-green-500/15 text-green-700 dark:text-green-400",
  closed: "bg-surface-2 text-muted-foreground",
};

function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtDateTime(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Filter = "all" | SupportStatus;

export function SuporteClient({ initialTickets }: { initialTickets: SupportTicket[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [tickets, setTickets] = useState(initialTickets);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [detail, setDetail] = useState<AdminTicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reply, setReply] = useState("");
  const [replyPending, startReply] = useTransition();
  const [statusPending, startStatus] = useTransition();

  const filtered = tickets.filter((tk) => filter === "all" || tk.status === filter);

  function patchTicket(id: number, patch: Partial<SupportTicket>) {
    setTickets((prev) => prev.map((tk) => (tk.id === id ? { ...tk, ...patch } : tk)));
    setSelected((s) => (s && s.id === id ? { ...s, ...patch } : s));
  }

  function openTicket(tk: SupportTicket) {
    setSelected(tk);
    setDetail(null);
    setLoadingDetail(true);
    if (tk.admin_unread) patchTicket(tk.id, { admin_unread: false });
    loadTicketDetail(tk.id)
      .then((d) => setDetail(d))
      .finally(() => setLoadingDetail(false));
  }

  function handleReply() {
    if (!selected) return;
    const text = reply.trim();
    if (text.length < 1) return;
    startReply(async () => {
      const res = await replyToTicket(selected.id, text);
      if ("error" in res) return;
      setDetail((d) => (d ? { ...d, messages: [...d.messages, res.message] } : d));
      const nextStatus: SupportStatus =
        selected.status === "open" ? "in_progress" : selected.status;
      patchTicket(selected.id, {
        last_message_at: res.message.created_at,
        last_message_from: "admin",
        member_unread: true,
        status: nextStatus,
      });
      setReply("");
    });
  }

  function handleStatus(next: SupportStatus) {
    if (!selected || selected.status === next) return;
    startStatus(async () => {
      const res = await updateTicketStatus(selected.id, next);
      if ("error" in res) return;
      patchTicket(selected.id, { status: next });
      setDetail((d) => (d ? { ...d, ticket: { ...d.ticket, status: next } } : d));
    });
  }

  const memberName = selected
    ? selected.display_name || selected.email.split("@")[0]
    : "";

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LifeBuoy className="h-5 w-5 text-brand" />
        <div>
          <h1 className="text-2xl font-bold">{t("support.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("support.subtitle")}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["all", ...SUPPORT_STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f
                ? "bg-brand text-brand-fg"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "all" ? t("support.filterAll") : t(`support.status.${f}`)}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-6">
        {/* List */}
        <div className={cn(selected && "hidden lg:block")}>
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              {t("support.empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((tk) => (
                <li key={tk.id}>
                  <button
                    type="button"
                    onClick={() => openTicket(tk)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                      selected?.id === tk.id
                        ? "border-brand/50 bg-brand/5"
                        : "border-border bg-surface-1 hover:bg-surface-2",
                    )}
                  >
                    {tk.admin_unread && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{tk.subject}</p>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {tk.display_name || tk.email} · {t(`support.cat.${tk.category}`)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {fmtDate(tk.last_message_at, locale)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        STATUS_STYLES[tk.status],
                      )}
                    >
                      {t(`support.status.${tk.status}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className={cn(!selected && "hidden lg:block")}>
          {!selected ? (
            <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              {t("support.selectPrompt")}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-1">
              {/* Detail header */}
              <div className="border-b border-border p-4">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setDetail(null);
                  }}
                  className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t("support.backToList")}
                </button>

                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold leading-snug text-foreground">
                    {selected.subject}
                  </h2>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      STATUS_STYLES[selected.status],
                    )}
                  >
                    {t(`support.status.${selected.status}`)}
                  </span>
                </div>

                <div className="mt-2 space-y-1 text-[12.5px] text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    <a
                      href={`mailto:${selected.email}`}
                      className="text-foreground underline-offset-2 hover:underline"
                    >
                      {selected.email}
                    </a>
                    <span className="text-muted-foreground">· {memberName}</span>
                  </p>
                  <p>
                    {t(`support.cat.${selected.category}`)} · {t("support.protocol")} #{selected.id} ·{" "}
                    {fmtDateTime(selected.created_at, locale)}
                  </p>
                  {selected.page_url && (
                    <p className="flex items-center gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="truncate">{selected.page_url}</span>
                    </p>
                  )}
                  {selected.user_agent && (
                    <p className="flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5" />
                      <span className="truncate">{selected.user_agent}</span>
                    </p>
                  )}
                </div>

                {/* Status control */}
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("support.statusLabel")}
                  </label>
                  <select
                    value={selected.status}
                    disabled={statusPending}
                    onChange={(e) => handleStatus(e.target.value as SupportStatus)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none disabled:opacity-50"
                  >
                    {SUPPORT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`support.status.${s}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Thread */}
              <div className="space-y-4 p-4">
                {loadingDetail || !detail ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("common.loading")}
                  </p>
                ) : (
                  detail.messages.map((m) => {
                    const isAdmin = m.author_role === "admin";
                    return (
                      <div key={m.id} className={isAdmin ? "flex justify-end" : "flex justify-start"}>
                        <div className="max-w-[85%]">
                          <p
                            className={cn(
                              "mb-1 text-[11px] font-semibold uppercase tracking-wide",
                              isAdmin ? "text-right text-brand" : "text-muted-foreground",
                            )}
                          >
                            {isAdmin ? t("support.fromTeam") : memberName}
                          </p>
                          <div
                            className={cn(
                              "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-foreground",
                              isAdmin ? "rounded-tr-sm bg-brand/10" : "rounded-tl-sm bg-surface-2",
                            )}
                          >
                            {m.body}
                          </div>
                          <p
                            className={cn(
                              "mt-1 text-[10.5px] text-muted-foreground",
                              isAdmin && "text-right",
                            )}
                          >
                            {fmtDateTime(m.created_at, locale)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply */}
              <div className="border-t border-border p-4">
                <textarea
                  value={reply}
                  maxLength={MESSAGE_MAX}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  placeholder={t("support.replyPlaceholder")}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brand/50"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={replyPending || reply.trim().length < 1}
                    className="flex min-h-[40px] items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {replyPending ? t("support.sending") : t("support.send")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
