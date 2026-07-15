"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { AlertTriangle, Ban, Eye, EyeOff, Loader2, Send, X } from "lucide-react";
import {
  buildBroadcastTemplate,
  renderEmail,
  type BroadcastSpec,
  type EmailSettingsRow,
} from "@/lib/email-render";

// Compose + send a one-off custom email to leads (/admin/leads "Enviar e-mail").
// The admin writes a subject + message (plus an optional headline and CTA button);
// a live branded preview renders the EXACT HTML the server will send (same
// buildBroadcastTemplate + renderEmail). Recipients are either the checkbox
// selection or the whole filtered view, and the AUDIENCE is chosen per send:
// converted customers and unverified leads are opt-out toggles (default in);
// unsubscribed/bounced are always excluded (compliance — shown but locked). A live
// breakdown makes the exact recipient count obvious before the two-step confirm; a
// "send test to myself" guards against firing a real blast by accident.

type Scope = "selected" | "filtered";

// One count per audience bucket, precomputed by the parent for each scope. The
// modal buckets the current scope and applies the include toggles live.
export type AudienceCounts = {
  active: number; // verified, not converted — the core prospect list (always in)
  unverified: number; // never confirmed their inbox (opt-out)
  converted: number; // bought (opt-out)
  unsubscribed: number; // opted out — always excluded
  bounced: number; // hard bounce — always excluded
};

export type AudienceChoice = { includeConverted: boolean; includeUnverified: boolean };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedAudience: AudienceCounts;
  filteredAudience: AudienceCounts;
  defaultScope: Scope;
  emailSettings: EmailSettingsRow;
  // Parent resolves the scope → id list, calls the action with the chosen audience,
  // and owns the toast + refresh. Returns ok=false with a translated message to show
  // inline (e.g. the server's "too many recipients" refusal); ok=true means it
  // closed the modal.
  onSend: (scope: Scope, spec: BroadcastSpec, audience: AudienceChoice) => Promise<{ ok: boolean; error?: string }>;
  onSendTest: (spec: BroadcastSpec) => Promise<{ ok: boolean; email: string | null }>;
}

const sumAudience = (a: AudienceCounts) =>
  a.active + a.unverified + a.converted + a.unsubscribed + a.bounced;

export function BulkBroadcastModal({
  isOpen,
  onClose,
  selectedAudience,
  filteredAudience,
  defaultScope,
  emailSettings,
  onSend,
  onSendTest,
}: Props) {
  const { t } = useTranslation();

  const [scope, setScope] = useState<Scope>(defaultScope);
  const [includeConverted, setIncludeConverted] = useState(true);
  const [includeUnverified, setIncludeUnverified] = useState(true);
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [withGreeting, setWithGreeting] = useState(true);

  const [showPreview, setShowPreview] = useState(false); // mobile toggle; lg always shows
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const spec: BroadcastSpec = useMemo(
    () => ({
      subject: subject.trim(),
      headline: headline.trim() || undefined,
      bodyText: body,
      ctaLabel: ctaLabel.trim() || undefined,
      ctaHref: ctaHref.trim() || undefined,
      withGreeting,
    }),
    [subject, headline, body, ctaLabel, ctaHref, withGreeting],
  );

  // The audience math for the current scope. `willReceive` reflects the live toggle
  // choices; unsubscribed + bounced are always locked out.
  const pool = scope === "selected" ? selectedAudience : filteredAudience;
  const lockedOut = pool.unsubscribed + pool.bounced;
  const willReceive =
    pool.active +
    (includeConverted ? pool.converted : 0) +
    (includeUnverified ? pool.unverified : 0);

  const selectedTotal = sumAudience(selectedAudience);
  const filteredTotal = sumAudience(filteredAudience);

  // Exact live preview — same builder + renderer the server sends with. Sample
  // greeting/unsubscribe stand in for the per-recipient values.
  const previewHtml = useMemo(() => {
    const tpl = buildBroadcastTemplate({
      ...spec,
      subject: spec.subject || t("leads.broadcastSubjectPlaceholder"),
    });
    const { html } = renderEmail(tpl, emailSettings, {
      greeting: withGreeting ? "Oi, Maria! " : "",
      unsubscribeUrl: `${emailSettings.app_url}/api/leads/unsubscribe?t=exemplo`,
    });
    return html;
  }, [spec, emailSettings, withGreeting, t]);

  const canCompose = subject.trim().length > 0 && body.trim().length > 0;

  const resetAndClose = () => {
    setConfirming(false);
    setInlineError(null);
    setTestMsg(null);
    onClose();
  };

  const handlePrimary = async () => {
    setInlineError(null);
    if (!canCompose) {
      setInlineError(t("leads.broadcastEmptyFields"));
      return;
    }
    if (willReceive === 0) {
      setInlineError(t("leads.broadcastNoRecipients"));
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSending(true);
    try {
      const res = await onSend(scope, spec, { includeConverted, includeUnverified });
      if (!res.ok) {
        setConfirming(false);
        setInlineError(res.error ?? t("leads.broadcastError"));
      }
      // On success the parent closes the modal (isOpen → false); nothing to do here.
    } finally {
      setSending(false);
    }
  };

  const handleTest = async () => {
    setInlineError(null);
    setTestMsg(null);
    if (!canCompose) {
      setInlineError(t("leads.broadcastEmptyFields"));
      return;
    }
    setTesting(true);
    try {
      const res = await onSendTest(spec);
      setTestMsg(
        res.ok
          ? t("leads.broadcastTestSent", { email: res.email ?? "" })
          : t("leads.broadcastTestFailed"),
      );
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  const busy = sending || testing;
  const inputCls =
    "w-full min-h-[44px] rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:min-h-0";
  const scopeCls = (active: boolean, disabled = false) =>
    `flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
      active ? "border-brand/50 bg-brand/10" : "border-border bg-surface-2/30 hover:bg-surface-2/60"
    } ${disabled ? "cursor-not-allowed opacity-50" : ""}`;
  const audienceRowCls =
    "flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/30 px-3 py-2 text-sm sm:min-h-0";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center">
      <div className="relative flex w-full max-w-3xl flex-col overflow-hidden bg-surface-1 shadow-lg sm:mx-4 sm:max-h-[92vh] sm:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-lg font-bold">{t("leads.broadcastTitle")}</h2>
          <button
            onClick={resetAndClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-surface-2"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — form + preview (side-by-side on lg, stacked on mobile) */}
        <div className="grid flex-1 gap-0 overflow-y-auto lg:grid-cols-2">
          {/* Compose form */}
          <div className="space-y-4 border-b border-border p-4 sm:p-6 lg:border-b-0 lg:border-r">
            {/* Scope */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("leads.broadcastScopeLabel")}
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={scopeCls(scope === "selected", selectedTotal === 0)}>
                  <input
                    type="radio"
                    name="broadcast-scope"
                    checked={scope === "selected"}
                    disabled={selectedTotal === 0}
                    onChange={() => setScope("selected")}
                    className="h-4 w-4"
                  />
                  <span>{t("leads.broadcastScopeSelected", { count: selectedTotal })}</span>
                </label>
                <label className={scopeCls(scope === "filtered")}>
                  <input
                    type="radio"
                    name="broadcast-scope"
                    checked={scope === "filtered"}
                    onChange={() => setScope("filtered")}
                    className="h-4 w-4"
                  />
                  <span>{t("leads.broadcastScopeFiltered", { count: filteredTotal })}</span>
                </label>
              </div>
            </div>

            {/* Audience — who gets it, chosen per send */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("leads.broadcastAudienceLabel")}
              </label>
              <div className="space-y-2">
                <div className={audienceRowCls}>
                  <span>{t("leads.broadcastAudienceActive")}</span>
                  <span className="font-medium tabular-nums">{pool.active}</span>
                </div>

                {pool.converted > 0 && (
                  <label className={`${audienceRowCls} cursor-pointer hover:bg-surface-2/60`}>
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeConverted}
                        onChange={(e) => setIncludeConverted(e.target.checked)}
                        className="h-4 w-4"
                      />
                      {t("leads.broadcastAudienceConverted")}
                    </span>
                    <span className="font-medium tabular-nums">{pool.converted}</span>
                  </label>
                )}

                {pool.unverified > 0 && (
                  <div>
                    <label className={`${audienceRowCls} cursor-pointer hover:bg-surface-2/60`}>
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={includeUnverified}
                          onChange={(e) => setIncludeUnverified(e.target.checked)}
                          className="h-4 w-4"
                        />
                        {t("leads.broadcastAudienceUnverified")}
                      </span>
                      <span className="font-medium tabular-nums">{pool.unverified}</span>
                    </label>
                    {includeUnverified && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {t("leads.broadcastAudienceUnverifiedHint")}
                      </p>
                    )}
                  </div>
                )}

                {lockedOut > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Ban className="h-3.5 w-3.5" />
                      {t("leads.broadcastAudienceLocked")}
                    </span>
                    <span className="tabular-nums">{lockedOut}</span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm">
                <span className="font-semibold tabular-nums text-brand">{willReceive}</span>{" "}
                <span className="text-muted-foreground">{t("leads.broadcastWillReceive")}</span>
              </p>
            </div>

            {/* Subject */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("leads.broadcastSubject")}
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("leads.broadcastSubjectPlaceholder")}
                className={inputCls}
                maxLength={200}
              />
            </div>

            {/* Headline (optional) */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("leads.broadcastHeadline")}
              </label>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder={t("leads.broadcastHeadlinePlaceholder")}
                className={inputCls}
                maxLength={120}
              />
            </div>

            {/* Message body */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("leads.broadcastBody")}
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("leads.broadcastBodyPlaceholder")}
                rows={8}
                className="w-full resize-y rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("leads.broadcastBodyHint")}</p>
            </div>

            {/* Greeting toggle */}
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm sm:min-h-0">
              <input
                type="checkbox"
                checked={withGreeting}
                onChange={(e) => setWithGreeting(e.target.checked)}
                className="h-4 w-4"
              />
              <span>{t("leads.broadcastGreeting")}</span>
            </label>

            {/* CTA button (optional) */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("leads.broadcastCtaLabel")}
                </label>
                <input
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder={t("leads.broadcastCtaLabelPlaceholder")}
                  className={inputCls}
                  maxLength={60}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("leads.broadcastCtaHref")}
                </label>
                <input
                  value={ctaHref}
                  onChange={(e) => setCtaHref(e.target.value)}
                  placeholder="https://…"
                  className={inputCls}
                  maxLength={300}
                />
              </div>
            </div>

            {/* Mobile: toggle preview */}
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2/50 lg:hidden"
            >
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPreview ? t("leads.broadcastHidePreview") : t("leads.broadcastShowPreview")}
            </button>
          </div>

          {/* Preview */}
          <div className={`${showPreview ? "block" : "hidden"} bg-surface-2/30 p-4 sm:p-6 lg:block`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("leads.broadcastPreview")}
            </p>
            <iframe
              title={t("leads.broadcastPreview")}
              srcDoc={previewHtml}
              sandbox=""
              className="h-[360px] w-full rounded-lg border border-border bg-white sm:h-[440px]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="space-y-2 border-t border-border p-4 sm:px-6">
          {inlineError && (
            <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {inlineError}
            </p>
          )}
          {testMsg && <p className="text-sm text-green-600 dark:text-green-400">{testMsg}</p>}
          {confirming && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              {t("leads.broadcastConfirmWarning", { count: willReceive })}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleTest}
              disabled={busy || !canCompose}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2/50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("leads.broadcastSendTest")}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={confirming ? () => setConfirming(false) : resetAndClose}
                disabled={sending}
                className="min-h-[44px] rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-2/80 disabled:opacity-50 sm:min-h-0"
              >
                {confirming ? t("leads.broadcastBack") : t("common.cancel")}
              </button>
              <button
                onClick={handlePrimary}
                disabled={busy || !canCompose || willReceive === 0}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("leads.broadcastSending")}
                  </>
                ) : confirming ? (
                  t("leads.broadcastConfirmSend")
                ) : (
                  t(willReceive === 1 ? "leads.broadcastPrimaryOne" : "leads.broadcastPrimaryOther", {
                    count: willReceive,
                  })
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
