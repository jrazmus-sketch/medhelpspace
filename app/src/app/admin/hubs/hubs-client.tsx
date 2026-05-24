"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LinkIcon,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpecialtyGroup, HubRow, OrphanRow } from "./page";

const TYPE_COLORS: Record<string, string> = {
  "plain-content": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "text-lesson":   "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "h5p-quiz":      "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "blurb-nav-hub": "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  "audio-lesson":  "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  default:         "bg-surface-2 text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = { "h5p-quiz": "quiz" };

function typeLabel(t: string) {
  return TYPE_LABELS[t] ?? t;
}

function liveUrlForHub(hub: HubRow): string {
  return hub.specialty_slug ? `/app/${hub.specialty_slug}/${hub.slug}` : `/app/${hub.slug}`;
}

function liveUrlForOrphan(orphan: OrphanRow): string {
  return orphan.specialty_slug
    ? `/app/${orphan.specialty_slug}/${orphan.slug}`
    : `/app/${orphan.slug}`;
}

type Props = {
  groups: SpecialtyGroup[];
  orphans: OrphanRow[];
  orphanTotal: number;
  orphanCap: number;
};

export function HubsClient({ groups, orphans, orphanTotal, orphanCap }: Props) {
  const { t } = useTranslation();
  // Collapsed by default — the list is informational, not actionable.
  // Many "unlinked" pages remain reachable via specialty-level queries.
  const [orphansOpen, setOrphansOpen] = useState(false);

  const overflow = orphanTotal - orphans.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page heading */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("hubs.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("hubs.subtitle")}</p>
      </header>

      {/* Orphans block */}
      <section className="rounded-xl border border-border bg-surface-1">
        <button
          type="button"
          onClick={() => setOrphansOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/40"
          aria-expanded={orphansOpen}
        >
          <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t("hubs.orphansTitle")}</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {orphanTotal}
          </span>
          <span className="ml-auto text-muted-foreground">
            {orphansOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>

        {orphansOpen && (
          <div className="border-t border-border">
            <p className="px-4 py-3 text-xs text-muted-foreground">
              {t("hubs.orphansHint")}
            </p>
            {orphans.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-muted-foreground">
                {t("hubs.orphansEmpty")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {orphans.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{o.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{o.slug}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-medium",
                            TYPE_COLORS[o.type] ?? TYPE_COLORS.default,
                          )}
                        >
                          {typeLabel(o.type)}
                        </span>
                        <span>
                          {o.specialty_name ?? t("hubs.noSpecialty")}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={liveUrlForOrphan(o)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={t("hubs.viewOnSite")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {t("hubs.viewOnSite")}
                        </span>
                      </Link>
                      <Link
                        href={`/admin/pages/${o.id}/edit`}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand transition-opacity hover:opacity-80"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("hubs.edit")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {overflow > 0 && (
              <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                +{overflow} —{" "}
                <Link
                  href="/admin/pages?status=published"
                  className="text-brand hover:underline"
                >
                  {t("hubs.orphansShowMore")}
                </Link>
              </div>
            )}
            {overflow === 0 && orphanTotal > orphanCap && (
              <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <Link href="/admin/pages" className="text-brand hover:underline">
                  {t("hubs.orphansShowMore")}
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Specialty tree */}
      <section className="space-y-6">
        {groups.map((g) => (
          <div key={g.id} className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">{g.name}</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface-1">
              {g.hubs.map((hub) => (
                <li
                  key={hub.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{hub.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">
                        {hub.view && hub.view !== "hub" ? hub.view : t("hubs.viewMain")}
                      </span>
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">
                        {t("hubs.cardCount", { count: hub.card_count })}
                      </span>
                      {hub.status === "draft" && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                          {t("pages.draft").toLowerCase()}
                        </span>
                      )}
                      <span className="font-mono opacity-70">{hub.slug}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={liveUrlForHub(hub)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title={t("hubs.viewOnSite")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">
                        {t("hubs.viewOnSite")}
                      </span>
                    </Link>
                    <Link
                      href={`/admin/pages/${hub.id}/edit`}
                      className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand transition-opacity hover:opacity-80"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("hubs.edit")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
