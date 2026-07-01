import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  renderEmail,
  withSenderName,
  EMAIL_TEMPLATE_DEFAULTS,
  DEFAULT_EMAIL_SETTINGS,
  sampleVarsFor,
  type EmailTemplateRow,
  type EmailSettingsRow,
  type EmailVariable,
} from "@/lib/email-render";

// Transactional-email SEND path. The actual content lives in the DB
// (email_templates / email_settings, admin-editable) and is rendered by the pure
// renderEmail() in lib/email-render.ts. This module only fetches those rows and
// hands them to Resend. When the tables are missing/inactive we fall back to the
// code defaults (EMAIL_TEMPLATE_DEFAULTS / DEFAULT_EMAIL_SETTINGS), so a send never
// hard-fails just because the DB seed didn't run.
//
// Both tables are read via createAdminClient() (service_role, BYPASSRLS) — they are
// not member-facing and have deny-all RLS.

// ── Resend client ──────────────────────────────────────────────────────────────

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

// ── DB fetch: settings + templates ───────────────────────────────────────────────

// Global email config (singleton row id=1). On any error / missing row we return
// the code default so the header/footer chrome still renders.
export async function getEmailSettings(): Promise<EmailSettingsRow> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("email_settings")
      .select(
        "from_address, app_url, company_name, cnpj, contact_email, address, footer_note",
      )
      .eq("id", 1)
      .single();
    if (error || !data) return DEFAULT_EMAIL_SETTINGS;
    return {
      from_address: (data.from_address as string) ?? DEFAULT_EMAIL_SETTINGS.from_address,
      app_url: (data.app_url as string) ?? DEFAULT_EMAIL_SETTINGS.app_url,
      company_name: (data.company_name as string) ?? DEFAULT_EMAIL_SETTINGS.company_name,
      cnpj: (data.cnpj as string) ?? "",
      contact_email: (data.contact_email as string) ?? "",
      address: (data.address as string) ?? "",
      footer_note: (data.footer_note as string) ?? "",
    };
  } catch {
    return DEFAULT_EMAIL_SETTINGS;
  }
}

// Template for a kind. Missing row / active=false / any error → the code default.
// `variables` jsonb may arrive already-parsed (postgres-js / PostgREST decode it);
// guard with Array.isArray so a malformed column can't crash render.
export async function getEmailTemplate(kind: string): Promise<EmailTemplateRow> {
  const fallback = EMAIL_TEMPLATE_DEFAULTS[kind];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("email_templates")
      .select(
        "kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order",
      )
      .eq("kind", kind)
      .single();
    if (error || !data || data.active === false) return fallback;
    const variables: EmailVariable[] = Array.isArray(data.variables)
      ? (data.variables as EmailVariable[])
      : fallback?.variables ?? [];
    return {
      kind: data.kind as string,
      name: (data.name as string) ?? "",
      description: (data.description as string) ?? "",
      subject: (data.subject as string) ?? "",
      kicker: (data.kicker as string) ?? "",
      headline: (data.headline as string) ?? "",
      body_html: (data.body_html as string) ?? "",
      cta_label: (data.cta_label as string) ?? "",
      cta_href: (data.cta_href as string) ?? "",
      variables,
      active: data.active !== false,
      sort_order: (data.sort_order as number) ?? 0,
    };
  } catch {
    return fallback;
  }
}

// ── Send ─────────────────────────────────────────────────────────────────────

// Low-level send. Returns a { ok, reason } so callers that care (admin resend
// tool) can surface the failure; the fire-and-forget finalize path ignores it.
export async function sendEmailRaw({
  to,
  subject,
  html,
  from,
}: {
  to: string;
  subject: string;
  html: string;
  from: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, reason: "no_api_key" };
  try {
    const { error } = await resend.emails.send({ from, to, subject, html });
    // The Resend SDK reports API errors (e.g. an unverified sending domain) on the
    // returned `error` field rather than throwing — so a silently-rejected send
    // looks like success unless we inspect it. Callers that need to know (the admin
    // resend tool) rely on this; the fire-and-forget finalize path ignores it.
    if (error) return { ok: false, reason: error.message ?? "send_error" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "send_throw" };
  }
}

// Fetch settings + template for `kind`, render against `vars`, and send.
// `fromName` overrides ONLY the display name on the From header (the verified
// sending address is preserved) — the funnel uses it to send as "Equipe
// MedHelpSpace" without changing the shared global from_address.
export async function sendTemplateEmail({
  kind,
  to,
  vars,
  fromName,
}: {
  kind: string;
  to: string;
  vars: Record<string, string>;
  fromName?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const settings = await getEmailSettings();
  const tpl = await getEmailTemplate(kind);
  const { subject, html } = renderEmail(tpl, settings, vars);
  const from = fromName
    ? withSenderName(settings.from_address, fromName)
    : settings.from_address;
  return sendEmailRaw({ to, subject, html, from });
}

// Render a template ONCE (settings + template fetched once) and send the same body
// to multiple recipients — used by the admin-alert fan-out, where every admin gets
// identical content. Sends are awaited (serverless: a fire-and-forget Resend call
// is killed when the handler returns). Returns one result per recipient.
export async function sendTemplateEmailToMany({
  kind,
  recipients,
  vars,
}: {
  kind: string;
  recipients: string[];
  vars: Record<string, string>;
}): Promise<{ to: string; ok: boolean; reason?: string }[]> {
  if (recipients.length === 0) return [];
  const settings = await getEmailSettings();
  const tpl = await getEmailTemplate(kind);
  const { subject, html } = renderEmail(tpl, settings, vars);
  return Promise.all(
    recipients.map(async (to) => {
      const r = await sendEmailRaw({ to, subject, html, from: settings.from_address });
      return { to, ok: r.ok, reason: r.reason };
    }),
  );
}

// ── Public, named send helpers (signatures preserved for existing callers) ───────

// Purchase confirmation. Caller (finalize.ts) is fire-and-forget; the admin resend
// tool (actions/admin.ts) inspects { ok, reason } — including reason === "no_api_key".
export async function sendPurchaseConfirmation({
  to,
  name,
  cohortName,
}: {
  to: string;
  name: string;
  cohortName: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const displayName = name || to.split("@")[0];
  return sendTemplateEmail({
    kind: "purchase",
    to,
    vars: { displayName, cohortName },
  });
}

// ── 60D unlock notification ───────────────────────────────────────────────────

export async function send60DUnlockEmail({
  to,
  name,
  testDate,
}: {
  to: string;
  name: string;
  testDate: string; // YYYY-MM-DD
}): Promise<{ ok: boolean; reason?: string }> {
  const displayName = name || to.split("@")[0];
  // Keep the pt-BR long-date formatting the old code used (noon to dodge TZ drift).
  const formattedDate = new Date(testDate + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });
  return sendTemplateEmail({
    kind: "60d-unlock",
    to,
    vars: { displayName, testDate: formattedDate },
  });
}

// ── Membership expiry warning (7 days before) ────────────────────────────────

export async function sendExpiryWarningEmail({
  to,
  name,
  cohortName,
  endsAt,
}: {
  to: string;
  name: string;
  cohortName: string;
  endsAt: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const displayName = name || to.split("@")[0];
  const formattedDate = new Date(endsAt).toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });
  return sendTemplateEmail({
    kind: "expiry-warning-7d",
    to,
    vars: { displayName, cohortName, endsAt: formattedDate },
  });
}

// ── Membership expiry notice (after expiration) ───────────────────────────────

export async function sendExpiryNoticeEmail({
  to,
  name,
  cohortName,
}: {
  to: string;
  name: string;
  cohortName: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const displayName = name || to.split("@")[0];
  return sendTemplateEmail({
    kind: "expiry-notice",
    to,
    vars: { displayName, cohortName },
  });
}

// ── Admin "send test" ──────────────────────────────────────────────────────────

// Render a template with its sample vars and send it to an arbitrary address.
// Backs the admin email editor's "send test" button.
export async function sendTestEmail(
  kind: string,
  to: string,
): Promise<{ ok: boolean; reason?: string }> {
  const settings = await getEmailSettings();
  const tpl = await getEmailTemplate(kind);
  const { subject, html } = renderEmail(tpl, settings, sampleVarsFor(tpl));
  return sendEmailRaw({ to, subject, html, from: settings.from_address });
}
