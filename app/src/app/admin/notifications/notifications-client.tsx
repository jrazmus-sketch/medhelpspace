"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Bell, Plus, Pencil, Trash2, X, Check, Settings2, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  createAnnouncementCategory,
  deleteAnnouncementCategory,
  updateSiteSetting,
  type AnnouncementInput,
} from "@/actions/admin";
import type { AnnouncementCategory, Announcement, Cohort } from "@/types/supabase";

type AnnouncementWithCategory = Announcement & { category: AnnouncementCategory };

const EMPTY_FORM: AnnouncementInput = {
  title: "",
  body_html: null,
  category_id: 0,
  priority: "normal",
  status: "published",
  pinned: false,
  publish_at: new Date().toISOString().slice(0, 16),
  cohort_id: null,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_LABELS: Record<string, string> = {
  published: "Publicado",
  draft: "Rascunho",
  scheduled: "Agendado",
};

const STATUS_COLORS: Record<string, string> = {
  published: "bg-green-500/15 text-green-700 dark:text-green-400",
  draft: "bg-surface-2 text-muted-foreground",
  scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

export function NotificationsClient({
  categories,
  announcements: initial,
  cohorts,
  tickerLabel: initialTickerLabel,
}: {
  categories: AnnouncementCategory[];
  announcements: AnnouncementWithCategory[];
  cohorts: Pick<Cohort, "id" | "slug" | "name">[];
  tickerLabel: string;
}) {
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState(initial);
  const [cats, setCats] = useState(categories);
  const [tickerLabel, setTickerLabel] = useState(initialTickerLabel);
  const [tickerDraft, setTickerDraft] = useState(initialTickerLabel);
  const [pending, startTransition] = useTransition();

  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AnnouncementInput & { publish_at_local: string }>({
    ...EMPTY_FORM,
    publish_at_local: new Date().toISOString().slice(0, 16),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaved, setFormSaved] = useState(false);

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [catSlug, setCatSlug] = useState("");
  const [catLabel, setCatLabel] = useState("");
  const [catColor, setCatColor] = useState("#9ca3af");
  const [catError, setCatError] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const defaultCategoryId = cats[0]?.id ?? 0;

  function openCreate() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      category_id: defaultCategoryId,
      publish_at_local: new Date().toISOString().slice(0, 16),
    });
    setFormError(null);
    setFormSaved(false);
    setShowForm(true);
  }

  function openEdit(a: AnnouncementWithCategory) {
    setEditingId(a.id);
    setForm({
      title: a.title,
      body_html: a.body_html,
      category_id: a.category_id,
      priority: a.priority,
      status: a.status,
      pinned: a.pinned,
      publish_at: a.publish_at,
      publish_at_local: a.publish_at.slice(0, 16),
      cohort_id: a.cohort_id,
    });
    setFormError(null);
    setFormSaved(false);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function patch(update: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...update }));
  }

  function handleSubmit() {
    if (!form.title.trim()) {
      setFormError("Título obrigatório.");
      return;
    }
    if (!form.category_id) {
      setFormError("Selecione uma categoria.");
      return;
    }
    setFormError(null);

    const payload: AnnouncementInput = {
      title: form.title.trim(),
      body_html: form.body_html || null,
      category_id: form.category_id,
      priority: form.priority,
      status: form.status,
      pinned: form.pinned,
      publish_at: new Date(form.publish_at_local).toISOString(),
      cohort_id: form.cohort_id,
    };

    startTransition(async () => {
      try {
        if (editingId !== null) {
          await updateAnnouncement(editingId, payload);
          setAnnouncements((prev) =>
            prev.map((a) =>
              a.id === editingId
                ? { ...a, ...payload, category: cats.find((c) => c.id === payload.category_id) ?? a.category }
                : a,
            ),
          );
        } else {
          await createAnnouncement(payload);
          // Reload happens via router — optimistic update is approximate
          window.location.reload();
          return;
        }
        setFormSaved(true);
        setTimeout(() => setFormSaved(false), 2000);
      } catch (e) {
        setFormError((e as Error).message);
      }
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      try {
        await deleteAnnouncement(id);
        setAnnouncements((prev) => prev.filter((a) => a.id !== id));
        setDeleteConfirm(null);
        if (editingId === id) closeForm();
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  function handleSaveTicker() {
    if (!tickerDraft.trim()) return;
    startTransition(async () => {
      await updateSiteSetting("ticker_label", tickerDraft.trim());
      setTickerLabel(tickerDraft.trim());
    });
  }

  function handleCreateCategory() {
    if (!catSlug.trim() || !catLabel.trim()) {
      setCatError("Slug e nome são obrigatórios.");
      return;
    }
    setCatError(null);
    startTransition(async () => {
      try {
        await createAnnouncementCategory({ slug: catSlug.trim(), label: catLabel.trim(), color: catColor });
        window.location.reload();
      } catch (e) {
        setCatError((e as Error).message);
      }
    });
  }

  function handleDeleteCategory(id: number) {
    startTransition(async () => {
      try {
        await deleteAnnouncementCategory(id);
        setCats((prev) => prev.filter((c) => c.id !== id));
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-brand" />
          <h1 className="text-2xl font-bold">{t("notifications.title")}</h1>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand/90 disabled:opacity-60"
          disabled={pending}
        >
          <Plus className="h-4 w-4" />
          {t("notifications.create")}
        </button>
      </div>

      {/* ── Settings section ── */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("notifications.settings")}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Ticker label */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t("notifications.tickerLabel")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tickerDraft}
                onChange={(e) => setTickerDraft(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              <button
                type="button"
                onClick={handleSaveTicker}
                disabled={pending || tickerDraft === tickerLabel}
                className="flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("notifications.categories")}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 pl-2.5 pr-1.5 py-1">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="text-xs font-medium">{c.label}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(c.id)}
                  disabled={pending}
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-40"
                  title={t("common.delete")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowCatForm((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand"
            >
              <Plus className="h-3 w-3" />
              {t("notifications.addCategory")}
            </button>
          </div>

          {showCatForm && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-2 p-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Slug</label>
                <input type="text" value={catSlug} onChange={(e) => setCatSlug(e.target.value)} placeholder="ex: urgente" className="w-28 rounded border border-border bg-background px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("notifications.categoryLabel")}</label>
                <input type="text" value={catLabel} onChange={(e) => setCatLabel(e.target.value)} placeholder="ex: Urgente" className="w-28 rounded border border-border bg-background px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("notifications.color")}</label>
                <input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-border bg-background" />
              </div>
              <button type="button" onClick={handleCreateCategory} disabled={pending} className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg disabled:opacity-40">
                {t("common.create")}
              </button>
              {catError && <p className="w-full text-xs text-destructive">{catError}</p>}
            </div>
          )}
        </div>
      </section>

      {/* ── Create / Edit form ── */}
      {showForm && (
        <section className="rounded-lg border border-border bg-surface-1 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {editingId ? t("notifications.editAnnouncement") : t("notifications.newAnnouncement")}
            </h2>
            <button type="button" onClick={closeForm} className="rounded p-1 text-muted-foreground hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("notifications.announcementTitle")} *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                placeholder={t("notifications.titlePlaceholder")}
              />
            </div>

            {/* Body */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("notifications.body")}</label>
              <RichTextEditor
                content={form.body_html ?? ""}
                onChange={(html) => patch({ body_html: html || null })}
                placeholder={t("notifications.bodyPlaceholder")}
                minHeight="120px"
              />
            </div>

            {/* Row: category, priority, status, pinned */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("notifications.category")}</label>
                <select
                  value={form.category_id}
                  onChange={(e) => patch({ category_id: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none"
                >
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("notifications.priority")}</label>
                <select
                  value={form.priority}
                  onChange={(e) => patch({ priority: e.target.value as "normal" | "urgent" })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none"
                >
                  <option value="normal">{t("notifications.priorityNormal")}</option>
                  <option value="urgent">{t("notifications.priorityUrgent")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("notifications.status")}</label>
                <select
                  value={form.status}
                  onChange={(e) => patch({ status: e.target.value as "draft" | "published" | "scheduled" })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none"
                >
                  <option value="published">{t("notifications.statusPublished")}</option>
                  <option value="draft">{t("notifications.statusDraft")}</option>
                  <option value="scheduled">{t("notifications.statusScheduled")}</option>
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.pinned}
                    onChange={(e) => patch({ pinned: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-brand"
                  />
                  <span className="text-xs font-medium text-muted-foreground">{t("notifications.pinned")}</span>
                </label>
              </div>
            </div>

            {/* Row: publish_at, cohort targeting */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("notifications.publishAt")}</label>
                <input
                  type="datetime-local"
                  value={form.publish_at_local}
                  onChange={(e) => patch({ publish_at_local: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("notifications.targetCohort")}</label>
                <select
                  value={form.cohort_id ?? ""}
                  onChange={(e) => patch({ cohort_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none"
                >
                  <option value="">{t("notifications.targetAll")}</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-60"
              >
                {formSaved ? <Check className="h-4 w-4" /> : null}
                {formSaved ? t("common.success") : t("common.save")}
              </button>
              <button type="button" onClick={closeForm} className="text-sm text-muted-foreground hover:text-foreground">
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Announcements table ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("notifications.all")} · {announcements.length}
          </h2>
        </div>

        {announcements.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            {t("notifications.noResults")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">{t("notifications.announcementTitle")}</th>
                  <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell">{t("notifications.category")}</th>
                  <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">{t("notifications.status")}</th>
                  <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">{t("notifications.publishAt")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("common.edit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {announcements.map((a) => (
                  <tr key={a.id} className={cn("bg-surface-1 transition-colors hover:bg-surface-2", editingId === a.id && "bg-brand/5")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {a.pinned && <span className="text-brand" title="Fixado">📌</span>}
                        {a.priority === "urgent" && (
                          <span className="inline-flex h-4 items-center rounded px-1.5 text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            URGENTE
                          </span>
                        )}
                        <span className="font-medium text-foreground">{a.title}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span
                        className="inline-flex h-5 items-center rounded px-1.5 text-[9px] font-bold uppercase tracking-wide"
                        style={{
                          background: `color-mix(in srgb, ${a.category.color} 14%, transparent)`,
                          color: a.category.color,
                        }}
                      >
                        {a.category.label}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Badge className={cn("text-[10px]", STATUS_COLORS[a.status])}>
                        {STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                      {formatDate(a.publish_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(a)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title={t("common.edit")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {deleteConfirm === a.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDelete(a.id)}
                              disabled={pending}
                              className="rounded p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-60"
                              title={t("notifications.confirmDelete")}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(null)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-accent"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(a.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                            title={t("common.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
