"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";

export function FlashcardsHeader({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-2xl font-bold">{t("flashcardsAdmin.title")}</h1>
      <div className="w-fit rounded-xl border border-border bg-surface-1 p-4">
        <p className="text-sm text-muted-foreground">{t("flashcardsAdmin.total")}</p>
        <p className="text-3xl font-bold">{count.toLocaleString("pt-BR")}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
        {t("flashcardsAdmin.editorSoon")}
      </div>
    </>
  );
}
