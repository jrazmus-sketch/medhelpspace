"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import {
  X,
  Check,
  CheckCheck,
  Eye,
  MousePointerClick,
  AlertTriangle,
  Ban,
  ExternalLink,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  CircleCheck,
  CircleDot,
} from "lucide-react";
import { getLeadDetail } from "@/actions/leads";
import type { LeadDetail, LeadEmail, LeadQuizAnswer } from "@/lib/admin/lead-detail";
import type { LeadRow } from "@/lib/admin/leads";

// Friendly i18n key per funnel email kind. Unknown kinds fall back to the raw value.
const EMAIL_KIND_KEYS: Record<string, string> = {
  "lead-code": "leads.emailKind.code",
  "lead-d0": "leads.emailKind.d0",
  "lead-d1": "leads.emailKind.d1",
  "lead-d2": "leads.emailKind.d2",
  "lead-d4": "leads.emailKind.d4",
  "lead-d7": "leads.emailKind.d7",
  "lead-recover-finished": "leads.emailKind.recoverFinished",
  "lead-recover-unfinished-1": "leads.emailKind.recoverUnfinished1",
  "lead-recover-unfinished-2": "leads.emailKind.recoverUnfinished2",
};

interface Props {
  row: LeadRow | null;
  onClose: () => void;
}

export function LeadDetailDrawer({ row, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  // Parent remounts per lead (key={row.id}) → fresh loading state each open.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function fmt(iso: string | null, withTime = false) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }

  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    getLeadDetail(row.id)
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

  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  if (!row) return null;

  const name = row.firstName || row.email.split("@")[0];
  const emailKindLabel = (kind: string | null) =>
    kind ? t(EMAIL_KIND_KEYS[kind] ?? "", { defaultValue: kind }) : t("leads.emailKind.unknown");
  const anyTracked = (detail?.emails ?? []).some((e) => e.tracked);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />

      {/* Full-screen on mobile, side sheet on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("leads.detailTitle")}
        className="relative h-full w-full overflow-y-auto border-l border-border bg-background shadow-xl sm:max-w-md"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{name}</h2>
            <p className="truncate text-sm text-muted-foreground">{row.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {t(`leads.tier_${row.tier}`)}
              </span>
              {row.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <CircleCheck className="h-3 w-3" />
                  {t("leads.verified")}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {loading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {t("leads.loadError")}
            </p>
          )}

          {detail && (
            <>
              {/* Verify / lifecycle timeline */}
              <Section title={t("leads.sectionTimeline")}>
                <ul className="space-y-2.5">
                  <TimelineRow
                    label={t("leads.tlCaptured")}
                    value={fmt(detail.createdAt, true)}
                    done
                  />
                  <TimelineRow
                    label={t("leads.tlAnswered")}
                    value={
                      detail.questionsAnswered != null
                        ? t("leads.answeredCount", { n: detail.questionsAnswered })
                        : "—"
                    }
                    done={(detail.questionsAnswered ?? 0) > 0}
                  />
                  <TimelineRow
                    label={t("leads.tlCompleted")}
                    value={fmt(detail.completedAt, true)}
                    done={Boolean(detail.completedAt)}
                  />
                  <TimelineRow
                    label={t("leads.tlCodeSent")}
                    value={
                      detail.codeSentAt
                        ? `${fmt(detail.codeSentAt, true)}${detail.codeAttempts > 0 ? ` · ${t("leads.codeAttempts", { n: detail.codeAttempts })}` : ""}`
                        : "—"
                    }
                    done={Boolean(detail.codeSentAt)}
                  />
                  <TimelineRow
                    label={t("leads.tlVerified")}
                    value={fmt(detail.verifiedAt, true)}
                    done={Boolean(detail.verifiedAt)}
                  />
                  <TimelineRow
                    label={t("leads.tlConverted")}
                    value={fmt(detail.convertedAt, true)}
                    done={Boolean(detail.convertedAt)}
                    good
                  />
                  {detail.unsubscribedAt && (
                    <TimelineRow
                      label={t("leads.tlUnsubscribed")}
                      value={fmt(detail.unsubscribedAt, true)}
                      done
                      bad
                    />
                  )}
                </ul>
              </Section>

              {/* Quiz result */}
              <Section
                title={t("leads.sectionQuiz")}
                right={
                  detail.score != null ? (
                    <span className="text-sm font-semibold tabular-nums">
                      {detail.score}/{detail.questionsAnswered ?? 15}
                    </span>
                  ) : null
                }
              >
                {detail.answers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("leads.noAnswers")}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-1.5">
                      {detail.answers.map((a, i) => (
                        <AnswerRow key={`${a.questionId}-${i}`} n={i + 1} a={a} t={t} />
                      ))}
                    </div>
                    {detail.weakSpecialties.length > 0 && (
                      <div className="mt-3 border-t border-border/60 pt-3">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                          {t("leads.weakSpecialties")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {detail.weakSpecialties.map((s) => (
                            <span
                              key={s}
                              className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Section>

              {/* Emails */}
              <Section title={t("leads.sectionEmails")}>
                {detail.emails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("leads.noEmails")}</p>
                ) : (
                  <ul className="space-y-2.5">
                    {detail.emails.map((e, i) => (
                      <EmailRow
                        key={`${e.kind ?? "email"}-${i}`}
                        e={e}
                        label={emailKindLabel(e.kind)}
                        fmt={fmt}
                        t={t}
                      />
                    ))}
                  </ul>
                )}
                {detail.emails.length > 0 && !anyTracked && (
                  <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    {t("leads.trackingHint")}
                  </p>
                )}
              </Section>

              {/* Attribution */}
              <Section title={t("leads.sectionAttribution")}>
                <Field label={t("leads.attrSource")} value={detail.utmSource ?? detail.source ?? t("leads.sourceOrganic")} />
                {detail.utmCampaign && <Field label={t("leads.attrCampaign")} value={detail.utmCampaign} />}
                {detail.utmMedium && <Field label={t("leads.attrMedium")} value={detail.utmMedium} />}
                {detail.utmTerm && <Field label={t("leads.attrTerm")} value={detail.utmTerm} />}
                {detail.utmContent && <Field label={t("leads.attrContent")} value={detail.utmContent} />}
                {detail.gclid && <Field label={t("leads.attrGclid")} value={detail.gclid} mono />}
                {detail.landingReferrer && (
                  <Field label={t("leads.attrReferrer")} value={detail.landingReferrer} mono />
                )}
                {detail.landingPath && <Field label={t("leads.attrLanding")} value={detail.landingPath} mono />}
              </Section>

              {/* Capture context — only render when we have any of it */}
              {(detail.deviceType || detail.geoCity || detail.geoRegion || detail.geoCountry) && (
                <Section title={t("leads.sectionContext")}>
                  {detail.deviceType && (
                    <div className="flex items-center gap-2 py-1 text-sm">
                      <DeviceIcon type={detail.deviceType} />
                      <span className="capitalize">{t(`leads.device_${detail.deviceType}`, { defaultValue: detail.deviceType })}</span>
                    </div>
                  )}
                  {(detail.geoCity || detail.geoRegion || detail.geoCountry) && (
                    <div className="flex items-center gap-2 py-1 text-sm">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>
                        {[detail.geoCity, detail.geoRegion, detail.geoCountry]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                </Section>
              )}

              {/* Journey + durable link */}
              {(detail.funnelEvents.length > 0 || detail.resultToken) && (
                <Section title={t("leads.sectionJourney")}>
                  {detail.funnelEvents.length > 0 ? (
                    <ul className="space-y-1.5">
                      {detail.funnelEvents.map((f, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 text-sm">
                          <span>{t(`funnel.stage_${f.type === "quiz_start" ? "start" : f.type}`, { defaultValue: f.type })}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{fmt(f.at, true)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("leads.noJourney")}</p>
                  )}
                  {detail.resultToken && (
                    <a
                      href={`/questoes-revalida/resultado?lead=${detail.resultToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 border-t border-border/60 pt-3 text-sm font-medium text-brand hover:underline"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      {t("leads.viewResultPage")}
                    </a>
                  )}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {right}
      </div>
      <div className="rounded-xl border border-border bg-surface-1 p-4">{children}</div>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-all text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function TimelineRow({
  label,
  value,
  done,
  good,
  bad,
}: {
  label: string;
  value: string;
  done: boolean;
  good?: boolean;
  bad?: boolean;
}) {
  const dot = bad
    ? "text-red-500"
    : good && done
      ? "text-green-600 dark:text-green-400"
      : done
        ? "text-brand"
        : "text-muted-foreground/40";
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2">
        {done ? (
          <CircleCheck className={`h-4 w-4 shrink-0 ${dot}`} />
        ) : (
          <CircleDot className={`h-4 w-4 shrink-0 ${dot}`} />
        )}
        <span className={done ? "" : "text-muted-foreground"}>{label}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{value}</span>
    </li>
  );
}

function AnswerRow({
  n,
  a,
  t,
}: {
  n: number;
  a: LeadQuizAnswer;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-semibold ${
          a.isCorrect
            ? "bg-green-500/15 text-green-700 dark:text-green-400"
            : "bg-red-500/15 text-red-600 dark:text-red-400"
        }`}
      >
        {a.isCorrect ? "✓" : "✕"}
      </span>
      <span className="text-muted-foreground tabular-nums">{t("leads.qShort", { n })}</span>
      <span className="min-w-0 truncate">{a.specialtyName ?? "—"}</span>
    </div>
  );
}

function EmailRow({
  e,
  label,
  fmt,
  t,
}: {
  e: LeadEmail;
  label: string;
  fmt: (iso: string | null, withTime?: boolean) => string;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  return (
    <li className="rounded-lg border border-border/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground" title={e.estimated ? t("leads.estimatedDate") : undefined}>
          {e.estimated ? "≈ " : ""}
          {fmt(e.sentAt, true)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {e.complained ? (
          <Badge tone="bad" icon={<Ban className="h-3 w-3" />} text={t("leads.evComplained")} />
        ) : e.bounced ? (
          <Badge tone="bad" icon={<AlertTriangle className="h-3 w-3" />} text={t("leads.evBounced")} />
        ) : (
          <>
            <Badge
              tone={e.tracked ? "on" : "off"}
              icon={e.delivered ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              text={
                e.tracked && e.delivered
                  ? t("leads.evDelivered")
                  : t("leads.evSent")
              }
            />
            {e.opens > 0 && (
              <Badge
                tone="info"
                icon={<Eye className="h-3 w-3" />}
                text={e.opens > 1 ? t("leads.evOpenedN", { n: e.opens }) : t("leads.evOpened")}
              />
            )}
            {e.clicks > 0 && (
              <Badge
                tone="good"
                icon={<MousePointerClick className="h-3 w-3" />}
                text={e.clicks > 1 ? t("leads.evClickedN", { n: e.clicks }) : t("leads.evClicked")}
              />
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Badge({
  tone,
  icon,
  text,
}: {
  tone: "on" | "off" | "info" | "good" | "bad";
  icon: React.ReactNode;
  text: string;
}) {
  const cls =
    tone === "good"
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : tone === "info"
        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
        : tone === "bad"
          ? "bg-red-500/15 text-red-600 dark:text-red-400"
          : tone === "on"
            ? "bg-surface-2 text-foreground"
            : "bg-surface-2 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {icon}
      {text}
    </span>
  );
}

function DeviceIcon({ type }: { type: string }) {
  const c = "h-4 w-4 shrink-0 text-muted-foreground";
  if (type === "mobile") return <Smartphone className={c} />;
  if (type === "tablet") return <Tablet className={c} />;
  return <Monitor className={c} />;
}
