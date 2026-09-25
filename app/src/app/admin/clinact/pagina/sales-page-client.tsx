"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Eye, EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveClinactSections, setClinactPagePublished } from "@/actions/clinact-page";

type Section = { key: string; visible: boolean; locked: boolean };

export function SalesPageClient({
  published,
  canPublish,
  sections: initial,
}: {
  published: boolean;
  canPublish: boolean;
  sections: Section[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(sections) !== JSON.stringify(saved);

  function move(i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
    setNotice(null);
  }

  function toggle(i: number) {
    if (sections[i].locked) return;
    setSections(sections.map((s, k) => (k === i ? { ...s, visible: !s.visible } : s)));
    setNotice(null);
  }

  function save() {
    startTransition(async () => {
      const res = await saveClinactSections(sections.map(({ key, visible }) => ({ key, visible })));
      if (res.ok) {
        setSaved(sections);
        setNotice({ tone: "ok", text: t("clinact.page.saved") });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: t(`clinact.page.errors.${res.error}`) });
      }
    });
  }

  function publish(next: boolean) {
    startTransition(async () => {
      const res = await setClinactPagePublished(next);
      setConfirming(false);
      if (res.ok) {
        setNotice({ tone: "ok", text: t(next ? "clinact.page.publishedNow" : "clinact.page.unpublishedNow") });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: t(`clinact.page.errors.${res.error}`) });
      }
    });
  }

  const iconButton =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/admin/clinact" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("clinact.title")}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">{t("clinact.page.title")}</h1>
            <p className="max-w-[60ch] text-sm text-muted-foreground">{t("clinact.page.subtitle")}</p>
          </div>
          <a
            href="/clinact"
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium hover:bg-accent"
          >
            <ExternalLink className="h-4 w-4" /> {t("clinact.page.view")}
          </a>
        </div>
      </div>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg border p-3 text-sm",
            notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {/* Publish gate. Her decision 6: public only once the whole flow works. */}
      <section className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{t("clinact.page.visibility")}</h2>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              published
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
            )}
          >
            {t(published ? "clinact.page.isPublished" : "clinact.page.isUnpublished")}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(published ? "clinact.page.publishedHelp" : "clinact.page.unpublishedHelp")}
        </p>

        {!canPublish ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("clinact.page.publishSuperOnly")}</p>
        ) : confirming ? (
          <div className="mt-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">
              {t(published ? "clinact.page.confirmUnpublish" : "clinact.page.confirmPublish")}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={pending}
                onClick={() => publish(!published)}
                className={cn(
                  "min-h-11 rounded-lg px-4 text-sm font-medium disabled:opacity-60",
                  published ? "bg-destructive text-white" : "bg-brand text-brand-fg",
                )}
              >
                {t(published ? "clinact.page.unpublishYes" : "clinact.page.publishYes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium"
              >
                {t("clinact.page.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setConfirming(true);
            }}
            className={cn(
              "mt-3 min-h-11 w-full rounded-lg px-4 text-sm font-medium sm:w-auto",
              published ? "border border-destructive/50 text-destructive" : "bg-brand text-brand-fg",
            )}
          >
            {t(published ? "clinact.page.unpublish" : "clinact.page.publish")}
          </button>
        )}
      </section>

      {/* Sections: order + visibility. Copy is edited on the page itself. */}
      <section className="rounded-xl border border-border bg-surface-1">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">{t("clinact.page.sectionsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("clinact.page.sectionsHelp")}</p>
        </div>
        <ol className="divide-y divide-border">
          {sections.map((s, i) => (
            <li key={s.key} className={cn("flex items-center gap-1 px-2 py-1.5 sm:gap-2 sm:px-4", !s.visible && "bg-muted/40")}>
              <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1 pl-1">
                <p className={cn("text-sm font-medium leading-snug", !s.visible && "text-muted-foreground line-through")}>
                  {t(`clinact.page.sections.${s.key}`, { defaultValue: s.key })}
                </p>
                {s.locked ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" /> {t("clinact.page.locked")}
                  </p>
                ) : !s.visible ? (
                  <p className="text-xs text-muted-foreground">{t("clinact.page.hidden")}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => toggle(i)}
                disabled={s.locked}
                aria-pressed={s.visible}
                aria-label={t(s.visible ? "clinact.page.hide" : "clinact.page.show")}
                title={t(s.visible ? "clinact.page.hide" : "clinact.page.show")}
                className={cn(iconButton, "disabled:opacity-40")}
              >
                {s.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={t("clinact.page.moveUp")}
                className={cn(iconButton, "disabled:opacity-30")}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === sections.length - 1}
                aria-label={t("clinact.page.moveDown")}
                className={cn(iconButton, "disabled:opacity-30")}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={save}
            className="min-h-11 rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg disabled:opacity-50"
          >
            {pending ? t("clinact.page.saving") : t("clinact.page.save")}
          </button>
          {dirty ? (
            <button
              type="button"
              onClick={() => {
                setSections(saved);
                setNotice(null);
              }}
              className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium"
            >
              {t("clinact.page.discard")}
            </button>
          ) : null}
          {dirty ? <p className="text-sm text-muted-foreground">{t("clinact.page.unsaved")}</p> : null}
        </div>
      </section>
    </div>
  );
}
