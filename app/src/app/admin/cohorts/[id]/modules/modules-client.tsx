"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import { overrideModuleUnlockDate, resetModuleUnlockDate } from "@/actions/admin";

type ModuleRow = {
  moduleId: number;
  moduleName: string;
  unlockOffsetDays: number;
  unlockDate: string;
  isManualOverride: boolean;
  autoDate: string;
};

interface Props {
  cohortId: number;
  cohortName: string;
  rows: ModuleRow[];
}

const fmt = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR");
};

export function ModulesClient({ cohortId, cohortName, rows }: Props) {
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<ModuleRow | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  function startEdit(row: ModuleRow) {
    setEditingId(row.moduleId);
    setEditDate(row.unlockDate.slice(0, 10));
    setEditError(null);
    setSavedId(null);
  }

  function handleSaveOverride(moduleId: number) {
    if (!editDate) { setEditError(t("errors.validation")); return; }
    setEditError(null);
    startTransition(async () => {
      try {
        await overrideModuleUnlockDate(cohortId, moduleId, editDate);
        setEditingId(null);
        setSavedId(moduleId);
      } catch (e) {
        setEditError(e instanceof Error ? e.message : t("errors.generic"));
      }
    });
  }

  function handleConfirmReset() {
    if (!confirmReset) return;
    startTransition(async () => {
      await resetModuleUnlockDate(cohortId, confirmReset.moduleId);
      setConfirmReset(null);
      setSavedId(confirmReset.moduleId);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("cohorts.modulesTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{cohortName}</p>
      </div>

      <p className="text-sm text-muted-foreground rounded-lg border border-border bg-surface-1 px-4 py-3">
        {t("cohorts.modulesNote")}
      </p>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">{t("cohorts.moduleName")}</th>
              <th className="px-4 py-3">{t("cohorts.unlockDate")}</th>
              <th className="px-4 py-3">{t("cohorts.autoDate")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.moduleId} className="border-b border-border/50 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium">{row.moduleName}</td>
                <td className="px-4 py-3">
                  {editingId === row.moduleId ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="rounded-md border border-border bg-surface-1 px-2 py-1 text-xs outline-none focus:border-brand/50"
                      />
                      {editError && <span className="text-xs text-red-500">{editError}</span>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{fmt(row.unlockDate.slice(0, 10))}</span>
                      {row.isManualOverride && (
                        <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-xs">
                          {t("cohorts.manualOverrideLabel")}
                        </span>
                      )}
                      {savedId === row.moduleId && (
                        <span className="text-xs text-green-600 dark:text-green-400">{t("common.success")}</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{fmt(row.autoDate)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    {editingId === row.moduleId ? (
                      <>
                        <button
                          onClick={() => handleSaveOverride(row.moduleId)}
                          disabled={isPending}
                          className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
                        >
                          {isPending ? t("common.loading") : t("common.save")}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditError(null); }}
                          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {t("common.cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(row)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors"
                        >
                          {t("common.edit")}
                        </button>
                        {row.isManualOverride && (
                          <button
                            onClick={() => setConfirmReset(row)}
                            className="rounded-md px-2.5 py-1 text-xs text-brand hover:bg-brand/10 transition-colors"
                          >
                            {t("cohorts.resetToAuto")}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={confirmReset !== null}
        title={t("cohorts.resetToAutoTitle")}
        description={
          <p>{t("cohorts.resetToAutoDesc", {
            module: confirmReset?.moduleName ?? "",
            date: confirmReset ? fmt(confirmReset.autoDate) : "",
          })}</p>
        }
        confirmLabel={t("cohorts.resetToAuto")}
        isPending={isPending}
        onConfirm={handleConfirmReset}
        onCancel={() => setConfirmReset(null)}
      />
    </div>
  );
}
