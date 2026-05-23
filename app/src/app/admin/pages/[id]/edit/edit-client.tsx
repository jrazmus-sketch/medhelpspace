"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { updatePageMetadata, updateLessons } from "@/actions/admin";
import type { PageRow, SpecialtyOption, TrackOption, ModuleOption, LessonRow, QuizQuestionRow, FlashcardRow } from "./page";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { QuizEditor } from "./quiz-editor";
import { FlashcardEditor } from "./flashcard-editor";
import { Check, AlertCircle, ArrowLeft, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
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
  isQuiz: boolean;
  isFlashcards: boolean;
};

export function PageEditClient({ page, specialties, tracks, modules, lessons, quizQuestions, flashcards, isQuiz, isFlashcards }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const [title, setTitle] = useState(page.title);
  const [slugOverride, setSlugOverride] = useState(page.slug);
  const [slugManual, setSlugManual] = useState(false);
  const slug = slugManual ? slugOverride : slugify(title);
  const [status, setStatus] = useState<"publish" | "draft">(
    page.status === "publish" ? "publish" : "draft",
  );
  const [specialtyId, setSpecialtyId] = useState<number | "">(page.specialty_id ?? "");
  const [trackId, setTrackId] = useState<number | "">(page.track_id ?? "");
  const [view, setView] = useState<string>(page.view ?? "");
  const [moduleId, setModuleId] = useState<number | "">(page.content_module_id ?? "");
  const [notes, setNotes] = useState(page.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [lessonsSaving, setLessonsSaving] = useState(false);
  const [lessonsSaved, setLessonsSaved] = useState(false);
  const [lessonsError, setLessonsError] = useState<string | null>(null);


  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(msg === "SLUG_TAKEN" ? t("pageEdit.slugTaken") : t("errors.generic"));
    } finally {
      setSaving(false);
    }
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

  async function handleSaveLessons() {
    setLessonsError(null);
    setLessonsSaved(false);
    setLessonsSaving(true);
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
      setLessonsSaved(true);
      setTimeout(() => setLessonsSaved(false), 3000);
    } catch (err: unknown) {
      setLessonsError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setLessonsSaving(false);
    }
  }

  const showLessons = page.type === "text-lesson" || page.type === "audio-lesson";

  const typeColor = TYPE_COLORS[page.type] ?? TYPE_COLORS.default;

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* Header row */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/admin/pages")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("pageEdit.backToList")}
        </button>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-lg font-semibold truncate">{page.title}</h1>
        <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0", typeColor)}>
          {TYPE_LABELS[page.type] ?? page.type}
        </span>
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

      {/* Footer: feedback + save */}
      <div className="flex items-center gap-3">
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
          onClick={handleSave}
          disabled={saving}
          className="ml-auto rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-fg transition-opacity disabled:opacity-60 hover:opacity-90"
        >
          {saving ? t("common.loading") : t("common.save")}
        </button>
      </div>

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
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("pageEdit.lessonAudioUrl")}</label>
                    <input
                      type="text"
                      value={lesson.audio_url}
                      onChange={(e) => patchLesson(idx, { audio_url: e.target.value })}
                      placeholder="https://medhelpspace.b-cdn.net/…"
                      className="w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
                    />
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

          {/* Save footer */}
          <div className="flex items-center gap-3 px-5 py-4">
            {lessonsError && (
              <span className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {lessonsError}
              </span>
            )}
            {lessonsSaved && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" />
                {t("pageEdit.lessonsSaved")}
              </span>
            )}
            <button
              onClick={handleSaveLessons}
              disabled={lessonsSaving}
              className="ml-auto rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-fg transition-opacity disabled:opacity-60 hover:opacity-90"
            >
              {lessonsSaving ? t("common.loading") : t("pageEdit.saveLessons")}
            </button>
          </div>
        </div>
      )}

      {/* Quiz questions editor */}
      {isQuiz && <QuizEditor pageId={page.id} initial={quizQuestions} />}

      {/* Flashcards editor */}
      {isFlashcards && <FlashcardEditor pageId={page.id} initial={flashcards} />}
    </div>
  );
}
