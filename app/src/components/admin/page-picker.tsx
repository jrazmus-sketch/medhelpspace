"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Search, X, ChevronDown, Loader2, AlertCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchPages,
  getPageSummary,
  type PageSearchResult,
} from "@/actions/page-search";
import { createPageQuick } from "@/actions/admin";
import {
  PAGE_TEMPLATES,
  templateByKey,
  type TileKey,
} from "@/lib/page-templates";

/**
 * Context that enables the inline "Create new" branch of the picker. When
 * provided, the modal offers a second tab that creates a draft page (inheriting
 * this specialty + a suggested template) and links it in one step — no trip to
 * `/admin/pages/new`. Omit it to keep the picker search-only.
 */
export type CreateContext = {
  specialtyId: number | null;
  specialtyName?: string | null;
  defaultTemplate: TileKey;
};

const PAGE_TYPES = [
  "plain-content",
  "text-lesson",
  "audio-lesson",
  "h5p-quiz",
  "blurb-nav-hub",
  "navigation-toggle",
] as const;

const TYPE_COLORS: Record<string, string> = {
  "plain-content": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "text-lesson": "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "h5p-quiz": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "blurb-nav-hub": "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  "audio-lesson": "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  "navigation-toggle": "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  default: "bg-surface-2 text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  "h5p-quiz": "quiz",
};

type SpecialtyOption = { id: number; name: string };

interface PagePickerProps {
  value: number | null;
  onChange: (pageId: number | null) => void;
  /** Optional preview cached by the parent. Saves the picker a getPageSummary round-trip. */
  preview?: { id: number; title: string; slug: string; type: string } | null;
  specialties?: SpecialtyOption[];
  disabled?: boolean;
  /** Optional className applied to the trigger button. */
  className?: string;
  /** When set, enables the inline "Create new" tab. */
  createContext?: CreateContext | null;
  /** Trigger label shown when nothing is selected. Defaults to "Choose page…". */
  placeholder?: string;
}

export function PagePicker({
  value,
  onChange,
  preview,
  specialties = [],
  disabled = false,
  className,
  createContext = null,
  placeholder,
}: PagePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<{
    id: number;
    title: string;
    slug: string;
    type: string;
  } | null>(preview ?? null);

  // Sync summary when external value changes (initial mount, after onChange, etc.)
  useEffect(() => {
    if (value === null) {
      setSummary(null);
      return;
    }
    if (summary?.id === value) return;
    if (preview && preview.id === value) {
      setSummary(preview);
      return;
    }
    let cancelled = false;
    getPageSummary(value)
      .then((res) => {
        if (!cancelled && res) {
          setSummary({ id: res.id, title: res.title, slug: res.slug, type: res.type });
        }
      })
      .catch(() => {
        // Silent — the trigger will show the fallback ID.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handlePick(pageId: number, row: PageSearchResult) {
    setSummary({ id: row.id, title: row.title, slug: row.slug, type: row.type });
    onChange(pageId);
    setOpen(false);
  }

  function handleClear() {
    setSummary(null);
    onChange(null);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={summary ? `${summary.title} — ${t("pagePicker.choosePage")}` : t("pagePicker.choosePage")}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm outline-none transition-colors hover:border-brand/40 focus:border-brand/60 focus:ring-1 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {summary ? (
          <>
            <span className="min-w-0 flex-1 truncate">{summary.title}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                TYPE_COLORS[summary.type] ?? TYPE_COLORS.default,
              )}
            >
              {TYPE_LABELS[summary.type] ?? summary.type}
            </span>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">
            {placeholder ?? t("pagePicker.choosePage")}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <PagePickerModal
          initialValue={value}
          specialties={specialties}
          createContext={createContext}
          onPick={handlePick}
          onClear={handleClear}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface PagePickerModalProps {
  initialValue: number | null;
  specialties: SpecialtyOption[];
  createContext: CreateContext | null;
  onPick: (pageId: number, row: PageSearchResult) => void;
  onClear: () => void;
  onClose: () => void;
}

function PagePickerModal({
  initialValue,
  specialties,
  createContext,
  onPick,
  onClear,
  onClose,
}: PagePickerModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("all");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [sort, setSort] = useState<"recent" | "alpha">("recent");
  const [results, setResults] = useState<PageSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Create-tab state ──
  const [tplKey, setTplKey] = useState<TileKey>(
    createContext?.defaultTemplate ?? "plain-content",
  );
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    if (!createContext) return;
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const tpl = templateByKey(tplKey);
      const res = await createPageQuick({
        type: tpl.dbType,
        title,
        specialtyId: createContext.specialtyId,
        view: tpl.defaultView || null,
        trackId: tpl.forceTrackId,
      });
      if ("error" in res) {
        setCreateError(t("pagePicker.createError"));
        setCreating(false);
        return;
      }
      // Link it immediately — onPick closes the modal via the parent handler.
      onPick(res.id, {
        id: res.id,
        title: res.title,
        slug: res.slug,
        type: res.type,
        specialty_id: createContext.specialtyId,
        specialty_name: createContext.specialtyName ?? null,
        updated_at: null,
      });
    } catch {
      setCreateError(t("pagePicker.createError"));
      setCreating(false);
    }
  }

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounced search — refetch when params change
  useEffect(() => {
    const handle = setTimeout(() => {
      setError(null);
      startTransition(async () => {
        try {
          const res = await searchPages({
            query: query.trim() || undefined,
            type: type === "all" ? undefined : type,
            specialtyId:
              specialtyId === "" ? undefined : Number(specialtyId),
            includeDrafts,
            sort,
          });
          setResults(res);
        } catch (e) {
          setError(e instanceof Error ? e.message : t("errors.generic"));
        }
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, type, specialtyId, includeDrafts, sort, t]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-border bg-background shadow-xl sm:h-[80vh] sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <h3 className="text-base font-semibold">{t("pagePicker.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs — only when inline creation is available */}
        {createContext && (
          <div className="flex gap-1 border-b border-border px-4 pt-2">
            <button
              type="button"
              onClick={() => setMode("search")}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors",
                mode === "search"
                  ? "border-b-2 border-brand text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t("pagePicker.tabSearch")}
            </button>
            <button
              type="button"
              onClick={() => setMode("create")}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors",
                mode === "create"
                  ? "border-b-2 border-brand text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t("pagePicker.tabCreate")}
            </button>
          </div>
        )}

        {mode === "search" ? (
          <>
        {/* Search input */}
        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("pagePicker.searchPlaceholder")}
              className="w-full rounded-lg border border-border bg-surface-1 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
            />
          </div>

          {/* Filters row */}
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-xs outline-none focus:border-brand/60 sm:flex-none"
              aria-label={t("pagePicker.filterByType")}
            >
              <option value="all">{t("pagePicker.allTypes")}</option>
              {PAGE_TYPES.map((tp) => (
                <option key={tp} value={tp}>
                  {TYPE_LABELS[tp] ?? tp}
                </option>
              ))}
            </select>

            <select
              value={specialtyId}
              onChange={(e) => setSpecialtyId(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-xs outline-none focus:border-brand/60 sm:flex-none"
              aria-label={t("pagePicker.filterBySpecialty")}
            >
              <option value="">{t("pagePicker.allSpecialties")}</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "recent" | "alpha")}
              className="flex-1 rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-xs outline-none focus:border-brand/60 sm:flex-none"
              aria-label={t("pagePicker.sortBy")}
            >
              <option value="recent">{t("pagePicker.sortRecent")}</option>
              <option value="alpha">{t("pagePicker.sortAlpha")}</option>
            </select>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={includeDrafts}
                onChange={(e) => setIncludeDrafts(e.target.checked)}
                className="h-3.5 w-3.5 accent-brand"
              />
              {t("pagePicker.includeDrafts")}
            </label>
          </div>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isPending && results.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {!error && !isPending && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("pagePicker.noResults")}
            </div>
          )}

          <ul className="divide-y divide-border">
            {results.map((row) => {
              const isCurrent = row.id === initialValue;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onPick(row.id, row)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 focus:bg-accent/60 focus:outline-none",
                      isCurrent && "bg-brand/5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {row.title}
                        </span>
                        {isCurrent && (
                          <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand">
                            {t("pagePicker.current")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {row.slug}
                      </div>
                      {row.specialty_name && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.specialty_name}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        TYPE_COLORS[row.type] ?? TYPE_COLORS.default,
                      )}
                    >
                      {TYPE_LABELS[row.type] ?? row.type}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {!isPending && results.length === 50 && (
            <div className="px-4 py-3 text-center text-xs text-muted-foreground">
              {t("pagePicker.cappedResults")}
            </div>
          )}
        </div>
          </>
        ) : (
          /* Create-new panel */
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {createContext?.specialtyName
                  ? t("pagePicker.createSpecialtyNote", {
                      specialty: createContext.specialtyName,
                    })
                  : t("pagePicker.createNoSpecialtyNote")}
              </p>

              {/* Template chooser */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("pagePicker.createTemplateLabel")}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {PAGE_TEMPLATES.map((tpl) => {
                    const Icon = tpl.icon;
                    const active = tpl.key === tplKey;
                    return (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => setTplKey(tpl.key)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          active
                            ? "border-brand bg-brand/10 text-foreground"
                            : "border-border bg-surface-1 text-muted-foreground hover:border-brand/40",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {t(`pageNew.types.${tpl.key}.label`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label
                  htmlFor="pp-new-title"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t("pagePicker.createTitleLabel")}
                </label>
                <input
                  id="pp-new-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  placeholder={t("pagePicker.createTitlePlaceholder")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
                />
              </div>

              {createError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {createError}
                </div>
              )}

              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-opacity",
                  !newTitle.trim() || creating
                    ? "cursor-not-allowed opacity-50"
                    : "hover:opacity-90",
                )}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {creating ? t("pagePicker.creating") : t("pagePicker.createButton")}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("pagePicker.clearSelection")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
