"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { cn } from "@/lib/utils";

export type FunnelStageDatum = {
  key: string; // 'landed' | 'started' | 'email' | 'completed' | 'verified' | 'purchased'
  label: string; // already translated
  count: number | null; // null = not tracked in this view → render "—", no bar fill
  sub: string | null; // already-formatted line like: 31% of "Started the quiz"
  clickable: boolean; // true for lead stages; clicking filters the table
  active: boolean; // this stage is the current table filter
};

export type FunnelBySourceRow = {
  source: string | null; // null = organic
  landed: number | null; // null = not tracked
  started: number | null;
  email: number;
  completed: number;
  verified: number;
  purchased: number;
};

interface Props {
  stages: FunnelStageDatum[]; // 6 stages, in order
  savedForLater: number; // exit-intent captures; 0 → hide that block
  savedNote: string; // already-formatted explainer sentence
  savedActive: boolean; // saved-for-later block is the current filter
  overallValue: string; // "0.3%" or "—"
  onStageClick: (key: string) => void; // parent toggles; also called with "saved"
  bySource: FunnelBySourceRow[]; // ≥2 → table; ==1 → one-line note; 0 → nothing
  showNotTrackedNote: boolean; // true when landed/started are null for this tab
  isEmpty: boolean; // no data at all for the current period/tab
}

const SOURCE_COLUMN_KEYS = [
  "landed",
  "started",
  "email",
  "completed",
  "verified",
  "purchased",
] as const;

type SourceColumnKey = (typeof SOURCE_COLUMN_KEYS)[number];

const SOURCE_COLUMN_LABEL_KEYS: Record<SourceColumnKey, string> = {
  landed: "funnel.colLanded",
  started: "funnel.colStarted",
  email: "funnel.colEmail",
  completed: "funnel.colCompleted",
  verified: "funnel.colVerified",
  purchased: "funnel.colPurchased",
};

export function FunnelPanel({
  stages,
  savedForLater,
  savedNote,
  savedActive,
  overallValue,
  onStageClick,
  bySource,
  showNotTrackedNote,
  isEmpty,
}: Props) {
  const { t } = useTranslation();

  const sourceLabel = (s: string | null) => s ?? t("funnel.sourceOrganic");

  const sourceCols: { key: SourceColumnKey; label: string }[] = SOURCE_COLUMN_KEYS.map((key) => ({
    key,
    label: t(SOURCE_COLUMN_LABEL_KEYS[key]),
  }));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{t("funnel.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("funnel.subtitle")}</p>
        </div>
        <span className="text-sm text-muted-foreground">
          {t("funnel.overallConversion")}:{" "}
          <span className="font-semibold text-foreground">{overallValue}</span>
        </span>
      </div>

      {isEmpty ? (
        <p className="rounded-xl border border-border bg-surface-1 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("funnel.empty")}
        </p>
      ) : (
        <>
          <FunnelBars stages={stages} onStageClick={onStageClick} />

          {savedForLater > 0 && (
            <button
              type="button"
              aria-pressed={savedActive}
              onClick={() => onStageClick("saved")}
              className={cn(
                "min-h-[44px] w-full rounded-xl border border-dashed border-border bg-surface-1 p-4 text-left transition-colors hover:bg-surface-2/40",
                savedActive && "bg-brand/10 ring-1 ring-brand/40"
              )}
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("funnel.savedForLater")}
                <span className="ml-2 text-base font-bold tabular-nums text-foreground normal-case tracking-normal">
                  {savedForLater}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{savedNote}</p>
            </button>
          )}

          {showNotTrackedNote && (
            <p className="text-xs text-muted-foreground">{t("funnel.notTrackedNote")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("funnel.beaconNote")}</p>

          {bySource.length === 1 && (
            <p className="text-xs text-muted-foreground">
              {t("funnel.singleSourceNote", { source: sourceLabel(bySource[0].source) })}
            </p>
          )}

          {bySource.length >= 2 && (
            <>
              <p className="pt-1 text-xs uppercase tracking-wider text-muted-foreground">
                {t("funnel.bySource")}
              </p>

              {/* By-source: desktop table */}
              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">{t("funnel.colSource")}</th>
                      {sourceCols.map((c) => (
                        <th key={c.key} className="px-4 py-3 text-right">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map((row) => (
                      <tr key={row.source ?? "organic"} className="border-b border-border/50">
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                          {sourceLabel(row.source)}
                        </td>
                        {sourceCols.map((c) => (
                          <td key={c.key} className="px-4 py-3 text-right tabular-nums">
                            {row[c.key] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* By-source: mobile cards */}
              <div className="space-y-3 md:hidden">
                {bySource.map((row) => (
                  <div
                    key={row.source ?? "organic"}
                    className="rounded-xl border border-border bg-surface-1 p-4"
                  >
                    <p className="font-medium">{sourceLabel(row.source)}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      {sourceCols.map((c) => (
                        <div key={c.key}>
                          <p className="text-sm font-semibold tabular-nums">
                            {row[c.key] ?? "—"}
                          </p>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {c.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function FunnelBars({
  stages,
  onStageClick,
}: {
  stages: FunnelStageDatum[];
  onStageClick: (key: string) => void;
}) {
  const max = Math.max(1, ...stages.map((s) => s.count ?? 0));

  return (
    <div className="space-y-1 rounded-xl border border-border bg-surface-1 p-4 sm:p-5">
      {stages.map((stage) => {
        const widthPct =
          stage.count !== null && stage.count > 0
            ? Math.max(2, (stage.count / max) * 100)
            : null;

        const rowClasses = cn(
          "w-full rounded-lg px-2 py-2 sm:py-1.5",
          stage.clickable &&
            "min-h-[44px] cursor-pointer transition-colors hover:bg-surface-2/60 sm:min-h-0",
          stage.active && "bg-brand/10 ring-1 ring-brand/40"
        );

        const labelClasses = cn(
          "truncate text-left text-sm",
          stage.active
            ? "font-semibold text-brand"
            : !stage.clickable && "text-muted-foreground"
        );

        const countClasses = (hiddenAt: "mobile" | "desktop") =>
          cn(
            "text-base font-bold tabular-nums",
            hiddenAt === "mobile" && "sm:hidden",
            hiddenAt === "desktop" && "hidden sm:inline",
            stage.count === null && "font-normal text-muted-foreground"
          );

        const rowLabel = `${stage.label}: ${stage.count ?? "—"}`;

        const rowContent = (
          <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[11rem_1fr_auto] sm:items-center sm:gap-3">
            <div className="flex items-center justify-between gap-2 sm:contents">
              <span className={labelClasses}>{stage.label}</span>
              <span className={countClasses("mobile")}>{stage.count ?? "—"}</span>
            </div>

            <div
              className="relative h-6 w-full overflow-hidden rounded bg-surface-2"
              aria-hidden="true"
            >
              {widthPct !== null && (
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded",
                    stage.clickable ? "bg-brand" : "bg-brand/40"
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              )}
            </div>

            <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
              <span className={countClasses("desktop")}>{stage.count ?? "—"}</span>
              {stage.sub !== null && (
                <span className="text-xs text-muted-foreground sm:block">{stage.sub}</span>
              )}
            </div>
          </div>
        );

        if (stage.clickable) {
          return (
            <button
              key={stage.key}
              type="button"
              aria-pressed={stage.active}
              aria-label={rowLabel}
              onClick={() => onStageClick(stage.key)}
              className={rowClasses}
            >
              {rowContent}
            </button>
          );
        }

        return (
          <div key={stage.key} aria-label={rowLabel} className={rowClasses}>
            {rowContent}
          </div>
        );
      })}
    </div>
  );
}
