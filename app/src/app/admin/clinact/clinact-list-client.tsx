"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Plus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { FORMAT_LABELS, type CaseListRow, type CaseFormat, type CaseStatus } from "@/lib/clinact/types";

type Row = CaseListRow & { specialty: string | null };

const STATUS_STYLE: Record<CaseStatus, string> = {
  draft: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground",
};

export function ClinactListClient({ rows }: { rows: Row[] }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<"all" | CaseStatus>("all");
  const [format, setFormat] = useState<"all" | CaseFormat>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (status === "all" || r.status === status) &&
          (format === "all" || r.format === format) &&
          (!q || r.title.toLowerCase().includes(q.toLowerCase()) || (r.specialty ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, status, format, q],
  );

  const counts = {
    all: rows.length,
    draft: rows.filter((r) => r.status === "draft").length,
    published: rows.filter((r) => r.status === "published").length,
    archived: rows.filter((r) => r.status === "archived").length,
  };

  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString(i18n.language === "en" ? "en-US" : "pt-BR") : "—");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">{t("clinact.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("clinact.subtitle", { count: counts.published, total: counts.all })}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/clinact/importar" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium hover:bg-accent">
            <Upload className="h-4 w-4" /> {t("clinact.import")}
          </Link>
          <Link href="/admin/clinact/novo" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-fg hover:opacity-90">
            <Plus className="h-4 w-4" /> {t("clinact.new")}
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-1 p-1">
          {(["all", "draft", "published", "archived"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn("min-h-9 whitespace-nowrap rounded-md px-3 text-sm", status === s ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            >
              {s === "all" ? t("clinact.all") : t(`clinact.status.${s}`)} <span className="text-xs text-muted-foreground">({counts[s]})</span>
            </button>
          ))}
        </div>
        <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="min-h-11 rounded-md border border-border bg-background px-2 text-sm">
          <option value="all">{t("clinact.allFormats")}</option>
          {(Object.keys(FORMAT_LABELS) as CaseFormat[]).map((f) => (
            <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="min-h-11 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? t("clinact.emptyAll") : t("clinact.emptyFilter")}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/clinact/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {FORMAT_LABELS[r.format]} · {r.specialty ?? "—"} {r.topic_text ? `· ${r.topic_text}` : ""} · {t(`clinact.difficulty.${r.difficulty}`)}
                    {r.est_minutes ? ` · ${r.est_minutes} min` : ""}
                  </p>
                </div>
                <div className="hidden text-right text-xs text-muted-foreground sm:block">
                  <p>rev. {r.revision}</p>
                  <p>{fmtDate(r.published_at ?? r.updated_at)}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[r.status])}>{t(`clinact.status.${r.status}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
