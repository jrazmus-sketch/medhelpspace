"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div
        className="w-full max-w-sm mx-4 rounded-xl border border-border bg-background shadow-xl space-y-4 p-6"
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="text-sm text-muted-foreground space-y-2">{description}</div>
        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50",
              destructive
                ? "bg-red-600 text-white hover:opacity-90"
                : "bg-brand text-brand-fg hover:opacity-90",
            ].join(" ")}
          >
            {isPending ? t("common.loading") : (confirmLabel ?? t("common.confirm"))}
          </button>
        </div>
      </div>
    </div>
  );
}
