"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { X, Mail } from "lucide-react";
import { getMemberDetail, resendWelcomeEmail } from "@/actions/admin";
import { StatusPill } from "./member-status-pill";
import type {
  MemberDetail,
  MemberListRow,
  MemberCompletion,
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
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

interface Props {
  row: MemberListRow | null;
  onClose: () => void;
}

export function MemberDetailDrawer({ row, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";

  function fmtDate(iso: string, withTime = false) {
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }

  // Lazy-load the heavy per-member detail only when the drawer opens.
  useEffect(() => {
    if (!row) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setDetail(null);
    setResendMsg(null);
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

  if (!row) return null;

  const name = row.display_name || row.email.split("@")[0];
  const daysLeft =
    row.membershipEndsAt && (row.status === "active" || row.status === "expiring")
      ? Math.max(
          0,
          Math.ceil((new Date(row.membershipEndsAt).getTime() - Date.now()) / 86_400_000),
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
            <p className="truncate text-sm text-muted-foreground">{row.email}</p>
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
          <Section title={t("members.sectionAccount")}>
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
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
                        >
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
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              {/* Fiscal identity — gated */}
              {detail.canSeeBilling && detail.fiscal && (
                <Section title={t("members.sectionFiscal")}>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="rounded-xl border border-border bg-surface-1 p-4">{children}</div>
    </section>
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
