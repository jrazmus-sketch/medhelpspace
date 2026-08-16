"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Plus, Pencil, FileText, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import {
  criarEmbaixador,
  atualizarEmbaixador,
  gerarFechamento,
  registrarNota,
  rejeitarNota,
  registrarPagamento,
  reabrirFechamento,
} from "@/actions/ambassadors";

export interface AmbassadorRow {
  id: number;
  code: string;
  email: string;
  displayName: string | null;
  status: string;
  profileType: string;
  commissionRateBps: number;
  contractEndsOn: string | null;
  couponId: number | null;
  accessCohortId: number | null;
  terminatedForCause: boolean;
  terminationReason: string | null;
  clicks: number;
  sales: number;
  pendingCents: number;
  availableCents: number;
  inReviewCents: number;
  paidCents: number;
}

export interface PayoutRow {
  id: number;
  ambassadorId: number;
  referenceMonth: string;
  totalCents: number;
  status: string;
  nfNumber: string | null;
  nfUrl: string | null;
  paidAt: string | null;
  isFinalSettlement: boolean;
  rejectionReason: string | null;
}

interface Props {
  ambassadors: AmbassadorRow[];
  payouts: PayoutRow[];
  cohorts: { id: number; name: string }[];
  coupons: { id: number; code: string; label: string }[];
}

function brl(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}R$ ${(Math.abs(cents) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-amber-500/15 text-amber-400",
  terminated: "bg-muted text-muted-foreground",
};

const PAYOUT_STYLES: Record<string, string> = {
  aberto: "bg-amber-500/15 text-amber-400",
  em_analise: "bg-sky-500/15 text-sky-400",
  paga: "bg-emerald-500/15 text-emerald-400",
  rejeitada: "bg-red-500/15 text-red-400",
};

export function EmbaixadoresClient({ ambassadors, payouts, cohorts, coupons }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Expected failures come back as { ok: false, error: CODE } — NOT as thrown
  // messages, which Next.js redacts in production and which would therefore all
  // collapse into the generic fallback on Vercel. `onOk` runs only on success,
  // so a form never closes over a rejected save.
  function run(
    fn: () => Promise<{ ok: boolean; error?: string } | void>,
    onOk?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && result.ok === false) {
          const code = result.error ?? "UNKNOWN";
          setError(t(`embaixadores.errors.${code}`, t("embaixadores.errors.UNKNOWN")));
          return;
        }
        onOk?.();
        router.refresh();
      } catch {
        // Only genuinely unexpected failures reach here (auth, DB); the generic
        // message is the correct outcome for those.
        setError(t("embaixadores.errors.UNKNOWN"));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("embaixadores.title")}</h1>
        <button
          type="button"
          onClick={() => { setCreating((v) => !v); setError(null); }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> {t("embaixadores.new")}
        </button>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("embaixadores.cycleHint")}
      </p>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {creating ? (
        <CreateForm
          cohorts={cohorts}
          coupons={coupons}
          busy={pending}
          onCancel={() => setCreating(false)}
          onSubmit={(input) => run(() => criarEmbaixador(input), () => setCreating(false))}
        />
      ) : null}

      {ambassadors.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-1 p-6 text-center text-sm text-muted-foreground">
          {t("embaixadores.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {ambassadors.map((a) => {
            const mine = payouts.filter((p) => p.ambassadorId === a.id);
            const isExpanded = expandedId === a.id;
            return (
              <li key={a.id} className="rounded-xl border border-border bg-surface-1 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{a.code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[a.status] ?? ""}`}>
                        {t(`embaixadores.status.${a.status}`)}
                      </span>
                      {a.profileType === "embaixador_aluno" ? (
                        <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] text-brand">
                          {t("embaixadores.profile.aluno")}
                        </span>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">
                        {(a.commissionRateBps / 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {a.displayName ? `${a.displayName} · ` : ""}{a.email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingId(editingId === a.id ? null : a.id); setError(null); }}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm"
                    >
                      <Pencil className="h-3.5 w-3.5" /> {t("embaixadores.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 text-sm"
                    >
                      {isExpanded ? t("embaixadores.hidePayouts") : t("embaixadores.showPayouts")}
                    </button>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-6">
                  <Stat label={t("embaixadores.clicks")} value={String(a.clicks)} />
                  <Stat label={t("embaixadores.sales")} value={String(a.sales)} />
                  <Stat label={t("embaixadores.pending")} value={brl(a.pendingCents)} />
                  <Stat label={t("embaixadores.available")} value={brl(a.availableCents)} highlight />
                  <Stat label={t("embaixadores.inReview")} value={brl(a.inReviewCents)} />
                  <Stat label={t("embaixadores.paid")} value={brl(a.paidCents)} />
                </dl>

                {editingId === a.id ? (
                  <EditForm
                    row={a}
                    coupons={coupons}
                    busy={pending}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(input) =>
                      run(() => atualizarEmbaixador(a.id, input), () => setEditingId(null))
                    }
                  />
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => gerarFechamento(a.id))}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" /> {t("embaixadores.closeMonth")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => gerarFechamento(a.id, { isFinalSettlement: true }))}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm disabled:opacity-50"
                    title={t("embaixadores.finalSettlementHint")}
                  >
                    {t("embaixadores.finalSettlement")}
                  </button>
                </div>

                {isExpanded ? (
                  <PayoutList payouts={mine} busy={pending} run={run} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${highlight ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

function PayoutList({
  payouts,
  busy,
  run,
}: {
  payouts: PayoutRow[];
  busy: boolean;
  run: (
    fn: () => Promise<{ ok: boolean; error?: string } | void>,
    onOk?: () => void,
  ) => void;
}) {
  const { t } = useTranslation();
  const [nfFor, setNfFor] = useState<number | null>(null);
  const [nfNumber, setNfNumber] = useState("");
  const [nfUrl, setNfUrl] = useState("");
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  if (payouts.length === 0) {
    return (
      <p className="mt-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
        {t("embaixadores.noPayouts")}
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
      {payouts.map((p) => (
        <li key={p.id} className="rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{monthLabel(p.referenceMonth)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${PAYOUT_STYLES[p.status] ?? ""}`}>
                {t(`embaixadores.payoutStatus.${p.status}`)}
              </span>
              {p.isFinalSettlement ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {t("embaixadores.finalSettlement")}
                </span>
              ) : null}
            </div>
            <span className="text-sm font-semibold tabular-nums">{brl(p.totalCents)}</span>
          </div>

          {p.nfNumber ? (
            <p className="mt-1 text-xs text-muted-foreground">NF {p.nfNumber}</p>
          ) : null}
          {p.rejectionReason ? (
            <p className="mt-1 text-xs text-red-300">{p.rejectionReason}</p>
          ) : null}

          {p.status !== "paga" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setNfFor(nfFor === p.id ? null : p.id); setNfNumber(p.nfNumber ?? ""); setNfUrl(p.nfUrl ?? ""); }}
                className="min-h-[44px] rounded-lg border border-border px-3 text-sm"
              >
                {t("embaixadores.recordNf")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => registrarPagamento(p.id))}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 text-sm text-emerald-400 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("embaixadores.markPaid")}
              </button>
              <button
                type="button"
                onClick={() => { setRejectFor(rejectFor === p.id ? null : p.id); setReason(""); }}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm"
              >
                <XCircle className="h-3.5 w-3.5" /> {t("embaixadores.rejectNf")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => reabrirFechamento(p.id))}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground disabled:opacity-50"
                title={t("embaixadores.reopenHint")}
              >
                <RotateCcw className="h-3.5 w-3.5" /> {t("embaixadores.reopen")}
              </button>
            </div>
          ) : null}

          {nfFor === p.id ? (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                {t("embaixadores.nfNumber")}
                <input
                  value={nfNumber}
                  onChange={(e) => setNfNumber(e.target.value)}
                  className="mt-1 block min-h-[44px] w-40 rounded-lg border border-border bg-background px-2 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t("embaixadores.nfUrl")}
                <input
                  value={nfUrl}
                  onChange={(e) => setNfUrl(e.target.value)}
                  className="mt-1 block min-h-[44px] w-64 rounded-lg border border-border bg-background px-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () => registrarNota(p.id, { nfNumber: nfNumber.trim() || null, nfUrl: nfUrl.trim() || null }),
                    () => setNfFor(null),
                  )
                }
                className="min-h-[44px] rounded-lg bg-brand px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("embaixadores.save")}
              </button>
            </div>
          ) : null}

          {rejectFor === p.id ? (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                {t("embaixadores.rejectReason")}
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 block min-h-[44px] w-72 rounded-lg border border-border bg-background px-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => rejeitarNota(p.id, reason), () => setRejectFor(null))}
                className="min-h-[44px] rounded-lg border border-border px-3 text-sm disabled:opacity-50"
              >
                {t("embaixadores.save")}
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CreateForm({
  cohorts,
  coupons,
  busy,
  onCancel,
  onSubmit,
}: {
  cohorts: { id: number; name: string }[];
  coupons: { id: number; code: string; label: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    userEmail: string;
    code: string;
    profileType: "embaixador" | "embaixador_aluno";
    accessCohortId: number | null;
    commissionRateBps: number;
    contractEndsOn: string | null;
    couponId: number | null;
  }) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [profileType, setProfileType] = useState<"embaixador" | "embaixador_aluno">("embaixador");
  const [cohortId, setCohortId] = useState<string>("");
  const [rate, setRate] = useState("10");
  const [endsOn, setEndsOn] = useState("");
  const [couponId, setCouponId] = useState<string>("");

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
      <h2 className="text-sm font-semibold">{t("embaixadores.new")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("embaixadores.memberEmail")} hint={t("embaixadores.memberEmailHint")}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t("embaixadores.code")} hint={t("embaixadores.codeHint")}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${inputCls} font-mono`} />
        </Field>
        <Field label={t("embaixadores.rate")}>
          <input type="number" min={0} max={100} value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t("embaixadores.profileLabel")}>
          <select
            value={profileType}
            onChange={(e) => setProfileType(e.target.value as "embaixador" | "embaixador_aluno")}
            className={inputCls}
          >
            <option value="embaixador">{t("embaixadores.profile.padrao")}</option>
            <option value="embaixador_aluno">{t("embaixadores.profile.aluno")}</option>
          </select>
        </Field>
        {profileType === "embaixador_aluno" ? (
          <Field label={t("embaixadores.accessCohort")} hint={t("embaixadores.accessCohortHint")}>
            <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={t("embaixadores.coupon")} hint={t("embaixadores.couponHint")}>
          <select value={couponId} onChange={(e) => setCouponId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label={t("embaixadores.contractEnds")}>
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit({
              userEmail: email,
              code,
              profileType,
              accessCohortId: cohortId ? Number(cohortId) : null,
              commissionRateBps: Math.round(Number(rate) * 100),
              contractEndsOn: endsOn || null,
              couponId: couponId ? Number(couponId) : null,
            })
          }
          className="min-h-[44px] rounded-lg bg-brand px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("embaixadores.save")}
        </button>
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-border px-4 text-sm">
          {t("embaixadores.cancel")}
        </button>
      </div>
    </div>
  );
}

function EditForm({
  row,
  coupons,
  busy,
  onCancel,
  onSubmit,
}: {
  row: AmbassadorRow;
  coupons: { id: number; code: string; label: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    status: "pending" | "active" | "terminated";
    commissionRateBps: number;
    contractEndsOn: string | null;
    couponId: number | null;
    terminatedForCause: boolean;
    terminationReason: string | null;
  }) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(row.status as "pending" | "active" | "terminated");
  const [rate, setRate] = useState(String(row.commissionRateBps / 100));
  const [endsOn, setEndsOn] = useState(row.contractEndsOn ?? "");
  const [couponId, setCouponId] = useState(row.couponId ? String(row.couponId) : "");
  const [forCause, setForCause] = useState(row.terminatedForCause);
  const [reason, setReason] = useState(row.terminationReason ?? "");

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("embaixadores.statusLabel")}>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
            <option value="pending">{t("embaixadores.status.pending")}</option>
            <option value="active">{t("embaixadores.status.active")}</option>
            <option value="terminated">{t("embaixadores.status.terminated")}</option>
          </select>
        </Field>
        <Field label={t("embaixadores.rate")}>
          <input type="number" min={0} max={100} value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t("embaixadores.contractEnds")}>
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t("embaixadores.coupon")}>
          <select value={couponId} onChange={(e) => setCouponId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {status === "terminated" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={forCause} onChange={(e) => setForCause(e.target.checked)} className="h-4 w-4" />
            {t("embaixadores.forCause")}
          </label>
          <Field label={t("embaixadores.terminationReason")}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
          </Field>
          <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
            {t("embaixadores.forCauseHint")}
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit({
              status,
              commissionRateBps: Math.round(Number(rate) * 100),
              contractEndsOn: endsOn || null,
              couponId: couponId ? Number(couponId) : null,
              terminatedForCause: status === "terminated" ? forCause : false,
              terminationReason: status === "terminated" ? reason.trim() || null : null,
            })
          }
          className="min-h-[44px] rounded-lg bg-brand px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("embaixadores.save")}
        </button>
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-border px-4 text-sm">
          {t("embaixadores.cancel")}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "mt-1 block min-h-[44px] w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-brand/50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-relaxed">{hint}</span> : null}
    </label>
  );
}
