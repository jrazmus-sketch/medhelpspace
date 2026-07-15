import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  renderEmail,
  withSenderName,
  FUNNEL_SENDER_NAME,
  EMAIL_TEMPLATE_DEFAULTS,
  DEFAULT_EMAIL_SETTINGS,
  sampleVarsFor,
  buildBroadcastTemplate,
  broadcastGreeting,
  BROADCAST_KIND,
  type EmailTemplateRow,
  type EmailSettingsRow,
  type EmailVariable,
  type BroadcastSpec,
  type BroadcastRecipient,
} from "@/lib/email-render";
import { unsubscribeUrl as buildUnsubscribeUrl } from "@/lib/magnet/links";

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
  listUnsubscribeUrl,
}: {
  to: string;
  subject: string;
  html: string;
  from: string;
  // When set, emits one-click List-Unsubscribe headers (RFC 8058). Pass ONLY for
  // list/marketing mail (the funnel drip) — transactional + member mail omits it.
  listUnsubscribeUrl?: string;
  // `id` = the Resend message id (present on success) — the join key for
  // lead_email_events, so a later delivered/opened/clicked webhook threads to this send.
}): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, reason: "no_api_key" };
  try {
    // One-click unsubscribe is the single biggest anti-spam signal for Gmail/Yahoo
    // bulk mail: it surfaces a native "Unsubscribe" affordance in the client so
    // recipients opt out instead of hitting "spam" (which tanks domain reputation).
    // Only attach when we have a real unsubscribe URL (the funnel emails carry one).
    const headers =
      listUnsubscribeUrl && /^https?:\/\//.test(listUnsubscribeUrl)
        ? {
            "List-Unsubscribe": `<${listUnsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined;
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(headers ? { headers } : {}),
    });
    // The Resend SDK reports API errors (e.g. an unverified sending domain) on the
    // returned `error` field rather than throwing — so a silently-rejected send
    // looks like success unless we inspect it. Callers that need to know (the admin
    // resend tool) rely on this; the fire-and-forget finalize path ignores it.
    if (error) return { ok: false, reason: error.message ?? "send_error" };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "send_throw" };
  }
}

// Record the 'sent' anchor for ANY email so the /admin/email-clicks feed + /admin/leads
// drawer can name a tracked click to its email (via `kind`), and the Resend webhook can
// thread delivered/opened/clicked events onto it (via `resend_id`). Logged for every
// kind — lead funnel, member transactional, and admin mail alike — since we now track
// engagement for everyone. Best-effort: a logging failure must never fail the send.
// AWAITED (serverless kills fire-and-forget after the handler).
async function logEmailSent(resendId: string, to: string, kind: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("lead_email_events").insert({
      resend_id: resendId,
      email: to.toLowerCase().trim(),
      kind,
      event_type: "sent",
    });
  } catch (e) {
    console.error("logEmailSent failed:", e instanceof Error ? e.message : e);
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
  // Funnel/list emails carry an {{unsubscribeUrl}} var → attach the one-click
  // List-Unsubscribe header. Transactional/member templates have no such var → no header.
  const res = await sendEmailRaw({ to, subject, html, from, listUnsubscribeUrl: vars.unsubscribeUrl });
  // Log the 'sent' anchor for every kind so any later tracked click can be named to
  // its email in the engagement feed/drawer. Best-effort — never blocks the send.
  if (res.ok && res.id) {
    await logEmailSent(res.id, to, kind);
  }
  return res;
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
      // Anchor the send so a later click by any admin recipient is nameable in the feed.
      if (r.ok && r.id) await logEmailSent(r.id, to, kind);
      return { to, ok: r.ok, reason: r.reason };
    }),
  );
}

// ── Custom broadcast (admin /admin/leads "Enviar e-mail") ────────────────────────

// Render an admin-composed email ONCE (settings fetched + branded template built a
// single time) and send it per-recipient with a personalized greeting and a working
// one-click List-Unsubscribe. Bounded concurrency keeps us under Resend's rate limit
// AND the serverless wall-clock budget; every send is AWAITED (fire-and-forget is
// killed when the handler returns). Returns one result per recipient — `id` is echoed
// back so the caller can stamp last_emailed_at on exactly the successes.
export async function sendCustomBroadcast(
  recipients: BroadcastRecipient[],
  spec: BroadcastSpec,
  opts?: { kind?: string; log?: boolean; concurrency?: number },
): Promise<{ id: string; email: string; ok: boolean; reason?: string }[]> {
  if (recipients.length === 0) return [];
  const kind = opts?.kind ?? BROADCAST_KIND;
  const doLog = opts?.log ?? true;
  const concurrency = Math.max(1, opts?.concurrency ?? 2);

  const settings = await getEmailSettings();
  const template = buildBroadcastTemplate(spec);
  const from = withSenderName(settings.from_address, FUNNEL_SENDER_NAME);
  const withGreeting = spec.withGreeting !== false;

  const results: { id: string; email: string; ok: boolean; reason?: string }[] = new Array(
    recipients.length,
  );

  // Simple worker-pool: `cursor` hands each worker the next index. `concurrency`
  // in-flight sends at a time — no external throttle lib in the codebase.
  let cursor = 0;
  async function worker() {
    while (cursor < recipients.length) {
      const i = cursor++;
      const r = recipients[i];
      const unsub = buildUnsubscribeUrl(r.unsubscribeToken ?? "");
      const vars: Record<string, string> = {
        greeting: withGreeting ? broadcastGreeting(r.firstName) : "",
        unsubscribeUrl: unsub,
      };
      const { subject, html } = renderEmail(template, settings, vars);
      const res = await sendEmailRaw({ to: r.email, subject, html, from, listUnsubscribeUrl: unsub });
      if (res.ok && res.id && doLog) {
        await logEmailSent(res.id, r.email, kind);
      }
      results[i] = { id: r.id, email: r.email, ok: res.ok, reason: res.reason };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, recipients.length) }, () => worker()),
  );
  return results;
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
  const vars = sampleVarsFor(tpl);
  const { subject, html } = renderEmail(tpl, settings, vars);
  // Funnel emails (lead-*) go out as "Equipe MedHelpSpace" in production (the
  // funnel callers pass fromName), so the test send must match — otherwise the
  // admin previews a different From name than real leads actually receive.
  const from = kind.startsWith("lead-")
    ? withSenderName(settings.from_address, FUNNEL_SENDER_NAME)
    : settings.from_address;
  return sendEmailRaw({
    to,
    subject,
    html,
    from,
    listUnsubscribeUrl: vars.unsubscribeUrl,
  });
}
