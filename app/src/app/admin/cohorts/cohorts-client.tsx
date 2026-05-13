"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import {
  createCohort,
  updateCohort,
  softDeleteCohort,
  reactivateCohort,
} from "@/actions/admin";

type CohortRow = {
  id: number;
  slug: string;
  name: string;
  test_date: string;
  membership_starts_at: string;
  membership_ends_at: string;
  member_count: number;
  active: boolean;
};

type ContentModule = { id: number; name: string; unlock_offset_days: number };
type ModuleAccess = { cohort_id: number; content_module_id: number; is_manual_override: boolean };

interface Props {
  rows: CohortRow[];
  modules: ContentModule[];
  access: ModuleAccess[];
}

const fmt = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR");
};

function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface EditState {
  name: string;
  test_date: string;
  membership_starts_at: string;
  membership_ends_at: string;
}

interface ConfirmSave { cohortId: number; data: EditState }
interface ConfirmDeactivate { cohortId: number; name: string }

export function CohortsClient({ rows, modules, access }: Props) {
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [slugValue, setSlugValue] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Confirmation modals
  const [confirmSave, setConfirmSave] = useState<ConfirmSave | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<ConfirmDeactivate | null>(null);

  function startEdit(row: CohortRow) {
    setEditingId(row.id);
    setEditError(null);
    setEditState({
      name: row.name,
      test_date: row.test_date.slice(0, 10),
      membership_starts_at: row.membership_starts_at.slice(0, 10),
      membership_ends_at: row.membership_ends_at.slice(0, 10),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
    setEditError(null);
  }

  function validateEdit(state: EditState): string | null {
    const today = new Date().toISOString().split("T")[0];
    if (state.test_date <= today) return t("cohorts.testDateFuture");
    if (state.test_date <= state.membership_starts_at) return t("cohorts.testDateAfterStart");
    if (state.membership_starts_at >= state.membership_ends_at) return t("cohorts.startBeforeEnd");
    return null;
  }

  function handleEditSave() {
    if (!editState || editingId === null) return;
    const err = validateEdit(editState);
    if (err) { setEditError(err); return; }
    setConfirmSave({ cohortId: editingId, data: editState });
  }

  function handleConfirmSave() {
    if (!confirmSave) return;
    startTransition(async () => {
      try {
        await updateCohort(confirmSave.cohortId, confirmSave.data);
        setConfirmSave(null);
        setEditingId(null);
        setEditState(null);
      } catch (e) {
        setConfirmSave(null);
        setEditError(e instanceof Error ? e.message : t("errors.generic"));
      }
    });
  }

  function handleConfirmDeactivate() {
    if (!confirmDeactivate) return;
    startTransition(async () => {
      await softDeleteCohort(confirmDeactivate.cohortId);
      setConfirmDeactivate(null);
    });
  }

  function handleReactivate(cohortId: number) {
    startTransition(async () => {
      await reactivateCohort(cohortId);
    });
  }

  function handleCreate(formData: FormData) {
    setCreateError(null);
    startTransition(async () => {
      try {
        await createCohort(formData);
        setShowForm(false);
        setSlugValue("");
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : t("errors.generic"));
      }
    });
  }

  // Cascade preview for save confirmation modal
  function buildCascadePreview(cohortId: number, newTestDate: string) {
    const cohortAccess = access.filter((a) => a.cohort_id === cohortId);
    const autoRows = cohortAccess.filter((a) => !a.is_manual_override);
    const manualRows = cohortAccess.filter((a) => a.is_manual_override);
    return (
      <div className="space-y-3">
        <p>{t("cohorts.cascadeWillUpdate", { count: autoRows.length })}</p>
        {modules.map((mod) => {
          const acc = cohortAccess.find((a) => a.content_module_id === mod.id);
          const isOverridden = acc?.is_manual_override ?? false;
          const newDate = subtractDays(newTestDate, mod.unlock_offset_days);
          return (
            <div key={mod.id} className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs">
              <span className="font-medium">{mod.name}:</span>{" "}
              {isOverridden ? (
                <span className="text-muted-foreground">{t("cohorts.manualOverrideSkip")}</span>
              ) : (
                <span>{t("cohorts.newUnlockDate")}: <strong>{fmt(newDate)}</strong></span>
              )}
            </div>
          );
        })}
        {manualRows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("cohorts.manualOverrideNote", { count: manualRows.length })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("cohorts.title")}</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity"
        >
          {showForm ? t("common.cancel") : `+ ${t("cohorts.create")}`}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="border-brand/20">
          <CardHeader>
            <CardTitle className="text-base">{t("cohorts.create")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreate} className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("cohorts.name")}</span>
                <input
                  name="name"
                  required
                  placeholder="Revalida 2027.2"
                  onChange={(e) => setSlugValue(toSlug(e.target.value))}
                  className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Slug</span>
                <input
                  name="slug"
                  required
                  placeholder="revalida-2027-2"
                  value={slugValue}
                  onChange={(e) => setSlugValue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("cohorts.testDate")}</span>
                <input name="test_date" type="date" required className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("cohorts.startsAt")}</span>
                <input name="membership_starts_at" type="date" required className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("cohorts.endsAt")}</span>
                <input name="membership_ends_at" type="date" required className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50" />
              </label>
              {createError && <p className="sm:col-span-2 text-sm text-red-500">{createError}</p>}
              <div className="sm:col-span-2 flex gap-3">
                <button type="submit" disabled={isPending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity disabled:opacity-50">
                  {isPending ? t("common.loading") : t("common.save")}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setSlugValue(""); }}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Cohort cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((c) => {
          const isEditing = editingId === c.id;
          return (
            <Card key={c.id} className={["border-border/50 transition-opacity", !c.active ? "opacity-60" : ""].join(" ")}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">{c.slug}</p>
                  </div>
                  {!c.active && (
                    <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                      {t("cohorts.inactive")}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isEditing && editState ? (
                  /* Edit form */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cohorts.name")}</span>
                        <input
                          type="text"
                          value={editState.name}
                          onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cohorts.testDate")}</span>
                        <input
                          type="date"
                          value={editState.test_date}
                          onChange={(e) => setEditState({ ...editState, test_date: e.target.value })}
                          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                        />
                      </label>
                      {/* Cascade preview when test_date differs from original */}
                      {editState.test_date && editState.test_date !== c.test_date.slice(0, 10) && modules.length > 0 && (
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-1.5">
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-400">
                            {t("cohorts.cascadePreview")}
                          </p>
                          {modules.map((mod) => {
                            const acc = access.find((a) => a.cohort_id === c.id && a.content_module_id === mod.id);
                            const isOverridden = acc?.is_manual_override ?? false;
                            const newDate = subtractDays(editState.test_date, mod.unlock_offset_days);
                            return (
                              <p key={mod.id} className="text-xs text-amber-700 dark:text-amber-500">
                                {mod.name}: {isOverridden
                                  ? t("cohorts.manualOverrideSkip")
                                  : <><strong>{fmt(newDate)}</strong></>}
                              </p>
                            );
                          })}
                        </div>
                      )}
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cohorts.startsAt")}</span>
                        <input
                          type="date"
                          value={editState.membership_starts_at}
                          onChange={(e) => setEditState({ ...editState, membership_starts_at: e.target.value })}
                          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cohorts.endsAt")}</span>
                        <input
                          type="date"
                          value={editState.membership_ends_at}
                          onChange={(e) => setEditState({ ...editState, membership_ends_at: e.target.value })}
                          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                        />
                      </label>
                    </div>
                    {editError && <p className="text-sm text-red-500">{editError}</p>}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleEditSave}
                        disabled={isPending}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {t("common.save")}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("cohorts.testDate")}</span>
                        <span className="font-medium">{fmt(c.test_date)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("cohorts.startsAt")}</span>
                        <span>{fmt(c.membership_starts_at.slice(0, 10))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("cohorts.endsAt")}</span>
                        <span>{fmt(c.membership_ends_at.slice(0, 10))}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-2">
                        <span className="text-muted-foreground">{t("cohorts.memberCount")}</span>
                        <span className="font-bold text-brand">{c.member_count}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-border flex-wrap">
                      {c.active ? (
                        <>
                          <button
                            onClick={() => startEdit(c)}
                            className="rounded-md px-3 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors"
                          >
                            {t("common.edit")}
                          </button>
                          <Link
                            href={`/admin/cohorts/${c.id}/modules`}
                            className="rounded-md px-3 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors"
                          >
                            {t("cohorts.modules")}
                          </Link>
                          <button
                            onClick={() => setConfirmDeactivate({ cohortId: c.id, name: c.name })}
                            className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            {t("common.deactivate")}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleReactivate(c.id)}
                          disabled={isPending}
                          className="rounded-md px-3 py-1.5 text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors disabled:opacity-50"
                        >
                          {t("common.activate")}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Save confirmation with cascade preview */}
      <ConfirmModal
        open={confirmSave !== null}
        title={t("cohorts.saveConfirmTitle")}
        description={confirmSave ? buildCascadePreview(confirmSave.cohortId, confirmSave.data.test_date) : ""}
        confirmLabel={t("common.save")}
        isPending={isPending}
        onConfirm={handleConfirmSave}
        onCancel={() => setConfirmSave(null)}
      />

      {/* Deactivate confirmation */}
      <ConfirmModal
        open={confirmDeactivate !== null}
        title={t("cohorts.deactivateTitle")}
        description={
          <p>{t("cohorts.deactivateDesc", { name: confirmDeactivate?.name ?? "" })}</p>
        }
        confirmLabel={t("common.deactivate")}
        destructive
        isPending={isPending}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}
