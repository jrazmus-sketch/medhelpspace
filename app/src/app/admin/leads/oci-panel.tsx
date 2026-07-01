"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { exportOciConversions, markOciUploaded } from "@/actions/oci";
import type { OciReadyCounts } from "@/lib/admin/oci";

interface Props {
  counts: OciReadyCounts;
}

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `medhelpspace-oci-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function OciPanel({ counts }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [downloaded, setDownloaded] = useState<{
    verifiedIds: string[];
    purchaseIds: string[];
    rowCount: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const totalReady = counts.verified + counts.purchase;

  function onDownload() {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await exportOciConversions();
        if (res.rowCount === 0) {
          setErr(t("oci.readyNone"));
          return;
        }
        downloadCsv(res.csv);
        setDownloaded({
          verifiedIds: res.verifiedIds,
          purchaseIds: res.purchaseIds,
          rowCount: res.rowCount,
        });
      } catch {
        setErr(t("oci.error"));
      }
    });
  }

  function onMark() {
    if (!downloaded) return;
    setErr(null);
    startTransition(async () => {
      try {
        await markOciUploaded({
          verifiedIds: downloaded.verifiedIds,
          purchaseIds: downloaded.purchaseIds,
        });
        setDownloaded(null);
        router.refresh();
      } catch {
        setErr(t("oci.error"));
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-2xl border border-border bg-surface-1 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t("oci.title")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("oci.subtitle")}</p>
          </div>
          {totalReady > 0 && !downloaded && (
            <button
              onClick={onDownload}
              disabled={pending}
              className="min-h-[44px] rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? t("oci.building") : t("oci.download")}
            </button>
          )}
        </div>

        {totalReady === 0 && !downloaded ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("oci.readyNone")}</p>
        ) : !downloaded ? (
          <p className="mt-3 text-sm">
            {t("oci.ready", { verified: counts.verified, purchase: counts.purchase })}
          </p>
        ) : (
          <div className="mt-4 space-y-3 rounded-xl border border-brand/20 bg-brand-muted p-4">
            <p className="text-sm font-medium">
              {t("oci.rowsIncluded", { count: downloaded.rowCount })}
            </p>
            <p className="text-sm text-muted-foreground">{t("oci.afterDownload")}</p>
            <button
              onClick={onMark}
              disabled={pending}
              className="min-h-[44px] rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? t("oci.marking") : t("oci.markUploaded")}
            </button>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-500">{err}</p>}
        <p className="mt-3 text-xs text-muted-foreground">{t("oci.help")}</p>
      </div>
    </div>
  );
}
