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

  // Money is stored in centavos; printing "299700" in an audit trail makes the
  // reader do the conversion at exactly the moment they are trying to check a
  // number. Anything else is passed through as-is.
  function fmtAuditValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (field.endsWith("_cents") && typeof value === "number") {
      return `R$ ${(value / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    if (typeof value === "boolean") return value ? "sim" : "não";
    return String(value);
  }

  function detailsFor(action: string, details: Record<string, unknown> | null): string {
    if (!details) return "—";
    if (action === "role_change") {
      return `${details.from_role} → ${details.to_role}`;
    }
    if (action === "password_reset") {
      return String(details.email ?? "—");
    }
    // Cohort edits carry a {field: {before, after}} map. Rendered generically it
    // would collapse to "[object Object]" and hide the one thing anyone opens
    // this log to find — what a price used to be.
    if (action === "cohort_update" || action === "cohort_create") {
      const slug = details.slug ? String(details.slug) : "";
      const changes = details.changes as
        | Record<string, { before: unknown; after: unknown }>
        | undefined;
      if (!changes) {
        // cohort_create: flat fields, no before/after.
        const flat = Object.entries(details)
          .filter(([k]) => k !== "slug" && k !== "cohort_id")
          .map(([k, v]) => `${k}: ${fmtAuditValue(k, v)}`)
          .join(", ");
        return [slug, flat].filter(Boolean).join(" · ") || "—";
      }
      const parts = Object.entries(changes).map(
        ([field, { before, after }]) =>
          `${field}: ${fmtAuditValue(field, before)} → ${fmtAuditValue(field, after)}`,
      );
      return [slug, parts.join(" · ")].filter(Boolean).join(" · ") || "—";
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
