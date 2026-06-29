"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { updatePageMetadata, updateLessons, savePageBody } from "@/actions/admin";
import type { PageRow, SpecialtyOption, TrackOption, ModuleOption, LessonRow, QuizQuestionRow, FlashcardRow } from "./page";
import type { SectionEditorHandle } from "./section-editor-handle";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { AudioUploader } from "@/components/admin/audio-uploader";
import { QuizEditor } from "./quiz-editor";
import { FlashcardEditor } from "./flashcard-editor";
import { NavItemsEditor } from "./nav-items-editor";
import Link from "next/link";
import { Check, AlertCircle, ChevronDown, ChevronUp, ChevronRight, ArrowUp, ArrowDown, Trash2, Plus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_VIEWS = [
  "hub", "resumos", "formula", "simulados",
  "flashcards", "audiocards", "memorecards",
] as const;

const TYPE_COLORS: Record<string, string> = {
  "plain-content":   "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "text-lesson":     "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "h5p-quiz":        "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "blurb-nav-hub":   "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  "audio-lesson":    "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  default:           "bg-surface-2 text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  "h5p-quiz": "quiz",
};

// Specialty-less pages that are reachable only through a dedicated static route
// under /app (not the [specialty] dynamic route). Keep in sync with the routes
// in src/app/app/.
const STATIC_ROUTE_SLUGS = new Set(["estudo-por-questoes", "medhelp-60d", "revalida-up"]);

// Resolves the page's real member-site URL, mirroring the routing in
// app/[specialty]/[slug] (any page WITH a specialty) and app/[specialty] (a
// specialty-less page only renders at /app/{slug} when it's a top-level hub —
// track, view, or blurb-nav-hub). Legacy specialty-less leaf pages have no
// public URL, so the editor disables the "Ver no site" link instead of pointing
// it at a guaranteed 404.
function memberUrlForPage(
  page: { slug: string; type: string; view: string | null; track_id: number | null },
  specialtySlug: string | null,
): string | null {
  if (specialtySlug) return `/app/${specialtySlug}/${page.slug}`;
  if (page.track_id != null || page.view != null || page.type === "blurb-nav-hub") {
    return `/app/${page.slug}`;
  }
  if (STATIC_ROUTE_SLUGS.has(page.slug)) return `/app/${page.slug}`;
  return null;
}

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

type LessonDraft = {
  id: number | null;
  title: string;
  body_html: string;
  audio_url: string;
  position: number;
  open: boolean;
};

type Props = {
  page: PageRow;
  specialties: SpecialtyOption[];
  tracks: TrackOption[];
  modules: ModuleOption[];
  lessons: LessonRow[];
  quizQuestions: QuizQuestionRow[];
  flashcards: FlashcardRow[];
  navItems: import("./page").NavItemRow[];
  isQuiz: boolean;
  isFlashcards: boolean;
  isHub: boolean;
};

export function PageEditClient({ page, specialties, tracks, modules, lessons, quizQuestions, flashcards, navItems, isQuiz, isFlashcards, isHub }: Props) {
  const { t } = useTranslation();

  const [title, setTitle] = useState(page.title);
  const [slugOverride, setSlugOverride] = useState(page.slug);
  const [slugManual, setSlugManual] = useState(false);
  const slug = slugManual ? slugOverride : slugify(title);
  const originalStatus: "publish" | "draft" = page.status === "publish" ? "publish" : "draft";
  const [status, setStatus] = useState<"publish" | "draft">(originalStatus);
  const [specialtyId, setSpecialtyId] = useState<number | "">(page.specialty_id ?? "");
  const [trackId, setTrackId] = useState<number | "">(page.track_id ?? "");
  const [view, setView] = useState<string>(page.view ?? "");
  const [moduleId, setModuleId] = useState<number | "">(page.content_module_id ?? "");
  const [notes, setNotes] = useState(page.notes ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The active content section (quiz / flashcards / nav items) registers an
  // imperative save() here so the single page-level Save commits it alongside
  // the metadata and lessons — one button instead of one per section.
  const contentRef = useRef<SectionEditorHandle>(null);

  const [lessonDrafts, setLessonDrafts] = useState<LessonDraft[]>(() =>
    lessons.map((l) => ({
      id: l.id,
      title: l.title,
      body_html: l.body_html ?? "",
      audio_url: l.audio_url ?? "",
      position: l.position,
      open: false,
    }))
  );

  // Plain-content pages have one body, stored in the page's first lessons row
  // (what PlainContentRenderer reads). We edit it through a single rich-text
  // field rather than the multi-section lesson UI.
  const [bodyHtml, setBodyHtml] = useState<string>(lessons[0]?.body_html ?? "");

  // Saves everything on the page in one shot: metadata, then lessons (if this
  // is a lesson page), then the active content section. Stops at the first
  // failure so the error points at the right place.
  async function handleSaveAll() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      // 1) Page metadata
      try {
        await updatePageMetadata(page.id, {
          title,
          slug,
          status,
          specialty_id: specialtyId === "" ? null : Number(specialtyId),
          track_id: trackId === "" ? null : Number(trackId),
          view: view === "" ? null : view,
          content_module_id: moduleId === "" ? null : Number(moduleId),
          notes: notes || null,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        setError(msg === "SLUG_TAKEN" ? t("pageEdit.slugTaken") : t("errors.generic"));
        return;
      }

      // 2) Lessons (text-lesson / audio-lesson pages)
      if (showLessons) {
        try {
          await updateLessons(
            page.id,
            lessonDrafts.map((l, i) => ({
              id: l.id,
              title: l.title,
              body_html: l.body_html,
              audio_url: l.audio_url || null,
              position: i + 1,
            })),
          );
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : t("errors.generic"));
          return;
        }
      }

      // 2b) Plain-content body (single lessons row, mirrors the public renderer)
      if (showBody) {
        try {
          await savePageBody(page.id, bodyHtml, title.trim() || page.title);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : t("errors.generic"));
          return;
        }
      }

      // 3) Active content section (quiz / flashcards / nav items). It surfaces
      // its own inline error next to the offending row on failure.
      if (contentRef.current) {
        const ok = await contentRef.current.save();
        if (!ok) {
          setError(t("pageEdit.sectionSaveError"));
          return;
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  // A status change (publish ↔ draft) flips member visibility, so confirm it
  // before saving. Any other edit saves straight away.
  function handleSaveClick() {
    if (status !== originalStatus) {
      setConfirmOpen(true);
      return;
    }
    handleSaveAll();
  }

  function confirmAndSave() {
    setConfirmOpen(false);
    handleSaveAll();
  }

  function addLesson() {
    const maxPos = lessonDrafts.reduce((m, l) => Math.max(m, l.position), 0);
    setLessonDrafts((prev) => [
      ...prev,
      { id: null, title: "", body_html: "", audio_url: "", position: maxPos + 1, open: true },
    ]);
  }

  function removeLesson(idx: number) {
    setLessonDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveLesson(idx: number, dir: "up" | "down") {
    setLessonDrafts((prev) => {
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((l, i) => ({ ...l, position: i + 1 }));
    });
  }

  function patchLesson(idx: number, patch: Partial<LessonDraft>) {
    setLessonDrafts((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const showLessons = page.type === "text-lesson" || page.type === "audio-lesson";
  const showBody = page.type === "plain-content";

  const typeColor = TYPE_COLORS[page.type] ?? TYPE_COLORS.default;

  // Breadcrumb wayfinding: hubs get "Hubs › Specialty › Title"; others "Pages › Title".
  const specialtyForCrumb = specialties.find((s) => s.id === page.specialty_id) ?? null;
  // "Ver no site" resolves the page's real member URL (or null if it has none).
  const liveUrl = memberUrlForPage(page, specialtyForCrumb?.slug ?? null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* Wayfinding header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground"
        >
          {isHub ? (
            <>
              <Link href="/admin/hubs" className="hover:text-foreground">
                {t("pageEdit.crumbHubs")}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              <span>{specialtyForCrumb?.name ?? t("pageEdit.noSpecialty")}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              <span className="truncate font-medium text-foreground" aria-current="page">
                {page.title}
              </span>
            </>
          ) : (
            <>
              <Link href="/admin/pages" className="hover:text-foreground">
                {t("pageEdit.crumbPages")}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              <span className="truncate font-medium text-foreground" aria-current="page">
                {page.title}
              </span>
            </>
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", typeColor)}>
            {TYPE_LABELS[page.type] ?? page.type}
          </span>
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("pageEdit.viewOnSite")}
            </a>
          ) : (
            <span
              title={t("pageEdit.viewOnSiteUnavailable")}
              aria-disabled="true"
              className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-muted-foreground/40"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("pageEdit.viewOnSite")}
            </span>
          )}
        </div>
      </div>

      {/* Card */}
      <div className="rounded-xl border border-border bg-surface-1 divide-y divide-border">

        {/* Title + Slug */}
        <section className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("pageEdit.sectionIdentity")}
          </h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("pageEdit.titleLabel")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              {t("pageEdit.slugLabel")}
              {slugManual && (
                <button
                  onClick={() => { setSlugManual(false); setSlugOverride(slugify(title)); }}
                  className="text-xs text-brand hover:underline"
                >
                  {t("pageEdit.slugReset")}
                </button>
              )}
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlugManual(true); setSlugOverride(e.target.value); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
            />
          </div>
        </section>

        {/* Status */}
        <section className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("pageEdit.sectionStatus")}
          </h2>
          <div className="flex gap-2">
            {(["draft", "publish"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors",
                  status === s
                    ? s === "publish"
                      ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
                      : "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-border text-muted-foreground hover:border-foreground/30",
                )}
              >
                {s === "draft" ? t("pages.draft") : t("pages.published")}
              </button>
            ))}
          </div>
        </section>

        {/* Taxonomy */}
        <section className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("pageEdit.sectionTaxonomy")}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("pageEdit.specialtyLabel")}</label>
              <select
                value={specialtyId}
                onChange={(e) => setSpecialtyId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
              >
                <option value="">{t("pageEdit.noSpecialty")}</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("pageEdit.viewLabel")}</label>
              <select
                value={view}
                onChange={(e) => setView(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
              >
                <option value="">{t("pageEdit.noView")}</option>
                {PAGE_VIEWS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Advanced: Track + Module */}
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
              {t("pageEdit.advanced")}
            </button>

            {advancedOpen && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("pageEdit.trackLabel")}</label>
                  <select
                    value={trackId}
                    onChange={(e) => setTrackId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
                  >
                    <option value="">{t("pageEdit.noTrack")}</option>
                    {tracks.map((tr) => (
                      <option key={tr.id} value={tr.id}>{tr.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("pageEdit.moduleLabel")}</label>
                  <select
                    value={moduleId}
                    onChange={(e) => setModuleId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
                  >
                    <option value="">{t("pageEdit.noModule")}</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("pageEdit.sectionNotes")}
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t("pageEdit.notesPlaceholder")}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
          />
        </section>
      </div>

      {/* ── Plain-content body ───────────────────────────────────────────── */}
      {showBody && (
        <div className="rounded-xl border border-border bg-surface-1">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("pageEdit.sectionContent")}
            </h2>
          </div>
          <div className="p-5">
            <RichTextEditor
              content={bodyHtml}
              onChange={setBodyHtml}
              placeholder={t("pageEdit.contentBody")}
              minHeight="320px"
            />
          </div>
        </div>
      )}

      {/* ── Lessons section ──────────────────────────────────────────────── */}
      {showLessons && (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface-1">

          {/* Section header */}
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("pageEdit.sectionLessons")}
            </h2>
            <span className="text-xs text-muted-foreground">{lessonDrafts.length}</span>
          </div>

          {/* Empty state */}
          {lessonDrafts.length === 0 && (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              {t("pageEdit.noLessons")}
            </div>
          )}

          {/* Lesson rows */}
          {lessonDrafts.map((lesson, idx) => (
            <div key={idx} className="space-y-3 px-5 py-4">

              {/* Row: position + title + controls */}
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={lesson.title}
                  onChange={(e) => patchLesson(idx, { title: e.target.value })}
                  placeholder={t("pageEdit.lessonTitle")}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
                />
                <button
                  type="button"
                  onClick={() => patchLesson(idx, { open: !lesson.open })}
                  title={lesson.open ? "Recolher" : "Expandir"}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {lesson.open
                    ? <ChevronUp className="h-3.5 w-3.5" />
                    : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => moveLesson(idx, "up")}
                  disabled={idx === 0}
                  title={t("pageEdit.moveUp")}
                  className={cn(
                    "rounded p-1.5 transition-colors",
                    idx === 0
                      ? "pointer-events-none opacity-25"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveLesson(idx, "down")}
                  disabled={idx === lessonDrafts.length - 1}
                  title={t("pageEdit.moveDown")}
                  className={cn(
                    "rounded p-1.5 transition-colors",
                    idx === lessonDrafts.length - 1
                      ? "pointer-events-none opacity-25"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeLesson(idx)}
                  title={t("pageEdit.deleteLesson")}
                  className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Expanded: body editor + audio URL */}
              {lesson.open && (
                <div className="space-y-3 pl-7">
                  <RichTextEditor
                    content={lesson.body_html}
                    onChange={(html) => patchLesson(idx, { body_html: html })}
                    placeholder={t("pageEdit.lessonBody")}
                    minHeight="200px"
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("pageEdit.lessonAudioUrl")}</label>
                    <AudioUploader
                      pageSlug={page.slug}
                      onUploaded={(url) => patchLesson(idx, { audio_url: url })}
                    />
                    <input
                      type="text"
                      value={lesson.audio_url}
                      onChange={(e) => patchLesson(idx, { audio_url: e.target.value })}
                      placeholder="https://medhelpspace.b-cdn.net/…"
                      className="w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
                    />
                    {lesson.audio_url && (
                      <audio
                        controls
                        src={lesson.audio_url}
                        className="w-full"
                        preload="none"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add lesson */}
          <div className="px-5 py-4">
            <button
              type="button"
              onClick={addLesson}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("pageEdit.addLesson")}
            </button>
          </div>

        </div>
      )}

      {/* Quiz questions editor */}
      {isQuiz && <QuizEditor ref={contentRef} pageId={page.id} initial={quizQuestions} />}

      {/* Flashcards editor */}
      {isFlashcards && <FlashcardEditor ref={contentRef} pageId={page.id} initial={flashcards} />}

      {/* Nav items editor (hub pages only) */}
      {isHub && (
        <NavItemsEditor
          ref={contentRef}
          pageId={page.id}
          initial={navItems}
          specialties={specialties}
          hubSpecialtyId={page.specialty_id}
          hubView={page.view}
        />
      )}

      {/* ── Single page-level Save (sticky) ───────────────────────────────── */}
      <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-xl border border-border bg-surface-1/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface-1/80">
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            {t("common.success")}
          </span>
        )}
        <button
          onClick={handleSaveClick}
          disabled={saving}
          className="ml-auto rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-fg transition-opacity disabled:opacity-60 hover:opacity-90"
        >
          {saving ? t("common.loading") : t("pageEdit.saveAll")}
        </button>
      </div>

      {/* Publish / unpublish confirmation — status changes flip member visibility */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface-1 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">
              {status === "publish"
                ? t("pageEdit.confirmPublishTitle")
                : t("pageEdit.confirmUnpublishTitle")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {status === "publish"
                ? t("pageEdit.confirmPublishBody")
                : t("pageEdit.confirmUnpublishBody")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmAndSave}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90",
                  status === "publish" ? "bg-green-600" : "bg-amber-600",
                )}
              >
                {status === "publish"
                  ? t("pageEdit.confirmPublishAction")
                  : t("pageEdit.confirmUnpublishAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
