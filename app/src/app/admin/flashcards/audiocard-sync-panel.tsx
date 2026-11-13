"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";

export type SyncRow = {
  group_id: number;
  label: string;
  deck: string;
  status: string;
  changed_since_recording: number[];
  asr_mismatch_count: number;
};

/** Single source (TEST): AudioCards whose audio may no longer match the text of their Flashcards group. */
export function AudiocardSyncPanel({ rows, okCount, total }: { rows: SyncRow[]; okCount: number; total: number }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("flashcardsAdmin.syncTitle")}</h2>
        <span className="text-sm text-muted-foreground">{t("flashcardsAdmin.okCount", { count: okCount })}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t("flashcardsAdmin.syncIntro")}</p>
      {rows.length === 0 ? (
        <p className="text-sm">{t("flashcardsAdmin.allOk", { count: total })}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.group_id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="font-medium break-words">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.deck}</p>
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-medium">{t(`flashcardsAdmin.status.${r.status}`)}</p>
                {r.changed_since_recording.length > 0 && (
                  <p className="text-muted-foreground">
                    {t("flashcardsAdmin.changedCards", { list: r.changed_since_recording.join(", ") })}
                  </p>
                )}
                {r.asr_mismatch_count > 0 && (
                  <p className="text-muted-foreground">{t("flashcardsAdmin.asrCards", { count: r.asr_mismatch_count })}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
