"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  renderEmail,
  sampleVarsFor,
  extractTags,
  isKnownTag,
  type EmailTemplateRow,
  type EmailSettingsRow,
} from "@/lib/email-render";
import {
  updateEmailTemplate,
  updateEmailSettings,
  sendTestTemplateEmail,
} from "@/actions/email-templates";

type Props = {
  templates: EmailTemplateRow[];
  settings: EmailSettingsRow;
  adminEmail: string;
};

// Editable subset of a template (variables/name/description are read-only metadata).
type TemplateDraft = Pick<
  EmailTemplateRow,
  "subject" | "kicker" | "headline" | "body_html" | "cta_label" | "cta_href" | "active"
>;

const inputCls =
  "w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50";
const labelCls = "text-sm text-muted-foreground";

export function EmailTemplatesClient({ templates, settings, adminEmail }: Props) {
  const { t } = useTranslation();
  const { profile } = useAuth();

  // ── Settings (footer) state — shared so the preview reflects footer edits live.
  const [settingsState, setSettingsState] = useState<EmailSettingsRow>(settings);

  // ── Selected template + per-template edit drafts (keyed by kind).
  const [selectedKind, setSelectedKind] = useState<string>(
    templates[0]?.kind ?? "",
  );
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>(() => {
    const seed: Record<string, TemplateDraft> = {};
    for (const tmpl of templates) {
      seed[tmpl.kind] = {
        subject: tmpl.subject,
        kicker: tmpl.kicker,
        headline: tmpl.headline,
        body_html: tmpl.body_html,
        cta_label: tmpl.cta_label,
        cta_href: tmpl.cta_href,
        active: tmpl.active,
      };
    }
    return seed;
  });

  const selected = useMemo(
    () => templates.find((tmpl) => tmpl.kind === selectedKind) ?? templates[0],
    [templates, selectedKind],
  );
  const draft = selected ? drafts[selected.kind] : undefined;

  // The live "row" the preview + validation operate on = static metadata + draft
  // edits. Memoized so the downstream preview/unknownTags memos have a stable dep.
  const liveTemplate = useMemo<EmailTemplateRow | null>(
    () => (selected && draft ? { ...selected, ...draft } : null),
    [selected, draft],
  );

  function patchDraft(patch: Partial<TemplateDraft>) {
    if (!selected) return;
    setDrafts((prev) => ({
      ...prev,
      [selected.kind]: { ...prev[selected.kind], ...patch },
    }));
  }

  function patchSettings(patch: Partial<EmailSettingsRow>) {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }

  // ── Live preview (PURE renderEmail — safe in the client). Reflects both the
  //    selected template's draft AND the live settings/footer state.
  const preview = useMemo(() => {
    if (!liveTemplate) return { subject: "", html: "" };
    return renderEmail(liveTemplate, settingsState, sampleVarsFor(liveTemplate));
  }, [liveTemplate, settingsState]);

  // ── Unknown-tag detection (typos like {{cohort}}). Blocks template save.
  const unknownTags = useMemo(() => {
    if (!liveTemplate) return [] as string[];
    return extractTags(liveTemplate).filter((tag) => !isKnownTag(tag, liveTemplate));
  }, [liveTemplate]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("emailTemplates.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("emailTemplates.subtitle")}</p>
      </header>

      {/* Template selector — horizontally-scrollable chip row on mobile. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {templates.map((tmpl) => {
          const isActive = tmpl.kind === selectedKind;
          const isOff = !drafts[tmpl.kind]?.active;
          return (
            <button
              key={tmpl.kind}
              type="button"
              onClick={() => setSelectedKind(tmpl.kind)}
              className={[
                "flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <span>{tmpl.name}</span>
              {isOff && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  {t("emailTemplates.inactiveBadge")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Editor (left) + sticky preview (right) on lg; stacked on mobile. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {selected && draft && liveTemplate ? (
          <TemplateEditor
            key={selected.kind}
            template={selected}
            draft={draft}
            unknownTags={unknownTags}
            onPatch={patchDraft}
            adminEmail={profile?.email ?? adminEmail}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("emailTemplates.noTemplates")}</p>
        )}

        <div className="lg:sticky lg:top-20 lg:self-start">
          <PreviewPane subject={preview.subject} html={preview.html} />
        </div>
      </div>

      {/* Global send/footer settings — its own card, full width below. */}
      <SettingsEditor settings={settingsState} onPatch={patchSettings} />
    </div>
  );
}

// ── Template editor ─────────────────────────────────────────────────────────────

function TemplateEditor({
  template,
  draft,
  unknownTags,
  onPatch,
  adminEmail,
}: {
  template: EmailTemplateRow;
  draft: TemplateDraft;
  unknownTags: string[];
  onPatch: (patch: Partial<TemplateDraft>) => void;
  adminEmail: string;
}) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Insert {{tag}} at the textarea cursor (or append). Body is the most common
  // target so chips write there.
  function insertTag(tag: string) {
    const el = bodyRef.current;
    const token = `{{${tag}}}`;
    if (!el) {
      onPatch({ body_html: `${draft.body_html}${token}` });
      return;
    }
    const start = el.selectionStart ?? draft.body_html.length;
    const end = el.selectionEnd ?? draft.body_html.length;
    const next = draft.body_html.slice(0, start) + token + draft.body_html.slice(end);
    onPatch({ body_html: next });
    // Restore focus + caret after the inserted token.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function handleSave() {
    setSaved(false);
    setSaveError(null);
    if (unknownTags.length > 0) {
      setSaveError(t("emailTemplates.unknownTagWarning", { tags: unknownTags.join(", ") }));
      return;
    }
    startTransition(async () => {
      const res = await updateEmailTemplate({
        kind: template.kind,
        subject: draft.subject,
        kicker: draft.kicker,
        headline: draft.headline,
        body_html: draft.body_html,
        cta_label: draft.cta_label,
        cta_href: draft.cta_href,
        active: draft.active,
        variables: template.variables,
      });
      if ("error" in res) {
        setSaveError(
          res.error === "unknown_tag" && res.tag
            ? t("emailTemplates.unknownTagWarning", { tags: res.tag })
            : t("emailTemplates.saveError"),
        );
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">{template.name}</CardTitle>
          {template.description && (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-1">
            <span className={labelCls}>{t("emailTemplates.fieldSubject")}</span>
            <input
              value={draft.subject}
              onChange={(e) => onPatch({ subject: e.target.value })}
              className={inputCls}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>{t("emailTemplates.fieldKicker")}</span>
            <input
              value={draft.kicker}
              onChange={(e) => onPatch({ kicker: e.target.value })}
              className={inputCls}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>{t("emailTemplates.fieldHeadline")}</span>
            <input
              value={draft.headline}
              onChange={(e) => onPatch({ headline: e.target.value })}
              className={inputCls}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>{t("emailTemplates.fieldBody")}</span>
            <textarea
              ref={bodyRef}
              value={draft.body_html}
              onChange={(e) => onPatch({ body_html: e.target.value })}
              rows={12}
              className={`${inputCls} font-mono text-xs leading-relaxed`}
            />
            <span className="block text-xs text-muted-foreground">
              {t("emailTemplates.bodyHelp")}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelCls}>{t("emailTemplates.fieldCtaLabel")}</span>
              <input
                value={draft.cta_label}
                onChange={(e) => onPatch({ cta_label: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>{t("emailTemplates.fieldCtaHref")}</span>
              <input
                value={draft.cta_href}
                onChange={(e) => onPatch({ cta_href: e.target.value })}
                placeholder="/app/plano"
                className={inputCls}
              />
            </label>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={draft.active}
              onClick={() => onPatch({ active: !draft.active })}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                draft.active ? "bg-brand" : "bg-surface-2 border border-border",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  draft.active ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
            </button>
            <span className="text-sm">
              {draft.active
                ? t("emailTemplates.activeOn")
                : t("emailTemplates.activeOff")}
            </span>
          </label>

          {/* Variable chips */}
          <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("emailTemplates.variablesTitle")}
            </p>
            <p className="text-xs text-muted-foreground">{t("emailTemplates.variablesHelp")}</p>
            <div className="flex flex-wrap gap-2">
              {template.variables.map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => insertTag(v.tag)}
                  title={v.description}
                  className="rounded-md border border-border bg-surface-1 px-2 py-1 font-mono text-xs text-foreground hover:border-brand/50 hover:text-brand"
                >
                  {`{{${v.tag}}}`}
                </button>
              ))}
              {(["appUrl", "companyName", "contactEmail"] as const).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertTag(tag)}
                  title={t("emailTemplates.globalVar")}
                  className="rounded-md border border-dashed border-border bg-surface-1 px-2 py-1 font-mono text-xs text-muted-foreground hover:border-brand/50 hover:text-brand"
                >
                  {`{{${tag}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Unknown-tag warning */}
          {unknownTags.length > 0 && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {t("emailTemplates.unknownTagWarning", { tags: unknownTags.join(", ") })}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || unknownTags.length > 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? t("common.loading") : t("emailTemplates.saveTemplate")}
            </button>
            {saved && (
              <span className="text-sm text-green-600 dark:text-green-400">
                {t("emailTemplates.saved")}
              </span>
            )}
            {saveError && <span className="text-sm text-red-500">{saveError}</span>}
          </div>
        </CardContent>
      </Card>

      <TestSend kind={template.kind} defaultEmail={adminEmail} />
    </div>
  );
}

// ── Preview pane (iframe srcDoc — NEVER dangerouslySetInnerHTML) ─────────────────

function PreviewPane({ subject, html }: { subject: string; html: string }) {
  const { t } = useTranslation();
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">{t("emailTemplates.previewTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("emailTemplates.previewSubject")}
          </span>
          <p className="break-words text-sm font-medium text-foreground">{subject}</p>
        </div>
        <iframe
          srcDoc={html}
          title={t("emailTemplates.previewTitle")}
          className="h-[600px] w-full rounded-lg border border-border bg-white"
          sandbox=""
        />
      </CardContent>
    </Card>
  );
}

// ── Test send ────────────────────────────────────────────────────────────────────

function TestSend({ kind, defaultEmail }: { kind: string; defaultEmail: string }) {
  const { t } = useTranslation();
  const [to, setTo] = useState(defaultEmail);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reasonMessage(reason?: string): string {
    if (reason === "no_api_key" || reason === "email_not_configured") {
      return t("emailTemplates.testNotConfigured");
    }
    if (reason === "invalid_email") return t("emailTemplates.testInvalidEmail");
    return t("emailTemplates.testFailed");
  }

  function handleSend() {
    setStatus("idle");
    setMessage(null);
    startTransition(async () => {
      const res = await sendTestTemplateEmail(kind, to);
      if (res.ok) {
        setStatus("ok");
        setMessage(t("emailTemplates.testSent", { email: to }));
      } else {
        setStatus("error");
        setMessage(reasonMessage(res.reason));
      }
    });
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">{t("emailTemplates.testTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("emailTemplates.testHelp")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t("emailTemplates.testPlaceholder")}
            className={inputCls}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || !to.trim()}
            className="min-h-[44px] shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? t("emailTemplates.testSending") : t("emailTemplates.testSend")}
          </button>
        </div>
        {message && (
          <p
            className={[
              "text-sm",
              status === "ok"
                ? "text-green-600 dark:text-green-400"
                : "text-red-500",
            ].join(" ")}
          >
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Global settings / footer editor ──────────────────────────────────────────────

function SettingsEditor({
  settings,
  onPatch,
}: {
  settings: EmailSettingsRow;
  onPatch: (patch: Partial<EmailSettingsRow>) => void;
}) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    setSaveError(null);
    startTransition(async () => {
      const res = await updateEmailSettings({
        from_address: settings.from_address,
        app_url: settings.app_url,
        company_name: settings.company_name,
        cnpj: settings.cnpj,
        contact_email: settings.contact_email,
        address: settings.address,
        footer_note: settings.footer_note,
      });
      if ("error" in res) {
        setSaveError(t("emailTemplates.saveError"));
        return;
      }
      setSaved(true);
    });
  }

  const fields: Array<{
    key: keyof EmailSettingsRow;
    label: string;
    help?: string;
    placeholder?: string;
  }> = [
    {
      key: "from_address",
      label: t("emailTemplates.settingsFrom"),
      help: t("emailTemplates.settingsFromHelp"),
    },
    { key: "app_url", label: t("emailTemplates.settingsAppUrl") },
    { key: "company_name", label: t("emailTemplates.settingsCompany") },
    {
      key: "cnpj",
      label: t("emailTemplates.settingsCnpj"),
      help: t("emailTemplates.settingsCnpjHelp"),
    },
    { key: "contact_email", label: t("emailTemplates.settingsContact") },
    {
      key: "address",
      label: t("emailTemplates.settingsAddress"),
      help: t("emailTemplates.settingsAddressHelp"),
    },
    {
      key: "footer_note",
      label: t("emailTemplates.settingsFooterNote"),
      help: t("emailTemplates.settingsFooterNoteHelp"),
    },
  ];

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">{t("emailTemplates.settingsTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("emailTemplates.settingsSubtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className="block space-y-1">
              <span className={labelCls}>{f.label}</span>
              <input
                value={settings[f.key]}
                onChange={(e) => onPatch({ [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className={inputCls}
              />
              {f.help && <span className="block text-xs text-muted-foreground">{f.help}</span>}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? t("common.loading") : t("emailTemplates.saveSettings")}
          </button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              {t("emailTemplates.saved")}
            </span>
          )}
          {saveError && <span className="text-sm text-red-500">{saveError}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
