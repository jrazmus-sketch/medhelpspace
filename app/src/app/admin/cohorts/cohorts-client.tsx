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
  setCohortForSale,
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
  price_cents: number | null;
  sale_price_cents: number | null;
  is_for_sale: boolean;
  display_order: number;
  sale_ends_at: string | null;
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

// Maps server-thrown error codes to translated, user-facing strings.
function mapCohortError(e: unknown, t: (k: string) => string): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "PRICE_REQUIRED_FOR_SALE") return t("cohorts.priceRequiredForSale");
  if (msg === "INVALID_PRICE") return t("cohorts.priceInvalid");
  if (msg === "INVALID_SALE_PRICE") return t("cohorts.salePriceInvalid");
  if (msg === "SALE_PRICE_NEEDS_BASE") return t("cohorts.salePriceNeedsBase");
  if (msg === "SALE_PRICE_ABOVE_BASE") return t("cohorts.salePriceAboveBase");
  if (msg === "Unauthorized") return t("errors.unauthorized");
  return t("errors.generic");
}

// Format centavos for the admin list, e.g. 399000 -> "R$ 3.990".
function fmtPrice(cents: number | null): string {
  if (cents == null) return "—";
  return `R$ ${(cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

interface EditState {
  name: string;
  test_date: string;
  membership_starts_at: string;
  membership_ends_at: string;
  price: string;          // reais, converted to cents on save
  sale_price: string;     // reais; blank = no sale. Must be below `price`.
  is_for_sale: boolean;
  display_order: string;  // parsed to number on save
  sale_ends_at: string;   // YYYY-MM-DD or ""
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

  // Per-card error from the quick "À venda" toggle
  const [saleError, setSaleError] = useState<{ id: number; msg: string } | null>(null);

  function startEdit(row: CohortRow) {
    setEditingId(row.id);
    setEditError(null);
    setEditState({
      name: row.name,
      test_date: row.test_date.slice(0, 10),
      membership_starts_at: row.membership_starts_at.slice(0, 10),
      membership_ends_at: row.membership_ends_at.slice(0, 10),
      price: row.price_cents != null ? String(row.price_cents / 100) : "",
      sale_price: row.sale_price_cents != null ? String(row.sale_price_cents / 100) : "",
      is_for_sale: row.is_for_sale,
      display_order: String(row.display_order ?? 0),
      sale_ends_at: row.sale_ends_at ? row.sale_ends_at.slice(0, 10) : "",
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
    if (state.price.trim() && !(Number(state.price) >= 0)) return t("cohorts.priceInvalid");
    if (state.is_for_sale && !state.price.trim()) return t("cohorts.priceRequiredForSale");
    if (state.sale_price.trim()) {
      if (!(Number(state.sale_price) >= 0)) return t("cohorts.salePriceInvalid");
      if (!state.price.trim()) return t("cohorts.salePriceNeedsBase");
      if (Number(state.sale_price) >= Number(state.price)) return t("cohorts.salePriceAboveBase");
    }
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
    const d = confirmSave.data;
    startTransition(async () => {
      try {
        await updateCohort(confirmSave.cohortId, {
          name: d.name,
          test_date: d.test_date,
          membership_starts_at: d.membership_starts_at,
          membership_ends_at: d.membership_ends_at,
          price_cents: d.price.trim() ? Math.round(Number(d.price) * 100) : null,
          sale_price_cents: d.sale_price.trim() ? Math.round(Number(d.sale_price) * 100) : null,
          is_for_sale: d.is_for_sale,
          display_order: Number(d.display_order) || 0,
          sale_ends_at: d.sale_ends_at ? `${d.sale_ends_at}T23:59:59` : null,
        });
        setConfirmSave(null);
        setEditingId(null);
        setEditState(null);
      } catch (e) {
        setConfirmSave(null);
        setEditError(mapCohortError(e, t));
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

  function handleToggleForSale(row: CohortRow) {
    setSaleError(null);
    startTransition(async () => {
      try {
        await setCohortForSale(row.id, !row.is_for_sale);
      } catch (e) {
        setSaleError({ id: row.id, msg: mapCohortError(e, t) });
      }
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
        setCreateError(mapCohortError(e, t));
      }
    });
  }

  // Cascade preview for save confirmation modal. The module-unlock cascade only
  // fires when the test date changes; for any other edit (price, sale price,
  // name, membership window) there's nothing to cascade, so showing the "0 rows /
  // will not change" preview is misleading. Fall back to a plain confirmation.
  function buildCascadePreview(cohortId: number, newTestDate: string) {
    const original = rows.find((r) => r.id === cohortId);
    const dateChanged = original ? newTestDate !== original.test_date.slice(0, 10) : true;
    if (!dateChanged) {
      return <p className="text-sm text-muted-foreground">{t("cohorts.saveConfirmSimple")}</p>;
    }

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
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("cohorts.price")}</span>
                <input name="price" type="number" min="0" step="0.01" placeholder={t("cohorts.pricePlaceholder")} className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("cohorts.salePrice")}</span>
                <input name="sale_price" type="number" min="0" step="0.01" placeholder={t("cohorts.salePricePlaceholder")} className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("cohorts.displayOrder")}</span>
                <input name="display_order" type="number" min="0" step="1" defaultValue="0" className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("cohorts.saleEndsAt")}</span>
                <input name="sale_ends_at" type="date" className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50" />
              </label>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                <input name="is_for_sale" type="checkbox" className="h-4 w-4 rounded border-border" />
                <span>{t("cohorts.forSale")}</span>
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
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cohorts.price")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editState.price}
                          onChange={(e) => setEditState({ ...editState, price: e.target.value })}
                          placeholder={t("cohorts.pricePlaceholder")}
                          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cohorts.salePrice")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editState.sale_price}
                          onChange={(e) => setEditState({ ...editState, sale_price: e.target.value })}
                          placeholder={t("cohorts.salePricePlaceholder")}
                          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                        />
                        <span className="text-[11px] text-muted-foreground">{t("cohorts.salePriceHint")}</span>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cohorts.displayOrder")}</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editState.display_order}
                          onChange={(e) => setEditState({ ...editState, display_order: e.target.value })}
                          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cohorts.saleEndsAt")}</span>
                        <input
                          type="date"
                          value={editState.sale_ends_at}
                          onChange={(e) => setEditState({ ...editState, sale_ends_at: e.target.value })}
                          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editState.is_for_sale}
                          onChange={(e) => setEditState({ ...editState, is_for_sale: e.target.checked })}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span>{t("cohorts.forSale")}</span>
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
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("cohorts.price")}</span>
                        {c.sale_price_cents != null ? (
                          <span className="font-medium">
                            <span className="text-muted-foreground line-through mr-1.5">{fmtPrice(c.price_cents)}</span>
                            <span className="text-brand">{fmtPrice(c.sale_price_cents)}</span>
                          </span>
                        ) : (
                          <span className="font-medium">{fmtPrice(c.price_cents)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("cohorts.forSale")}</span>
                        {c.is_for_sale ? (
                          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">
                            {t("cohorts.saleBadge")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("cohorts.notForSale")}</span>
                        )}
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
                            onClick={() => handleToggleForSale(c)}
                            disabled={isPending || (!c.is_for_sale && c.price_cents == null)}
                            title={!c.is_for_sale && c.price_cents == null ? t("cohorts.needsPriceHint") : undefined}
                            className="rounded-md px-3 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors disabled:opacity-50"
                          >
                            {c.is_for_sale ? t("cohorts.forSaleOff") : t("cohorts.forSaleOn")}
                          </button>
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
                    {saleError?.id === c.id && (
                      <p className="text-xs text-red-500">{saleError.msg}</p>
                    )}
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
