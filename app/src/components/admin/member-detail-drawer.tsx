"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { X, Mail, RefreshCw, Pencil, KeyRound } from "lucide-react";
import {
  getMemberDetail,
  resendWelcomeEmail,
  updateMemberEmail,
  updateMemberDisplayName,
  updateMemberFiscal,
  setMemberPassword,
} from "@/actions/admin";
import { StatusPill } from "./member-status-pill";
import type {
  MemberDetail,
  MemberListRow,
  MemberCompletion,
  MemberFiscalInput,
} from "@/lib/admin/member-detail";

const ORDER_STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-500/15 text-green-700 dark:text-green-400",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  declined: "bg-red-500/15 text-red-700 dark:text-red-400",
  cancelled: "bg-surface-2 text-muted-foreground",
  refunded: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

// Friendly labels for the lifecycle email kinds the cron writes to email_log.
// Unknown kinds fall back to the raw value (humanized) so nothing breaks when a
// new kind is added.
const EMAIL_KIND_KEYS: Record<string, string> = {
  purchase: "members.emailKinds.purchase",
  "60d-unlock": "members.emailKinds.unlock60d",
  "expiry-warning-7d": "members.emailKinds.expiryWarning",
  "expiry-notice": "members.emailKinds.expiryNotice",
  "missed-3-days": "members.emailKinds.missed3Days",
  "weekly-summary": "members.emailKinds.weeklySummary",
  "daily-plan": "members.emailKinds.dailyPlan",
  "welcome-resend": "members.emailKinds.welcomeResend",
};

function fmtMoney(cents: number) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function pct(done: number, total: number) {
  if (!total || total <= 0) return 0;
  const r = Math.round((done / total) * 100);
  // Clamp to 0–100 so a bad count can never paint a >100% (or NaN → full) bar.
  return Number.isFinite(r) ? Math.max(0, Math.min(100, r)) : 0;
}

interface Props {
  row: MemberListRow | null;
  onClose: () => void;
}

export function MemberDetailDrawer({ row, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  // The parent remounts this per member (key={row.id}), so an open instance always
  // starts in the loading state and fetches once — no synchronous reset in the effect.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Refund control — only one order's confirm panel is open at a time.
  const [refundOpenId, setRefundOpenId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  // Snapshot "now" once (lazy init) so the days-left math below stays pure — render
  // must not call the impure Date.now(). Day granularity makes a mount-time stamp fine.
  const [now] = useState(() => Date.now());

  // ── Identity editing (email / name / password / fiscal) ──
  // Header identity is optimistic: seed from the row, patch locally on save, and
  // router.refresh() the table behind the drawer so it agrees on next open. The
  // parent remounts this per member (key={row.id}), so these seeds are fresh.
  const [localEmail, setLocalEmail] = useState(row?.email ?? "");
  const [localName, setLocalName] = useState<string | null>(row?.display_name ?? null);

  const [editingAccount, setEditingAccount] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [editingPw, setEditingPw] = useState(false);
  const [formPw, setFormPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  const [editingFiscal, setEditingFiscal] = useState(false);
  const [formFiscal, setFormFiscal] = useState<MemberFiscalInput>({
    firstName: "",
    lastName: "",
    cpf: "",
    phone: "",
    city: "",
    state: "",
  });
  const [fiscalBusy, setFiscalBusy] = useState(false);
  const [fiscalError, setFiscalError] = useState<string | null>(null);

  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";

  function fmtDate(iso: string, withTime = false) {
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }

  // Lazy-load the heavy per-member detail when the drawer opens. State only changes
  // from the async result (setState in the then/catch callbacks) — the fresh-mount
  // initial state (loading=true, detail=null) covers the reset, so the effect body
  // stays free of synchronous setState.
  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    getMemberDetail(row.id)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [row]);

  // Close on Escape.
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  async function handleResendWelcome() {
    if (!row) return;
    setResending(true);
    setResendMsg(null);
    try {
      const res = await resendWelcomeEmail(row.id);
      if ("ok" in res) {
        setResendMsg({ ok: true, text: t("members.resendWelcomeOk") });
        // Refresh so the new "welcome-resend" entry appears in Comms history.
        const fresh = await getMemberDetail(row.id);
        setDetail(fresh);
      } else {
        setResendMsg({
          ok: false,
          text: t(`members.resendErrors.${res.error}`, {
            defaultValue: t("members.resendWelcomeError"),
          }),
        });
      }
    } catch {
      setResendMsg({ ok: false, text: t("members.resendWelcomeError") });
    } finally {
      setResending(false);
    }
  }

  async function handleRefund(orderId: string) {
    if (!row) return;
    setRefundBusy(true);
    setRefundError(null);
    try {
      const res = await fetch("/api/admin/billing/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: refundReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? t("billing.refundError"));
      // Refresh the drawer (order → refunded, lifetime paid recalculated) and the
      // members list behind it (refund revoked the membership → status changes).
      const fresh = await getMemberDetail(row.id);
      setDetail(fresh);
      setRefundOpenId(null);
      setRefundReason("");
      router.refresh();
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : t("billing.refundError"));
    } finally {
      setRefundBusy(false);
    }
  }

  // Localize edit-action errors, falling back to the generic message for any
  // unmapped error code so the drawer never shows a raw key.
  function editErr(code: string) {
    return t(`members.editErrors.${code}`, { defaultValue: t("errors.generic") });
  }

  function openAccountEdit() {
    setFormEmail(localEmail);
    setFormName(localName ?? "");
    setAccountError(null);
    setEditingAccount(true);
  }

  async function saveAccount() {
    if (!row) return;
    setAccountBusy(true);
    setAccountError(null);
    const nextEmail = formEmail.trim().toLowerCase();
    const nextName = formName.trim() || null;
    const emailChanged = nextEmail !== localEmail.toLowerCase();
    const nameChanged = nextName !== (localName ?? null);
    try {
      if (emailChanged) {
        const r = await updateMemberEmail(row.id, formEmail);
        if ("error" in r) {
          setAccountError(editErr(r.error));
          return;
        }
        setLocalEmail(nextEmail);
      }
      if (nameChanged) {
        const r = await updateMemberDisplayName(row.id, formName);
        if ("error" in r) {
          setAccountError(editErr(r.error));
          return;
        }
        setLocalName(nextName);
      }
      setEditingAccount(false);
      // Sync the table behind the drawer (email/name columns + search).
      router.refresh();
    } catch {
      setAccountError(t("errors.generic"));
    } finally {
      setAccountBusy(false);
    }
  }

  async function savePassword() {
    if (!row) return;
    if (formPw.length < 8) {
      setPwError(editErr("weak_password"));
      return;
    }
    setPwBusy(true);
    setPwError(null);
    try {
      const r = await setMemberPassword(row.id, formPw);
      if ("error" in r) {
        setPwError(editErr(r.error));
        return;
      }
      setFormPw("");
      setEditingPw(false);
      setPwOk(true);
    } catch {
      setPwError(t("errors.generic"));
    } finally {
      setPwBusy(false);
    }
  }

  function openFiscalEdit() {
    setFormFiscal({
      firstName: detail?.fiscal?.firstName ?? "",
      lastName: detail?.fiscal?.lastName ?? "",
      cpf: detail?.fiscal?.cpf ?? "",
      phone: detail?.fiscal?.phone ?? "",
      city: detail?.fiscal?.city ?? "",
      state: detail?.fiscal?.state ?? "",
    });
    setFiscalError(null);
    setEditingFiscal(true);
  }

  async function saveFiscal() {
    if (!row) return;
    setFiscalBusy(true);
    setFiscalError(null);
    try {
      const r = await updateMemberFiscal(row.id, formFiscal);
      if ("error" in r) {
        setFiscalError(editErr(r.error));
        return;
      }
      // Re-fetch so the read view reflects the saved values.
      const fresh = await getMemberDetail(row.id);
      setDetail(fresh);
      setEditingFiscal(false);
    } catch {
      setFiscalError(t("errors.generic"));
    } finally {
      setFiscalBusy(false);
    }
  }

  if (!row) return null;

  const name = localName || localEmail.split("@")[0];
  const daysLeft =
    row.membershipEndsAt && (row.status === "active" || row.status === "expiring")
      ? Math.max(
          0,
          Math.ceil((new Date(row.membershipEndsAt).getTime() - now) / 86_400_000),
        )
      : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />

      {/* Panel: full-screen on mobile, side sheet on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("members.details")}
        className="relative h-full w-full overflow-y-auto border-l border-border bg-background shadow-xl sm:max-w-md"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{name}</h2>
            <p className="truncate text-sm text-muted-foreground">{localEmail}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill status={row.status} />
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {row.role}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* Account */}
          <Section
            title={t("members.sectionAccount")}
            action={
              detail?.canManageAccess && !editingAccount ? (
                <EditButton label={t("members.editAccount")} onClick={openAccountEdit} />
              ) : null
            }
          >
            {editingAccount ? (
              <div className="space-y-3">
                <LabeledInput
                  label={t("members.email")}
                  type="email"
                  value={formEmail}
                  onChange={setFormEmail}
                  disabled={accountBusy}
                />
                <p className="-mt-1 text-xs text-muted-foreground">
                  {t("members.emailChangeHint")}
                </p>
                <LabeledInput
                  label={t("members.displayName")}
                  value={formName}
                  onChange={setFormName}
                  disabled={accountBusy}
                />
                {accountError && <p className="text-xs text-destructive">{accountError}</p>}
                <EditFormButtons
                  busy={accountBusy}
                  onSave={saveAccount}
                  onCancel={() => setEditingAccount(false)}
                  t={t}
                />
              </div>
            ) : (
              <>
                <Field label={t("members.cohort")} value={row.cohortName ?? t("members.noCohort")} />
                <Field label={t("members.joinedAt")} value={fmtDate(row.created_at)} />
                {row.membershipStartsAt && row.membershipEndsAt && (
                  <Field
                    label={t("members.membershipWindow")}
                    value={`${fmtDate(row.membershipStartsAt)} – ${fmtDate(row.membershipEndsAt)}`}
                  />
                )}
                {daysLeft !== null && (
                  <Field
                    label={t("members.daysRemaining")}
                    value={t(daysLeft === 1 ? "members.dayCountOne" : "members.dayCountOther", {
                      count: daysLeft,
                    })}
                  />
                )}
                <Field
                  label={t("members.lastActive")}
                  value={row.lastActiveAt ? fmtDate(row.lastActiveAt, true) : t("members.never")}
                />

                {detail?.canManageAccess && (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    {editingPw ? (
                      <div className="space-y-3">
                        {/* type=text: the admin is setting a temp password to relay
                            to the member, so it should be visible (and not autofilled). */}
                        <LabeledInput
                          label={t("members.newPassword")}
                          type="text"
                          value={formPw}
                          onChange={setFormPw}
                          disabled={pwBusy}
                        />
                        <p className="-mt-1 text-xs text-muted-foreground">
                          {t("members.passwordHint")}
                        </p>
                        {pwError && <p className="text-xs text-destructive">{pwError}</p>}
                        <EditFormButtons
                          busy={pwBusy}
                          onSave={savePassword}
                          onCancel={() => {
                            setEditingPw(false);
                            setFormPw("");
                            setPwError(null);
                          }}
                          t={t}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPw(true);
                            setPwOk(false);
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
                        >
                          <KeyRound className="h-4 w-4 shrink-0" />
                          {t("members.setPassword")}
                        </button>
                        {pwOk && (
                          <span className="text-xs text-green-700 dark:text-green-400">
                            {t("members.passwordSet")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Section>

          {/* Loading / error */}
          {loading && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {t("members.loadError")}
            </p>
          )}

          {detail && (
            <>
              {/* Engagement */}
              <Section title={t("members.sectionEngagement")}>
                {detail.completion ? (
                  <CompletionBars c={detail.completion} t={t} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("members.noEngagement")}</p>
                )}
                {detail.reviews && (
                  <div className="mt-3 flex gap-6">
                    <Stat label={t("members.reviewsDue")} value={detail.reviews.due} />
                    <Stat label={t("members.reviewsTotal")} value={detail.reviews.total} />
                  </div>
                )}
              </Section>

              {/* Billing — gated */}
              {detail.canSeeBilling && (
                <Section title={t("members.sectionBilling")}>
                  <div className="mb-3">
                    <Stat
                      label={t("members.lifetimePaidLabel")}
                      value={fmtMoney(detail.lifetimePaidCents)}
                    />
                  </div>
                  {detail.orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("members.noOrders")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.orders.map((o) => (
                        <li
                          key={o.id}
                          className="rounded-lg border border-border/60 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">{fmtMoney(o.amountCents)}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {fmtDate(o.createdAt)} ·{" "}
                                {o.paymentMethod === "pix"
                                  ? "Pix"
                                  : `${t("members.card")}${o.ccInstallments && o.ccInstallments > 1 ? ` · ${o.ccInstallments}x` : ""}`}
                                {o.cohortName ? ` · ${o.cohortName}` : ""}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_STYLE[o.status] ?? ORDER_STATUS_STYLE.pending}`}
                            >
                              {t(`billing.status${o.status.charAt(0).toUpperCase()}${o.status.slice(1)}`, {
                                defaultValue: o.status,
                              })}
                            </span>
                          </div>

                          {o.status === "paid" && refundOpenId !== o.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setRefundOpenId(o.id);
                                setRefundReason("");
                                setRefundError(null);
                              }}
                              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                            >
                              <RefreshCw className="h-4 w-4 shrink-0" />
                              {t("billing.refund")}
                            </button>
                          )}

                          {refundOpenId === o.id && (
                            <div className="mt-2 border-t border-border/60 pt-2">
                              <p className="mb-2 text-xs text-muted-foreground">
                                {t("billing.refundDesc", { email: localEmail })}
                              </p>
                              <textarea
                                value={refundReason}
                                onChange={(e) => setRefundReason(e.target.value)}
                                rows={2}
                                maxLength={500}
                                placeholder={t("billing.refundReasonPlaceholder")}
                                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                              />
                              {refundError && (
                                <p className="mt-2 text-xs text-destructive">{refundError}</p>
                              )}
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRefundOpenId(null);
                                    setRefundError(null);
                                  }}
                                  disabled={refundBusy}
                                  className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-1 disabled:opacity-60"
                                >
                                  {t("common.cancel")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRefund(o.id)}
                                  disabled={refundBusy}
                                  className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                                >
                                  {refundBusy ? t("billing.refundSending") : t("billing.confirmRefund")}
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              {/* Fiscal identity — gated. Rendered whenever the viewer can see
                  billing so empty fiscal data can still be filled in. */}
              {detail.canSeeBilling && (
                <Section
                  title={t("members.sectionFiscal")}
                  action={
                    !editingFiscal ? (
                      <EditButton label={t("members.editFiscal")} onClick={openFiscalEdit} />
                    ) : null
                  }
                >
                  {editingFiscal ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <LabeledInput
                          label={t("members.firstName")}
                          value={formFiscal.firstName}
                          onChange={(v) => setFormFiscal((f) => ({ ...f, firstName: v }))}
                          disabled={fiscalBusy}
                        />
                        <LabeledInput
                          label={t("members.lastName")}
                          value={formFiscal.lastName}
                          onChange={(v) => setFormFiscal((f) => ({ ...f, lastName: v }))}
                          disabled={fiscalBusy}
                        />
                      </div>
                      <LabeledInput
                        label={t("members.cpf")}
                        value={formFiscal.cpf}
                        onChange={(v) => setFormFiscal((f) => ({ ...f, cpf: v }))}
                        disabled={fiscalBusy}
                      />
                      <LabeledInput
                        label={t("members.phone")}
                        value={formFiscal.phone}
                        onChange={(v) => setFormFiscal((f) => ({ ...f, phone: v }))}
                        disabled={fiscalBusy}
                      />
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <LabeledInput
                            label={t("members.cityLabel")}
                            value={formFiscal.city}
                            onChange={(v) => setFormFiscal((f) => ({ ...f, city: v }))}
                            disabled={fiscalBusy}
                          />
                        </div>
                        <LabeledInput
                          label={t("members.stateLabel")}
                          value={formFiscal.state}
                          onChange={(v) => setFormFiscal((f) => ({ ...f, state: v }))}
                          disabled={fiscalBusy}
                        />
                      </div>
                      {fiscalError && <p className="text-xs text-destructive">{fiscalError}</p>}
                      <EditFormButtons
                        busy={fiscalBusy}
                        onSave={saveFiscal}
                        onCancel={() => setEditingFiscal(false)}
                        t={t}
                      />
                    </div>
                  ) : detail.fiscal ? (
                    <>
                      {(detail.fiscal.firstName || detail.fiscal.lastName) && (
                        <Field
                          label={t("members.displayName")}
                          value={`${detail.fiscal.firstName ?? ""} ${detail.fiscal.lastName ?? ""}`.trim()}
                        />
                      )}
                      {detail.fiscal.cpf && <Field label={t("members.cpf")} value={detail.fiscal.cpf} />}
                      {detail.fiscal.phone && (
                        <Field label={t("members.phone")} value={detail.fiscal.phone} />
                      )}
                      {(detail.fiscal.city || detail.fiscal.state) && (
                        <Field
                          label={t("members.location")}
                          value={[detail.fiscal.city, detail.fiscal.state].filter(Boolean).join(" / ")}
                        />
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("members.noFiscal")}</p>
                  )}
                </Section>
              )}

              {/* Comms */}
              <Section title={t("members.sectionComms")}>
                {detail.emails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("members.noEmails")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.emails.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">
                          {t(EMAIL_KIND_KEYS[e.kind] ?? "", { defaultValue: e.kind })}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {fmtDate(e.sentAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {detail.canManageAccess && (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <button
                      type="button"
                      onClick={handleResendWelcome}
                      disabled={resending}
                      className="inline-flex items-center gap-2 rounded-lg border border-brand/40 px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10 disabled:opacity-60"
                    >
                      <Mail className="h-4 w-4 shrink-0" />
                      {resending
                        ? t("members.resendWelcomeSending")
                        : t("members.resendWelcome")}
                    </button>
                    {resendMsg && (
                      <p
                        className={`mt-2 text-xs ${
                          resendMsg.ok
                            ? "text-green-700 dark:text-green-400"
                            : "text-destructive"
                        }`}
                      >
                        {resendMsg.text}
                      </p>
                    )}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      <div className="rounded-xl border border-border bg-surface-1 p-4">{children}</div>
    </section>
  );
}

// Small "Editar" affordance shown in a Section header.
function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
    >
      <Pencil className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}

// Labeled text input used across the inline edit forms.
function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand/50 disabled:opacity-60"
      />
    </label>
  );
}

// Shared Cancel / Save button pair for the inline edit forms.
function EditFormButtons({
  busy,
  onSave,
  onCancel,
  t,
}: {
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-1 disabled:opacity-60"
      >
        {t("common.cancel")}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? t("common.loading") : t("common.save")}
      </button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CompletionBars({
  c,
  t,
}: {
  c: MemberCompletion;
  t: (key: string) => string;
}) {
  const bars = [
    { label: t("members.lessonsLabel"), done: c.lessonsDone, total: c.lessonsTotal },
    { label: t("members.quizLabel"), done: c.quizDone, total: c.quizTotal },
    { label: t("members.flashcardsLabel"), done: c.flashDone, total: c.flashTotal },
  ];
  return (
    <div className="space-y-2.5">
      {bars.map((b) => {
        const p = pct(b.done, b.total);
        return (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{b.label}</span>
              <span className="font-medium tabular-nums">
                {b.done}/{b.total} · {p}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
