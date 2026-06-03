"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LinkIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addCardToHub,
  removeNavItem,
  moveNavItemToHub,
  createPageQuick,
} from "@/actions/admin";
import { PagePicker, type CreateContext } from "@/components/admin/page-picker";
import { defaultTemplateForHubView } from "@/lib/page-templates";
import type { SpecialtyGroup, HubRow, HubCardRow, OrphanRow } from "./page";

const TYPE_COLORS: Record<string, string> = {
  "plain-content": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "text-lesson":   "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "h5p-quiz":      "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "blurb-nav-hub": "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  "audio-lesson":  "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  default:         "bg-surface-2 text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = { "h5p-quiz": "quiz" };

// View options offered when creating a hub inline. Mirrors the live-site IA.
const NEW_HUB_VIEWS = [
  "hub",
  "resumos",
  "formula",
  "simulados",
  "medvoice",
  "audiocards",
  "flashcards",
  "memorecards",
] as const;

function typeLabel(t: string) {
  return TYPE_LABELS[t] ?? t;
}

function liveUrlForHub(hub: HubRow): string {
  return hub.specialty_slug ? `/app/${hub.specialty_slug}/${hub.slug}` : `/app/${hub.slug}`;
}

function liveUrlForCard(hub: HubRow, card: HubCardRow): string | null {
  if (!card.target_slug) return null;
  return hub.specialty_slug
    ? `/app/${hub.specialty_slug}/${card.target_slug}`
    : `/app/${card.target_slug}`;
}

function liveUrlForOrphan(orphan: OrphanRow): string {
  return orphan.specialty_slug
    ? `/app/${orphan.specialty_slug}/${orphan.slug}`
    : `/app/${orphan.slug}`;
}

type HubOption = { id: number; title: string; view: string | null };
type GroupedHubOptions = { name: string; hubs: HubOption[] }[];

type Props = {
  groups: SpecialtyGroup[];
  orphans: OrphanRow[];
  orphanTotal: number;
  orphanCap: number;
};

export function HubsClient({ groups, orphans, orphanTotal, orphanCap }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [orphansOpen, setOrphansOpen] = useState(false);
  const [newHubFor, setNewHubFor] = useState<number | null>(null);

  // Hub options for the move/adopt pickers, grouped by specialty.
  const groupedHubOptions: GroupedHubOptions = groups.map((g) => ({
    name: g.name,
    hubs: g.hubs.map((h) => ({ id: h.id, title: h.title, view: h.view })),
  }));
  const specialtyOptions = groups.map((g) => ({ id: g.id, name: g.name }));

  // Runs a server action inside a transition, then refreshes server data.
  // Resolves true on success so callers can close inline forms.
  function runAction(
    action: () => Promise<{ ok: true } | { error: string } | { id: number } | unknown>,
  ): Promise<boolean> {
    setActionError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          const res = await action();
          if (res && typeof res === "object" && "error" in res) {
            setActionError(t("hubs.actionFailed"));
            resolve(false);
            return;
          }
          router.refresh();
          resolve(true);
        } catch {
          setActionError(t("hubs.actionFailed"));
          resolve(false);
        }
      });
    });
  }

  const overflow = orphanTotal - orphans.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page heading */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("hubs.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("hubs.subtitle")}</p>
      </header>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Orphans block */}
      <section className="rounded-xl border border-border bg-surface-1">
        <button
          type="button"
          onClick={() => setOrphansOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/40"
          aria-expanded={orphansOpen}
        >
          <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t("hubs.orphansTitle")}</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {orphanTotal}
          </span>
          <span className="ml-auto text-muted-foreground">
            {orphansOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>

        {orphansOpen && (
          <div className="border-t border-border">
            <p className="px-4 py-3 text-xs text-muted-foreground">{t("hubs.orphansHint")}</p>
            {orphans.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-muted-foreground">{t("hubs.orphansEmpty")}</div>
            ) : (
              <ul className="divide-y divide-border">
                {orphans.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{o.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{o.slug}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-medium",
                            TYPE_COLORS[o.type] ?? TYPE_COLORS.default,
                          )}
                        >
                          {typeLabel(o.type)}
                        </span>
                        <span>{o.specialty_name ?? t("hubs.noSpecialty")}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <HubSelect
                        groupedOptions={groupedHubOptions}
                        placeholder={t("hubs.addToHub")}
                        disabled={pending}
                        onPick={(hubId) => runAction(() => addCardToHub(hubId, o.id))}
                      />
                      <Link
                        href={liveUrlForOrphan(o)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={t("hubs.viewOnSite")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        href={`/admin/pages/${o.id}/edit`}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand transition-opacity hover:opacity-80"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("hubs.edit")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {overflow > 0 && (
              <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                +{overflow} —{" "}
                <Link href="/admin/pages?status=published" className="text-brand hover:underline">
                  {t("hubs.orphansShowMore")}
                </Link>
              </div>
            )}
            {overflow === 0 && orphanTotal > orphanCap && (
              <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <Link href="/admin/pages" className="text-brand hover:underline">
                  {t("hubs.orphansShowMore")}
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Specialty tree */}
      <section className="space-y-6">
        {groups.map((g) => (
          <div key={g.id} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">{g.name}</h2>
              <button
                type="button"
                onClick={() => setNewHubFor((v) => (v === g.id ? null : g.id))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("hubs.newHub")}
              </button>
            </div>

            {newHubFor === g.id && (
              <NewHubForm
                disabled={pending}
                onCancel={() => setNewHubFor(null)}
                onCreate={async (title, view) => {
                  const ok = await runAction(() =>
                    createPageQuick({
                      type: "blurb-nav-hub",
                      title,
                      specialtyId: g.id,
                      view,
                    }),
                  );
                  if (ok) setNewHubFor(null);
                  return ok;
                }}
              />
            )}

            <ul className="divide-y divide-border rounded-xl border border-border bg-surface-1">
              {g.hubs.map((hub) => (
                <HubNode
                  key={hub.id}
                  hub={hub}
                  groupedHubOptions={groupedHubOptions}
                  specialtyOptions={specialtyOptions}
                  specialtyName={g.name}
                  pending={pending}
                  runAction={runAction}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

// ── Hub node (expandable, with its cards) ─────────────────────────────────────

function HubNode({
  hub,
  groupedHubOptions,
  specialtyOptions,
  specialtyName,
  pending,
  runAction,
}: {
  hub: HubRow;
  groupedHubOptions: GroupedHubOptions;
  specialtyOptions: { id: number; name: string }[];
  specialtyName: string;
  pending: boolean;
  runAction: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const createContext: CreateContext = {
    specialtyId: hub.specialty_id,
    specialtyName,
    defaultTemplate: defaultTemplateForHubView(hub.view),
  };

  return (
    <li className="px-4 py-3">
      {/* Header row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          aria-label={open ? t("hubs.collapse") : t("hubs.expand")}
        >
          <span className="shrink-0 text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{hub.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">
                {hub.view && hub.view !== "hub" ? hub.view : t("hubs.viewMain")}
              </span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">
                {t("hubs.cardCount", { count: hub.card_count })}
              </span>
              {hub.status === "draft" && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                  {t("pages.draft").toLowerCase()}
                </span>
              )}
              <span className="font-mono opacity-70">{hub.slug}</span>
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
          <Link
            href={liveUrlForHub(hub)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t("hubs.viewOnSite")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("hubs.viewOnSite")}</span>
          </Link>
          <Link
            href={`/admin/pages/${hub.id}/edit`}
            className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand transition-opacity hover:opacity-80"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("hubs.edit")}
          </Link>
        </div>
      </div>

      {/* Expanded: cards + add */}
      {open && (
        <div className="mt-3 space-y-2 border-l-2 border-border pl-4 sm:ml-2">
          {hub.cards.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("hubs.noCards")}</p>
          )}

          {hub.cards.map((card) => {
            const targetUrl = liveUrlForCard(hub, card);
            const display = card.target_title ?? card.label ?? null;
            return (
              <div
                key={card.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  {display ? (
                    <span className="truncate text-sm">{display}</span>
                  ) : (
                    <span className="text-sm italic text-muted-foreground">
                      {t("hubs.missingTarget")}
                    </span>
                  )}
                  {card.target_type && (
                    <span
                      className={cn(
                        "ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        TYPE_COLORS[card.target_type] ?? TYPE_COLORS.default,
                      )}
                    >
                      {typeLabel(card.target_type)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <HubSelect
                    groupedOptions={groupedHubOptions}
                    excludeHubId={hub.id}
                    placeholder={t("hubs.moveToHub")}
                    disabled={pending}
                    onPick={(targetHubId) =>
                      runAction(() => moveNavItemToHub(card.id, targetHubId))
                    }
                  />
                  {targetUrl && (
                    <Link
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title={t("hubs.viewOnSite")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runAction(() => removeNavItem(card.id))}
                    title={t("hubs.removeCard")}
                    aria-label={t("hubs.removeCard")}
                    className="inline-flex min-h-9 items-center rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add card (link existing or create new) */}
          <div className="pt-1">
            <PagePicker
              value={null}
              placeholder={t("hubs.addCard")}
              specialties={specialtyOptions}
              createContext={createContext}
              disabled={pending}
              onChange={(id) => {
                if (id !== null) runAction(() => addCardToHub(hub.id, id));
              }}
            />
          </div>
        </div>
      )}
    </li>
  );
}

// ── Hub picker (native select grouped by specialty) ───────────────────────────

function HubSelect({
  groupedOptions,
  excludeHubId,
  placeholder,
  disabled,
  onPick,
}: {
  groupedOptions: GroupedHubOptions;
  excludeHubId?: number;
  placeholder: string;
  disabled?: boolean;
  onPick: (hubId: number) => void;
}) {
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (v) onPick(v);
      }}
      aria-label={placeholder}
      className="min-h-9 max-w-[10rem] rounded-md border border-border bg-surface-1 px-2 py-1.5 text-xs text-muted-foreground outline-none focus:border-brand/60 disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {groupedOptions.map((g) => {
        const hubs = g.hubs.filter((h) => h.id !== excludeHubId);
        if (hubs.length === 0) return null;
        return (
          <optgroup key={g.name} label={g.name}>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
                {h.view && h.view !== "hub" ? ` (${h.view})` : ""}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

// ── New hub inline form ───────────────────────────────────────────────────────

function NewHubForm({
  disabled,
  onCancel,
  onCreate,
}: {
  disabled: boolean;
  onCancel: () => void;
  onCreate: (title: string, view: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [view, setView] = useState<string>("hub");

  async function submit() {
    if (!title.trim() || disabled) return;
    await onCreate(title.trim(), view);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-1">
        <input
          type="text"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("hubs.newHubTitlePlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
        />
      </div>
      <div className="space-y-1">
        <label className="sr-only">{t("hubs.newHubViewLabel")}</label>
        <select
          value={view}
          onChange={(e) => setView(e.target.value)}
          aria-label={t("hubs.newHubViewLabel")}
          className="min-h-9 rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-brand/60"
        >
          {NEW_HUB_VIEWS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || disabled}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("hubs.create")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-9 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("hubs.cancel")}
        </button>
      </div>
    </div>
  );
}
