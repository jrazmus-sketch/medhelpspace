"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Loader2, X } from "lucide-react";

// Step picker for the bulk drip send (/admin/leads Phase 3A). `null` = each
// lead's own next step; 0–4 = a specific template. The step numbers + template
// kinds mirror STEP_TO_KIND in actions/leads.ts (aligned with the lead-drip
// cron); lead-final (step 5) is retired and deliberately not offered.
interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: (step: number | null) => Promise<void>;
}

// kindKey indexes leads.emailKind.* for the human label; kind is shown raw so
// the admin can cross-check against the email-templates editor.
const STEP_OPTIONS: { step: number; kind: string; kindKey: string }[] = [
  { step: 0, kind: "lead-d0", kindKey: "d0" },
  { step: 1, kind: "lead-d1", kindKey: "d1" },
  { step: 2, kind: "lead-d2", kindKey: "d2" },
  { step: 3, kind: "lead-d4", kindKey: "d4" },
  { step: 4, kind: "lead-d7", kindKey: "d7" },
];

export function BulkResendModal({ isOpen, onClose, selectedCount, onConfirm }: Props) {
  const { t } = useTranslation();
  // "next" = per-lead next step; otherwise the specific step number.
  const [selected, setSelected] = useState<"next" | number>("next");
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm(selected === "next" ? null : selected);
      onClose();
    } finally {
      // Errors surface as toolbar messages in the parent (partial failures are
      // per-lead, so the modal itself never blocks on them).
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface-1 p-6 shadow-lg mx-4 max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 hover:bg-surface-2 rounded-lg transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold mb-1">{t("leads.bulkResendTitle")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            selectedCount === 1
              ? "leads.bulkResendSubtitleOne"
              : "leads.bulkResendSubtitleOther",
            { count: selectedCount },
          )}
        </p>

        <div className="space-y-2 mb-6">
          <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/30 p-3 cursor-pointer hover:bg-surface-2/60 transition-colors">
            <input
              type="radio"
              name="drip-step"
              checked={selected === "next"}
              onChange={() => setSelected("next")}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium text-sm">{t("leads.bulkResendStepNext")}</div>
              <div className="text-xs text-muted-foreground">
                {t("leads.bulkResendStepNextHint")}
              </div>
            </div>
          </label>
          {STEP_OPTIONS.map((opt) => (
            <label
              key={opt.step}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/30 p-3 cursor-pointer hover:bg-surface-2/60 transition-colors"
            >
              <input
                type="radio"
                name="drip-step"
                checked={selected === opt.step}
                onChange={() => setSelected(opt.step)}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium text-sm">{t(`leads.emailKind.${opt.kindKey}`)}</div>
                <div className="text-xs text-muted-foreground">{opt.kind}</div>
              </div>
            </label>
          ))}
        </div>

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
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              t("leads.bulkResendConfirm")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
