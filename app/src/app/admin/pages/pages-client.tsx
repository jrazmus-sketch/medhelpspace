"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Pencil } from "lucide-react";

type PageRow = {
  id: number;
  slug: string;
  title: string;
  page_type: string;
  status: string;
  specialty: string | null;
  view: string | null;
  notes: string | null;
};

const TYPE_COLORS: Record<string, string> = {
  "plain-content": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "text-lesson": "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "h5p-quiz": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "blurb-nav-hub": "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  "audio-lesson": "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  default: "bg-surface-2 text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  "h5p-quiz": "quiz",
};

function typeLabel(t: string) {
  return TYPE_LABELS[t] ?? t;
}

export function PagesClient({ rows }: { rows: PageRow[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "published" | "draft">("");
  const [typeFilter, setTypeFilter] = useState("");

  const types = Array.from(new Set(rows.map((r) => r.page_type))).sort();

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      r.title.toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "" || r.status === statusFilter;
    const matchesType = typeFilter === "" || r.page_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("pages.title")}</h1>
        <span className="text-sm text-muted-foreground">{filtered.length} / {rows.length}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("pages.searchPlaceholder")}
          className="w-full max-w-xs rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | "published" | "draft")}
          className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
        >
          <option value="">{t("pages.filterByStatus")} — todos</option>
          <option value="published">{t("pages.published")}</option>
          <option value="draft">{t("pages.draft")}</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
        >
          <option value="">{t("pages.filterByType")} — todos</option>
          {types.map((tp) => (
            <option key={tp} value={tp}>{typeLabel(tp)}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">{t("pages.title")}</th>
              <th className="px-4 py-3">{t("pages.slug")}</th>
              <th className="px-4 py-3">{t("pages.type")}</th>
              <th className="px-4 py-3">{t("pages.status")}</th>
              <th className="px-4 py-3">{t("pages.specialty")}</th>
              <th className="px-4 py-3">{t("pages.notes")}</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t("pages.noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-surface-2/50">
                  <td className="px-4 py-2.5 font-medium max-w-xs truncate">{row.title}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground max-w-[200px] truncate">{row.slug}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[row.page_type] ?? TYPE_COLORS.default}`}>
                      {typeLabel(row.page_type)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.status === "draft"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-green-500/15 text-green-700 dark:text-green-400"
                    }`}>
                      {row.status === "draft" ? t("pages.draft") : t("pages.published")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{row.specialty ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{row.notes ?? ""}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => router.push(`/admin/pages/${row.id}/edit`)}
                      title={t("common.edit")}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
