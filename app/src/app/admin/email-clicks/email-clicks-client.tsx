"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { ExternalLink, Search, MousePointerClick } from "lucide-react";
import type {
  EmailClick,
  EmailClickPersonType,
  EmailClicksResult,
} from "@/lib/admin/email-clicks";

interface Props {
  data: EmailClicksResult;
  type: EmailClickPersonType | "all";
  search: string;
}

// Per-type pill styling — mirrors the leads tier palette (member = brand purple to
// read as "customer", lead = blue, unknown = muted).
const personColor: Record<EmailClickPersonType, string> = {
  member: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  lead: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  unknown: "bg-surface-2 text-muted-foreground",
};

// Display a clicked URL compactly: drop the protocol, keep host + path, cap length.
function shortUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//, "");
  return stripped.length > 60 ? stripped.slice(0, 57) + "…" : stripped;
}

export function EmailClicksClient({ data, type, search }: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";
  const [queryInput, setQueryInput] = useState(search);

  const { clicks, total, page, pageSize, counts, windowCapped } = data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Build a route URL preserving the committed filters unless overridden. A type or
  // search change resets to page 1; changing the URL re-runs the server fetch.
  const hrefFor = (params: { type?: string; q?: string; page?: number }): string => {
    const nextType = params.type ?? type;
    const nextQ = params.q ?? search;
    const nextPage = params.page ?? 1;
    const sp = new URLSearchParams();
    if (nextType && nextType !== "all") sp.set("type", nextType);
    if (nextQ) sp.set("q", nextQ);
    if (nextPage > 1) sp.set("page", String(nextPage));
    const qs = sp.toString();
    return qs ? `/admin/email-clicks?${qs}` : "/admin/email-clicks";
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(hrefFor({ q: queryInput.trim(), page: 1 }));
  };

  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const filters: { key: EmailClickPersonType | "all"; label: string; count: number }[] = [
    { key: "all", label: t("emailClicks.filterAll"), count: counts.all },
    { key: "member", label: t("emailClicks.filterMembers"), count: counts.member },
    { key: "lead", label: t("emailClicks.filterLeads"), count: counts.lead },
    { key: "unknown", label: t("emailClicks.filterUnknown"), count: counts.unknown },
  ];

  const personName = (c: EmailClick) => c.person.name || c.email.split("@")[0];
  const personBadge = (pt: EmailClickPersonType) =>
    pt === "member"
      ? t("emailClicks.badgeMember")
      : pt === "lead"
        ? t("emailClicks.badgeLead")
        : t("emailClicks.badgeUnknown");

  function PersonCell({ c }: { c: EmailClick }) {
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{personName(c)}</span>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${personColor[c.person.type]}`}
          >
            {personBadge(c.person.type)}
          </span>
          {c.person.role && c.person.role !== "member" && (
            <span className="inline-block rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("emailClicks.adminTag")}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{c.email}</p>
      </div>
    );
  }

  function LinkCell({ c }: { c: EmailClick }) {
    if (!c.url) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <a
        href={c.url}
        target="_blank"
        rel="noopener noreferrer"
        title={c.url}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-full items-center gap-1 text-sm text-brand hover:underline"
      >
        <span className="truncate">{shortUrl(c.url)}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    );
  }

  const emailLabel = (c: EmailClick) => c.kindLabel ?? c.kind ?? t("emailClicks.emailUnknown");

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("emailClicks.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("emailClicks.subtitle")}</p>
        </div>
        <span className="text-sm text-muted-foreground">
          {t(total === 1 ? "emailClicks.countOne" : "emailClicks.countOther", { count: total })}
        </span>
      </div>

      {/* Filters: type chips + email search */}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const active = type === f.key;
          return (
            <Link
              key={f.key}
              href={hrefFor({ type: f.key })}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors sm:min-h-0 ${
                active
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2/50"
              }`}
            >
              {f.label}
              <span className={active ? "text-brand" : "text-foreground"}>{f.count}</span>
            </Link>
          );
        })}
        <form onSubmit={submitSearch} className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={t("emailClicks.searchPlaceholder")}
            className="min-h-[44px] w-full rounded-lg border border-border bg-surface-1 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand/50 sm:min-h-0"
          />
        </form>
      </div>

      {windowCapped && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("emailClicks.windowCapped", { count: counts.all })}
        </p>
      )}

      {clicks.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-1 px-4 py-12 text-center">
          <MousePointerClick className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("emailClicks.empty")}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {t("emailClicks.emptyHint")}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">{t("emailClicks.colPerson")}</th>
                  <th className="px-3 py-3">{t("emailClicks.colEmail")}</th>
                  <th className="px-3 py-3">{t("emailClicks.colLink")}</th>
                  <th className="whitespace-nowrap px-3 py-3">{t("emailClicks.colWhen")}</th>
                </tr>
              </thead>
              <tbody>
                {clicks.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="px-3 py-3">
                      <PersonCell c={c} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm">{emailLabel(c)}</span>
                    </td>
                    <td className="max-w-[22rem] px-3 py-3">
                      <LinkCell c={c} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {fmtWhen(c.at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {clicks.map((c) => (
              <div
                key={c.id}
                className="space-y-2 rounded-xl border border-border bg-surface-1 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <PersonCell c={c} />
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {fmtWhen(c.at)}
                  </span>
                </div>
                <div className="border-t border-border/50 pt-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {emailLabel(c)}
                  </p>
                  <div className="mt-1">
                    <LinkCell c={c} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-sm text-muted-foreground">
                {t("emailClicks.pageOf", { page, total: totalPages })}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={hrefFor({ page: page - 1 })}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm font-medium hover:bg-surface-2/50 sm:min-h-0"
                  >
                    {t("emailClicks.prev")}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-[44px] items-center rounded-lg border border-border/50 px-4 py-2 text-sm font-medium text-muted-foreground/50 sm:min-h-0">
                    {t("emailClicks.prev")}
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={hrefFor({ page: page + 1 })}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm font-medium hover:bg-surface-2/50 sm:min-h-0"
                  >
                    {t("emailClicks.next")}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-[44px] items-center rounded-lg border border-border/50 px-4 py-2 text-sm font-medium text-muted-foreground/50 sm:min-h-0">
                    {t("emailClicks.next")}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
