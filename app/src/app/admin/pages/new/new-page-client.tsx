"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPage, checkSlugAvailable } from "@/actions/admin";
import { PAGE_TEMPLATES, type PageTemplate } from "@/lib/page-templates";
import type { SpecialtyOption, TrackOption, ModuleOption } from "./page";

const PAGE_VIEWS = [
  "hub",
  "resumos",
  "formula",
  "simulados",
  "flashcards",
  "audiocards",
  "memorecards",
  "medvoice",
] as const;

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken" }
  | { status: "invalid" };

type Props = {
  specialties: SpecialtyOption[];
  tracks: TrackOption[];
  modules: ModuleOption[];
};

export function NewPageClient({ specialties, tracks, modules }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [tile, setTile] = useState<PageTemplate | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" });

  const [specialtyId, setSpecialtyId] = useState<number | "">("");
  const [view, setView] = useState<string>("");
  const [trackId, setTrackId] = useState<number | "">("");
  const [moduleId, setModuleId] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // When the title changes and the user hasn't manually edited the slug, derive it.
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(title));
    }
  }, [title, slugTouched]);

  // Debounced slug uniqueness check.
  const slugCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (slugCheckRef.current) clearTimeout(slugCheckRef.current);
    if (!slug) {
      setSlugState({ status: "idle" });
      return;
    }
    if (!SLUG_REGEX.test(slug)) {
      setSlugState({ status: "invalid" });
      return;
    }
    setSlugState({ status: "checking" });
    slugCheckRef.current = setTimeout(async () => {
      try {
        const result = await checkSlugAvailable(slug);
        setSlugState(result.available ? { status: "available" } : { status: "taken" });
      } catch {
        setSlugState({ status: "idle" });
      }
    }, 350);
    return () => {
      if (slugCheckRef.current) clearTimeout(slugCheckRef.current);
    };
  }, [slug]);

  function selectTile(t: PageTemplate) {
    setTile(t);
    // Apply tile-driven defaults that user can still override.
    if (t.defaultView) setView(t.defaultView);
    else setView("");
    if (t.forceTrackId !== null) setTrackId(t.forceTrackId);
    setStep(2);
  }

  const isSpecialtyRequired =
    !!tile &&
    (tile.dbType === "plain-content" ||
      tile.dbType === "text-lesson" ||
      tile.dbType === "audio-lesson" ||
      tile.dbType === "h5p-quiz" ||
      tile.dbType === "blurb-nav-hub");

  const canSubmit =
    !!tile &&
    title.trim().length > 0 &&
    slug.length > 0 &&
    slugState.status === "available" &&
    (!isSpecialtyRequired || specialtyId !== "") &&
    !submitting;

  async function handleSubmit() {
    if (!tile || !canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await createPage({
        type: tile.dbType,
        title: title.trim(),
        slug: slug.trim(),
        specialty_id: specialtyId === "" ? undefined : Number(specialtyId),
        view: view || undefined,
        track_id: trackId === "" ? undefined : Number(trackId),
        content_module_id: moduleId === "" ? undefined : Number(moduleId),
        notes: notes.trim() || undefined,
      });
      if ("error" in result) {
        if (result.error === "slug_taken") {
          setSlugState({ status: "taken" });
          setSubmitError(t("pageNew.errorSlugTaken"));
        } else {
          setSubmitError(t("pageNew.errorCreate"));
        }
        setSubmitting(false);
        return;
      }
      router.push(`/admin/pages/${result.id}/edit`);
    } catch {
      setSubmitError(t("pageNew.errorCreate"));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/admin/pages"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("pageEdit.backToList")}
          </Link>
          <h1 className="text-2xl font-bold">{t("pageNew.title")}</h1>
        </div>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {t("pageNew.stepOf", { current: step, total: 2 })}
        </span>
      </div>

      {/* Step 1 — type picker */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t("pageNew.step1Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("pageNew.step1Help")}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PAGE_TEMPLATES.map((tileCfg) => {
              const Icon = tileCfg.icon;
              return (
                <button
                  key={tileCfg.key}
                  type="button"
                  onClick={() => selectTile(tileCfg)}
                  className={cn(
                    "group flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-4 text-left",
                    "transition-colors hover:border-brand/60 hover:bg-surface-2",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-base font-semibold">
                      {t(`pageNew.types.${tileCfg.key}.label`)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(`pageNew.types.${tileCfg.key}.description`)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2 — metadata form */}
      {step === 2 && tile && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t("pageNew.step2Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("pageNew.step2Help")}</p>
            <div className="flex items-center gap-2 pt-2 text-sm">
              <span className="text-muted-foreground">{t("pageEdit.pageTypeLabel")}:</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">
                {t(`pageNew.types.${tile.key}.label`)}
              </span>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
            {/* Title */}
            <div className="space-y-1.5">
              <label htmlFor="np-title" className="text-sm font-medium">
                {t("pageNew.fieldTitle")} <span className="text-destructive">*</span>
              </label>
              <input
                id="np-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("pageNew.fieldTitlePlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
                autoFocus
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="np-slug" className="text-sm font-medium">
                  {t("pageNew.fieldSlug")} <span className="text-destructive">*</span>
                </label>
                {slugTouched && (
                  <button
                    type="button"
                    onClick={() => {
                      setSlugTouched(false);
                      setSlug(slugify(title));
                    }}
                    className="text-xs text-brand hover:underline"
                  >
                    {t("pageNew.fieldSlugAuto")}
                  </button>
                )}
              </div>
              <input
                id="np-slug"
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
              />
              <div className="min-h-[1.25rem] text-xs">
                {slugState.status === "checking" && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("pageNew.fieldSlugChecking")}
                  </span>
                )}
                {slugState.status === "available" && (
                  <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                    <Check className="h-3 w-3" />
                    {t("pageNew.fieldSlugAvailable")}
                  </span>
                )}
                {slugState.status === "taken" && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {t("pageNew.fieldSlugTaken")}
                  </span>
                )}
                {slugState.status === "invalid" && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {t("pageNew.fieldSlugInvalid")}
                  </span>
                )}
              </div>
            </div>

            {/* Specialty */}
            <div className="space-y-1.5">
              <label htmlFor="np-specialty" className="text-sm font-medium">
                {t("pageNew.fieldSpecialty")}{" "}
                {isSpecialtyRequired && <span className="text-destructive">*</span>}
              </label>
              <select
                id="np-specialty"
                value={specialtyId}
                onChange={(e) =>
                  setSpecialtyId(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
              >
                <option value="">{t("pageNew.noSpecialty")}</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View */}
            <div className="space-y-1.5">
              <label htmlFor="np-view" className="text-sm font-medium">
                {t("pageNew.fieldView")}
              </label>
              <select
                id="np-view"
                value={view}
                onChange={(e) => setView(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
              >
                <option value="">{t("pageNew.noView")}</option>
                {PAGE_VIEWS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Advanced: Track + Module (hidden by default; tile already sets sane defaults) */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                aria-expanded={advancedOpen}
              >
                {advancedOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {t("pageNew.advanced")}
              </button>

              {advancedOpen && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="np-track" className="text-sm font-medium">
                      {t("pageNew.fieldTrack")}
                    </label>
                    <select
                      id="np-track"
                      value={trackId}
                      onChange={(e) =>
                        setTrackId(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      disabled={tile.forceTrackId !== null}
                      className={cn(
                        "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60",
                        tile.forceTrackId !== null && "opacity-70",
                      )}
                    >
                      <option value="">{t("pageNew.noTrack")}</option>
                      {tracks.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.name}
                        </option>
                      ))}
                    </select>
                    {tile.forceTrackId !== null && (
                      <p className="text-xs text-muted-foreground">
                        {t("pageNew.fieldTrackLocked")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="np-module" className="text-sm font-medium">
                      {t("pageNew.fieldModule")}
                    </label>
                    <select
                      id="np-module"
                      value={moduleId}
                      onChange={(e) =>
                        setModuleId(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
                    >
                      <option value="">{t("pageNew.noModule")}</option>
                      {modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label htmlFor="np-notes" className="text-sm font-medium">
                {t("pageNew.fieldNotes")}
              </label>
              <textarea
                id="np-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={t("pageNew.fieldNotesPlaceholder")}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("pageNew.back")}
            </button>

            <div className="flex items-center gap-3">
              {submitError && (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {submitError}
                </span>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  "rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg transition-opacity",
                  canSubmit ? "hover:opacity-90" : "opacity-50 cursor-not-allowed",
                )}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("pageNew.creating")}
                  </span>
                ) : (
                  t("pageNew.submit")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
