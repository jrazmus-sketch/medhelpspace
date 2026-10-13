"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createClinactSpecialty,
  createClinactTopic,
  deleteClinactSpecialty,
  deleteClinactTopic,
  moveClinactSpecialty,
  updateClinactSpecialty,
  updateClinactTopic,
  type TaxonomyResult,
} from "@/actions/clinact-taxonomy";
import type { TaxonomySpecialtyRow, TaxonomyTopicRow } from "@/lib/clinact/queries";

const inputCls =
  "min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";
const btn = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-50";
const btnGhost = `${btn} border border-border hover:bg-accent`;
const btnPrimary = `${btn} bg-brand text-brand-fg hover:opacity-90`;
const iconBtn =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30";

export function TaxonomyClient({ specialties, topics }: { specialties: TaxonomySpecialtyRow[]; topics: TaxonomyTopicRow[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [newSpecialty, setNewSpecialty] = useState("");

  /** Run one action; on success refresh the server data, otherwise say why in Portuguese/English. */
  function run(action: () => Promise<TaxonomyResult>, okText: string, after?: () => void) {
    setNotice(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setNotice({ tone: "ok", text: okText });
        after?.();
        router.refresh();
      } else {
        setNotice({ tone: "error", text: t(`clinact.taxonomy.errors.${res.error}`) });
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/admin/clinact" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("clinact.title")}
        </Link>
        <h1 className="text-xl font-bold">{t("clinact.taxonomy.title")}</h1>
        <p className="max-w-[62ch] text-sm text-muted-foreground">{t("clinact.taxonomy.subtitle")}</p>
      </div>

      <ul className="space-y-1.5 rounded-xl border border-border bg-surface-1 p-4 text-sm text-muted-foreground">
        <li>{t("clinact.taxonomy.ruleEmpty")}</li>
        <li>{t("clinact.taxonomy.ruleInactive")}</li>
        <li>{t("clinact.taxonomy.ruleDelete")}</li>
        <li>{t("clinact.taxonomy.ruleSlug")}</li>
      </ul>

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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("clinact.taxonomy.specialties")}</h2>
        <ul className="space-y-2">
          {specialties.map((s, i) => (
            <SpecialtyItem
              key={s.id}
              specialty={s}
              topics={topics.filter((tp) => tp.specialty_id === s.id)}
              first={i === 0}
              last={i === specialties.length - 1}
              pending={pending}
              run={run}
            />
          ))}
        </ul>
        <form
          className="flex gap-2 rounded-xl border border-dashed border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createClinactSpecialty(newSpecialty), t("clinact.taxonomy.created"), () => setNewSpecialty(""));
          }}
        >
          <input
            value={newSpecialty}
            onChange={(e) => setNewSpecialty(e.target.value)}
            placeholder={t("clinact.taxonomy.newSpecialty")}
            aria-label={t("clinact.taxonomy.newSpecialty")}
            className={inputCls}
          />
          <button type="submit" disabled={pending || newSpecialty.trim().length < 2} className={btnPrimary} aria-label={t("clinact.taxonomy.add")}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t("clinact.taxonomy.add")}</span>
          </button>
        </form>
      </section>
    </div>
  );
}

function SpecialtyItem({
  specialty: s,
  topics,
  first,
  last,
  pending,
  run,
}: {
  specialty: TaxonomySpecialtyRow;
  topics: TaxonomyTopicRow[];
  first: boolean;
  last: boolean;
  pending: boolean;
  run: (action: () => Promise<TaxonomyResult>, okText: string, after?: () => void) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(s.name);
  const [newTopic, setNewTopic] = useState("");
  const canDelete = s.cases === 0 && topics.length === 0;

  return (
    // The arrows sit OVER the summary row (absolute), so an expanded specialty
    // gets the card's full width — beside the details they squeezed it on a phone.
    <li className={cn("relative rounded-xl border border-border bg-surface-1", !s.active && "border-dashed")}>
      <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 py-2 pl-3 pr-[100px] [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate font-medium", !s.active && "text-muted-foreground")}>{s.name}</span>
              <span className="block text-xs text-muted-foreground">
                {t("clinact.taxonomy.counts", { cases: s.cases, published: s.published, topics: topics.length })}
              </span>
            </span>
            {!s.active ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("clinact.taxonomy.inactive")}</span>
            ) : s.published === 0 ? (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                {t("clinact.taxonomy.soon")}
              </span>
            ) : null}
          </summary>

          <div className="space-y-4 border-t border-border px-3 pb-4 pt-3">
            <form
              className="space-y-1"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => updateClinactSpecialty(s.id, { name }), t("clinact.taxonomy.saved"));
              }}
            >
              <label className="block text-xs font-medium text-muted-foreground" htmlFor={`sp-${s.id}`}>
                {t("clinact.taxonomy.name")}
              </label>
              <div className="flex gap-2">
                <input id={`sp-${s.id}`} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                <button type="submit" disabled={pending || name.trim() === s.name || name.trim().length < 2} className={btnGhost}>
                  {t("clinact.taxonomy.save")}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("clinact.taxonomy.address")} <code>/clinact/treinar/{s.slug}</code>
              </p>
            </form>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => updateClinactSpecialty(s.id, { active: !s.active }), t("clinact.taxonomy.saved"))}
                className={btnGhost}
              >
                {s.active ? t("clinact.taxonomy.deactivate") : t("clinact.taxonomy.activate")}
              </button>
              {canDelete ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t("clinact.taxonomy.confirmDelete", { name: s.name }))) {
                      run(() => deleteClinactSpecialty(s.id), t("clinact.taxonomy.deleted"));
                    }
                  }}
                  className={cn(btnGhost, "text-destructive")}
                >
                  <Trash2 className="h-4 w-4" /> {t("clinact.taxonomy.delete")}
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("clinact.taxonomy.topics")}</h3>
              {topics.length ? (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
                  {topics.map((tp) => (
                    <TopicRow key={tp.id} topic={tp} pending={pending} run={run} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{t("clinact.taxonomy.noTopics")}</p>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => createClinactTopic(s.id, newTopic), t("clinact.taxonomy.created"), () => setNewTopic(""));
                }}
              >
                <input
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder={t("clinact.taxonomy.newTopic")}
                  aria-label={t("clinact.taxonomy.newTopic")}
                  className={inputCls}
                />
                <button type="submit" disabled={pending || newTopic.trim().length < 2} className={btnGhost} aria-label={t("clinact.taxonomy.add")}>
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t("clinact.taxonomy.add")}</span>
                </button>
              </form>
            </div>
          </div>
      </details>
      <div className="absolute right-1 top-1.5 flex">
        <button
          type="button"
          disabled={pending || first}
          onClick={() => run(() => moveClinactSpecialty(s.id, -1), t("clinact.taxonomy.saved"))}
          className={iconBtn}
          aria-label={t("clinact.taxonomy.moveUp")}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={pending || last}
          onClick={() => run(() => moveClinactSpecialty(s.id, 1), t("clinact.taxonomy.saved"))}
          className={iconBtn}
          aria-label={t("clinact.taxonomy.moveDown")}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function TopicRow({
  topic: tp,
  pending,
  run,
}: {
  topic: TaxonomyTopicRow;
  pending: boolean;
  run: (action: () => Promise<TaxonomyResult>, okText: string, after?: () => void) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(tp.name);
  return (
    <li className="space-y-2 p-2.5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateClinactTopic(tp.id, { name }), t("clinact.taxonomy.saved"));
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("clinact.taxonomy.topicName")}
          className={cn(inputCls, !tp.active && "text-muted-foreground line-through")}
        />
        <button type="submit" disabled={pending || name.trim() === tp.name || name.trim().length < 2} className={btnGhost}>
          {t("clinact.taxonomy.save")}
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t("clinact.taxonomy.topicCounts", { cases: tp.cases, published: tp.published })}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => updateClinactTopic(tp.id, { active: !tp.active }), t("clinact.taxonomy.saved"))}
          className="inline-flex min-h-11 items-center font-medium text-foreground hover:underline disabled:opacity-50"
        >
          {tp.active ? t("clinact.taxonomy.deactivate") : t("clinact.taxonomy.activate")}
        </button>
        {tp.cases === 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("clinact.taxonomy.confirmDelete", { name: tp.name }))) {
                run(() => deleteClinactTopic(tp.id), t("clinact.taxonomy.deleted"));
              }
            }}
            className="inline-flex min-h-11 items-center gap-1 font-medium text-destructive hover:underline disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("clinact.taxonomy.delete")}
          </button>
        ) : null}
      </div>
    </li>
  );
}
