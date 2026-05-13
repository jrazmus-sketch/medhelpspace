"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";

export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export type LogEntry = {
  id: number;
  actor_user_id: string;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

interface Props {
  logs: LogEntry[];
  profileMap: Record<string, Profile>;
}

export function AuditLogClient({ logs, profileMap }: Props) {
  const { t } = useTranslation();

  function nameFor(userId: string | null): string {
    if (!userId) return "—";
    const p = profileMap[userId];
    if (!p) return userId.slice(0, 8) + "…";
    if (p.display_name) return p.display_name;
    if (p.email) return p.email.split("@")[0];
    return userId.slice(0, 8) + "…";
  }

  function labelFor(action: string): string {
    const key = `auditLog.actions.${action}`;
    const translated = t(key);
    return translated === key ? action : translated;
  }

  function detailsFor(action: string, details: Record<string, unknown> | null): string {
    if (!details) return "—";
    if (action === "role_change") {
      return `${details.from_role} → ${details.to_role}`;
    }
    if (action === "password_reset") {
      return String(details.email ?? "—");
    }
    const pairs = Object.entries(details).filter(
      ([, v]) => v !== null && v !== undefined && v !== "",
    );
    return pairs.length ? pairs.map(([k, v]) => `${k}: ${v}`).join(", ") : "—";
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (logs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("auditLog.noResults")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-1 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">{t("auditLog.timestamp")}</th>
            <th className="px-4 py-3">{t("auditLog.actor")}</th>
            <th className="px-4 py-3">{t("auditLog.action")}</th>
            <th className="px-4 py-3">{t("auditLog.target")}</th>
            <th className="px-4 py-3">{t("auditLog.details")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {logs.map((entry) => (
            <tr key={entry.id} className="bg-background hover:bg-surface-1 transition-colors">
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                {fmtDate(entry.created_at)}
              </td>
              <td className="px-4 py-3 font-medium">{nameFor(entry.actor_user_id)}</td>
              <td className="px-4 py-3">
                <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  {labelFor(entry.action)}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {nameFor(entry.target_user_id)}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {detailsFor(entry.action, entry.details)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
