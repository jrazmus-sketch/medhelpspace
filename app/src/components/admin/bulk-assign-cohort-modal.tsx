"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Loader2, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: (cohort: string) => Promise<void>;
}

// Slugs must match leads_target_cohort_check / VALID_TARGET_COHORTS. NB: the
// 2027.2 turma has NO hyphen before the final 2 ('revalida-20272') — the prior
// 'revalida-2027-2' here failed the DB constraint, so assigning 2027.2 never worked.
const COHORTS = [
  { slug: "revalida-2026-2", label: "2026.2" },
  { slug: "revalida-2027-1", label: "2027.1" },
  { slug: "revalida-20272", label: "2027.2" },
];

export function BulkAssignCohortModal({ isOpen, onClose, selectedCount, onConfirm }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!selected) return;

    setIsLoading(true);
    setError(null);

    try {
      await onConfirm(selected);
      onClose();
    } catch (err) {
      console.error("Bulk assign cohort error:", err);
      setError(t("leads.bulkAssignCohortError") ?? "Failed to assign cohort");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface-1 p-6 shadow-lg mx-4">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 hover:bg-surface-2 rounded-lg transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold mb-1">{t("leads.bulkAssignCohortTitle")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            selectedCount === 1
              ? "leads.bulkAssignCohortSubtitleOne"
              : "leads.bulkAssignCohortSubtitleOther",
            { count: selectedCount },
          )}
        </p>

        <div className="space-y-2 mb-6">
          {COHORTS.map((cohort) => (
            <label
              key={cohort.slug}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/30 p-3 cursor-pointer hover:bg-surface-2/60 transition-colors"
            >
              <input
                type="radio"
                name="cohort"
                value={cohort.slug}
                checked={selected === cohort.slug}
                onChange={(e) => setSelected(e.target.value)}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium text-sm">{cohort.label}</div>
                <div className="text-xs text-muted-foreground">{cohort.slug}</div>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-4 rounded-lg bg-red-500/10 p-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-2/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              t("leads.bulkAssignCohortConfirm")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
