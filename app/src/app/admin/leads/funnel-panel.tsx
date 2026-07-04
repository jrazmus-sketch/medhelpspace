"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import type { FunnelOverview, FunnelStage, FunnelSourceRow } from "@/lib/admin/funnel";

interface Props {
  funnel: FunnelOverview;
}

function pct(n: number, d: number): string {
  if (d <= 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export function FunnelPanel({ funnel }: Props) {
  const { t } = useTranslation();
  const { overall, bySource } = funnel;

  const hasData =
    overall.landings > 0 ||
    overall.quizStarts > 0 ||
    overall.captures > 0 ||
    overall.savedForLater > 0;

  // Top-of-funnel starts collecting the moment the beacon ships; older leads have
  // no landing/start rows, so captures can exceed landings for a while.
  const warmingUp = overall.landings === 0 && overall.captures > 0;

  // Ordered stages with the step-conversion denominator (prev stage).
  const stages: { key: string; label: string; value: number; prev: number | null }[] = [
    { key: "landing", label: t("funnel.stage_landing"), value: overall.landings, prev: null },
    { key: "start", label: t("funnel.stage_start"), value: overall.quizStarts, prev: overall.landings },
    { key: "capture", label: t("funnel.stage_capture"), value: overall.captures, prev: overall.quizStarts },
    { key: "verified", label: t("funnel.stage_verified"), value: overall.verified, prev: overall.captures },
    { key: "sale", label: t("funnel.stage_sale"), value: overall.sales, prev: overall.verified },
  ];

  const cols: { key: string; label: string; get: (r: FunnelStage) => number }[] = [
    { key: "landings", label: t("funnel.colLandings"), get: (r) => r.landings },
    { key: "start", label: t("funnel.colStart"), get: (r) => r.quizStarts },
    { key: "capture", label: t("funnel.colCapture"), get: (r) => r.captures },
    { key: "verified", label: t("funnel.colVerified"), get: (r) => r.verified },
    { key: "sale", label: t("funnel.colSale"), get: (r) => r.sales },
  ];

  const sourceLabel = (s: string | null) => s ?? t("funnel.sourceOrganic");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{t("funnel.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("funnel.subtitle")}</p>
        </div>
        <span className="text-sm text-muted-foreground">
          {t("funnel.colLandToSale")}:{" "}
          <span className="font-semibold text-foreground">
            {pct(overall.sales, overall.landings)}
          </span>
        </span>
      </div>

      {!hasData ? (
        <p className="rounded-xl border border-border bg-surface-1 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("funnel.empty")}
        </p>
      ) : (
        <>
          {/* Stage tiles with step-conversion */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stages.map((s) => (
              <div key={s.key} className="rounded-xl border border-border bg-surface-1 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
                {s.prev !== null && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span aria-hidden>→ </span>
                    {pct(s.value, s.prev)}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Exit-intent captures — a side channel, broken out so it never inflates
              the quiz-capture step above. */}
          {overall.savedForLater > 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface-1 p-4 sm:max-w-sm">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("funnel.savedForLater")}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{overall.savedForLater}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("funnel.savedForLaterNote")}
              </p>
            </div>
          )}

          {warmingUp && (
            <p className="text-xs text-muted-foreground">{t("funnel.warmingUp")}</p>
          )}

          {/* By-source: desktop table */}
          {bySource.length > 0 && (
            <>
              <p className="pt-1 text-xs uppercase tracking-wider text-muted-foreground">
                {t("funnel.bySource")}
              </p>
              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">{t("funnel.colSource")}</th>
                      {cols.map((c) => (
                        <th key={c.key} className="px-4 py-3 text-right">{c.label}</th>
                      ))}
                      <th className="px-4 py-3 text-right">{t("funnel.colLandToSale")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map((r: FunnelSourceRow) => (
                      <tr key={r.source ?? "organic"} className="border-b border-border/50">
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                          {sourceLabel(r.source)}
                        </td>
                        {cols.map((c) => (
                          <td key={c.key} className="px-4 py-3 text-right tabular-nums">
                            {c.get(r)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {pct(r.sales, r.landings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* By-source: mobile cards */}
              <div className="space-y-3 md:hidden">
                {bySource.map((r: FunnelSourceRow) => (
                  <div
                    key={r.source ?? "organic"}
                    className="rounded-xl border border-border bg-surface-1 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{sourceLabel(r.source)}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("funnel.colLandToSale")}:{" "}
                        <span className="font-semibold text-foreground">
                          {pct(r.sales, r.landings)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                      {cols.map((c) => (
                        <div key={c.key}>
                          <p className="text-sm font-semibold tabular-nums">{c.get(r)}</p>
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

          <p className="text-xs text-muted-foreground">{t("funnel.cplNote")}</p>
        </>
      )}
    </div>
  );
}
