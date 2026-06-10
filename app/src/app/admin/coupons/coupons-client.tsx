"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Plus, Search, Pencil, Users, Power, Trash2 } from "lucide-react";

interface Coupon {
  id: number;
  code: string;
  discountType: "percent" | "fixed_cents";
  discountValue: number;
  maxRedemptions: number | null;
  maxUsesPerUser: number | null;
  redemptionsUsed: number;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  cohortSlugs: string[] | null;
  notes: string | null;
}

interface Redemption {
  id: number;
  couponId: number;
  email: string;
  displayName: string | null;
  discountCents: number;
  redeemedAt: string;
}

interface CohortOption {
  slug: string;
  name: string;
}

function fmtMoney(cents: number) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ISO → value for <input type="datetime-local"> (local time, no seconds).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type FormState = {
  id: number | null;
  code: string;
  discountType: "percent" | "fixed_cents";
  value: string; // percent integer OR reais (for fixed)
  maxRedemptions: string;
  maxUsesPerUser: string; // empty = unlimited
  startsAt: string;
  expiresAt: string;
  cohortSlugs: string[];
  notes: string;
  active: boolean;
};

function emptyForm(): FormState {
  return {
    id: null,
    code: "",
    discountType: "percent",
    value: "",
    maxRedemptions: "",
    maxUsesPerUser: "1",
    startsAt: "",
    expiresAt: "",
    cohortSlugs: [],
    notes: "",
    active: true,
  };
}

function couponToForm(c: Coupon): FormState {
  return {
    id: c.id,
    code: c.code,
    discountType: c.discountType,
    value: c.discountType === "fixed_cents" ? (c.discountValue / 100).toFixed(2) : String(c.discountValue),
    maxRedemptions: c.maxRedemptions == null ? "" : String(c.maxRedemptions),
    maxUsesPerUser: c.maxUsesPerUser == null ? "" : String(c.maxUsesPerUser),
    startsAt: toLocalInput(c.startsAt),
    expiresAt: toLocalInput(c.expiresAt),
    cohortSlugs: c.cohortSlugs ?? [],
    notes: c.notes ?? "",
    active: c.active,
  };
}

export function CouponsClient({
  coupons,
  redemptions,
  cohortOptions,
}: {
  coupons: Coupon[];
  redemptions: Redemption[];
  cohortOptions: CohortOption[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [redemptionsTarget, setRedemptionsTarget] = useState<Coupon | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cohortName = (slug: string) => cohortOptions.find((c) => c.slug === slug)?.name ?? slug;

  const filtered = coupons.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.code.toLowerCase().includes(q);
  });

  function fmtDiscount(c: Coupon) {
    return c.discountType === "percent" ? `${c.discountValue}%` : fmtMoney(c.discountValue);
  }
  function fmtUses(c: Coupon) {
    return `${c.redemptionsUsed} / ${c.maxRedemptions == null ? t("coupons.unlimited") : c.maxRedemptions}`;
  }
  function fmtWindow(c: Coupon) {
    const s = fmtDate(c.startsAt);
    const e = fmtDate(c.expiresAt);
    if (!s && !e) return t("coupons.noExpiry");
    return `${s ?? "—"} → ${e ?? t("coupons.noExpiry")}`;
  }
  function fmtCohorts(c: Coupon) {
    if (!c.cohortSlugs || c.cohortSlugs.length === 0) return t("coupons.allCohorts");
    return c.cohortSlugs.map(cohortName).join(", ");
  }

  // Client-side mirror of the server validation, so the form gives instant feedback.
  function validate(f: FormState): string | null {
    if (!f.code.trim()) return t("coupons.errCodeRequired");
    const raw = f.value.trim();
    if (!raw) return t("coupons.errValueRequired");
    if (f.discountType === "percent") {
      const n = Number(raw);
      if (!Number.isInteger(n)) return t("coupons.errValueRequired");
      if (n < 1 || n > 100) return t("coupons.errPercentRange");
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return t("coupons.errFixedPositive");
    }
    if (f.maxUsesPerUser.trim()) {
      const n = Number(f.maxUsesPerUser);
      if (!Number.isInteger(n) || n <= 0) return t("coupons.errValueRequired");
    }
    if (f.startsAt && f.expiresAt && new Date(f.startsAt) >= new Date(f.expiresAt)) {
      return t("coupons.errWindow");
    }
    return null;
  }

  function submitForm() {
    if (!form) return;
    const err = validate(form);
    if (err) { setFormError(err); return; }

    const discountValue =
      form.discountType === "fixed_cents"
        ? Math.round(Number(form.value) * 100)
        : Number(form.value);

    const payload = {
      ...(form.id ? { id: form.id } : {}),
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue,
      maxRedemptions: form.maxRedemptions.trim() ? Number(form.maxRedemptions) : null,
      maxUsesPerUser: form.maxUsesPerUser.trim() ? Number(form.maxUsesPerUser) : null,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      cohortSlugs: form.cohortSlugs.length ? form.cohortSlugs : null,
      notes: form.notes,
      active: form.active,
    };

    startTransition(async () => {
      setFormError(null);
      try {
        const res = await fetch("/api/admin/coupons", {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.errorKey ? t(`coupons.${data.errorKey}`) : (data.error ?? t("errors.generic")));
        }
        setForm(null);
        router.refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : t("errors.generic"));
      }
    });
  }

  function toggleActive(c: Coupon) {
    startTransition(async () => {
      await fetch("/api/admin/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, active: !c.active }),
      });
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      setDeleteError(null);
      try {
        const res = await fetch(`/api/admin/coupons?id=${deleteTarget.id}`, { method: "DELETE" });
        const data = res.status === 200 ? { ok: true } : await res.json();
        if (!res.ok) {
          throw new Error(data.errorKey ? t(`coupons.${data.errorKey}`) : (data.error ?? t("errors.generic")));
        }
        setDeleteTarget(null);
        router.refresh();
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : t("errors.generic"));
      }
    });
  }

  const targetRedemptions = redemptionsTarget
    ? redemptions.filter((r) => r.couponId === redemptionsTarget.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("coupons.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("coupons.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setForm(emptyForm()); setFormError(null); }}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/85"
        >
          <Plus className="h-4 w-4" />
          {t("coupons.create")}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("coupons.searchPlaceholder")}
          className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-left">
              {[
                t("coupons.colCode"),
                t("coupons.colDiscount"),
                t("coupons.colUses"),
                t("coupons.colWindow"),
                t("coupons.colCohorts"),
                t("coupons.colStatus"),
                "",
              ].map((h, i) => (
                <th key={i} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("coupons.noResults")}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-1/50 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap">{c.code}</td>
                <td className="px-4 py-3 text-foreground whitespace-nowrap">{fmtDiscount(c)}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtUses(c)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtWindow(c)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[14rem] truncate" title={fmtCohorts(c)}>
                  {fmtCohorts(c)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    c.active
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}>
                    {c.active ? t("coupons.active") : t("coupons.inactive")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button" title={t("coupons.redemptions")}
                      onClick={() => setRedemptionsTarget(c)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Users className="h-4 w-4" />
                    </button>
                    <button
                      type="button" title={t("common.edit")}
                      onClick={() => { setForm(couponToForm(c)); setFormError(null); }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button" title={c.active ? t("coupons.deactivate") : t("coupons.activate")}
                      onClick={() => toggleActive(c)}
                      disabled={isPending}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      type="button" title={t("coupons.delete")}
                      onClick={() => { setDeleteTarget(c); setDeleteError(null); }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / edit modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              {form.id ? t("coupons.editTitle") : t("coupons.createTitle")}
            </h2>

            <div className="space-y-4">
              {/* Code */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("coupons.formCode")}</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder={t("coupons.formCodePlaceholder")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm uppercase text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Type + value */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("coupons.formType")}</label>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as FormState["discountType"] })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="percent">{t("coupons.typePercent")}</option>
                    <option value="fixed_cents">{t("coupons.typeFixed")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {form.discountType === "percent" ? t("coupons.formValuePercent") : t("coupons.formValueFixed")}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={form.discountType === "percent" ? 1 : 0}
                    max={form.discountType === "percent" ? 100 : undefined}
                    step={form.discountType === "percent" ? 1 : 0.01}
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              {/* Max uses (global) + per-person limit */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("coupons.formMaxUses")}</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxRedemptions}
                    onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                    placeholder={t("coupons.unlimited")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t("coupons.formMaxUsesHint")}</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("coupons.formMaxUsesPerUser")}</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxUsesPerUser}
                    onChange={(e) => setForm({ ...form, maxUsesPerUser: e.target.value })}
                    placeholder={t("coupons.unlimited")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t("coupons.formMaxUsesPerUserHint")}</p>
                </div>
              </div>

              {/* Window */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("coupons.formStartsAt")}</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("coupons.formExpiresAt")}</label>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              {/* Cohorts */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("coupons.formCohorts")}</label>
                <div className="flex flex-wrap gap-2">
                  {cohortOptions.map((co) => {
                    const checked = form.cohortSlugs.includes(co.slug);
                    return (
                      <button
                        key={co.slug}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            cohortSlugs: checked
                              ? form.cohortSlugs.filter((s) => s !== co.slug)
                              : [...form.cohortSlugs, co.slug],
                          })
                        }
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          checked
                            ? "border-brand bg-brand/10 text-brand"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {co.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("coupons.formCohortsHint")}</p>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("coupons.formNotes")}</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Active */}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                {t("coupons.formActive")}
              </label>

              {formError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-1"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={submitForm}
                disabled={isPending}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/85 disabled:opacity-60"
              >
                {isPending ? t("coupons.saving") : t("coupons.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redemptions drawer */}
      {redemptionsTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                {t("coupons.redemptionsTitle", { code: redemptionsTarget.code })}
              </h2>
              <button
                type="button"
                onClick={() => setRedemptionsTarget(null)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {t("common.close")}
              </button>
            </div>

            {targetRedemptions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("coupons.redemptionsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-1 text-left">
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("coupons.redemptionUser")}</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t("coupons.redemptionDiscount")}</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t("coupons.redemptionDate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetRedemptions.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground leading-tight">{r.displayName ?? r.email}</p>
                          {r.displayName && <p className="text-xs text-muted-foreground">{r.email}</p>}
                        </td>
                        <td className="px-3 py-2 text-foreground whitespace-nowrap">{fmtMoney(r.discountCents)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.redeemedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-foreground">{t("coupons.deleteTitle")}</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("coupons.deleteDesc", { code: deleteTarget.code })}
            </p>
            {deleteError && (
              <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-1"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {t("coupons.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
