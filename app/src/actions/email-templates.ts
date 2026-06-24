"use server";

// Server actions for the admin "Email Templates" page.
//
// INVARIANT (project-wide): a "use server" module exports ONLY async functions.
// Re-exporting a type/const from here compiles to a runtime value re-export and
// crashes the whole /app tree — so all shared types are *type-only* imports from
// @/lib/email-render, never re-exported.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { extractTags, isKnownTag } from "@/lib/email-render";
import type { EmailTemplateRow, EmailVariable } from "@/lib/email-render";
import { sendTestEmail } from "@/lib/email";

const CONTENT_ROLES = ["super_admin", "content_admin"];

// Stricter than the layout: email templates are content work, so support/billing
// admins are excluded (mirrors the page-level gate).
async function requireContentAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !CONTENT_ROLES.includes(profile.role as string)) {
    throw new Error("Unauthorized");
  }
  return { user };
}

// Same shape as actions/admin.ts writeAuditLog — replicated here because that one
// is module-private. Inserts into admin_audit_log via the service-role client.
async function writeAuditLog(
  actorId: string,
  action: string,
  details?: Record<string, unknown>,
) {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_user_id: actorId,
    action,
    target_user_id: null,
    details: details ?? {},
  });
}

// Fields an admin can edit on a template. `variables` is fixed at seed time
// (it documents the per-recipient tags the cron supplies) so it is NOT editable
// here — but it's needed to validate tags, so callers send it back unchanged.
type TemplateInput = {
  kind: string;
  subject: string;
  kicker: string;
  headline: string;
  body_html: string;
  cta_label: string;
  cta_href: string;
  active: boolean;
  variables: EmailVariable[];
};

// Build an EmailTemplateRow-shaped object good enough for extractTags / isKnownTag.
function asTemplateRow(input: TemplateInput): EmailTemplateRow {
  return {
    kind: input.kind,
    name: "",
    description: "",
    subject: input.subject,
    kicker: input.kicker,
    headline: input.headline,
    body_html: input.body_html,
    cta_label: input.cta_label,
    cta_href: input.cta_href,
    variables: Array.isArray(input.variables) ? input.variables : [],
    active: input.active,
    sort_order: 0,
  };
}

export async function updateEmailTemplate(
  input: TemplateInput,
): Promise<{ ok: true } | { error: string; tag?: string }> {
  const { user } = await requireContentAdmin();

  if (!input.kind) return { error: "missing_kind" };

  // Re-validate tags server-side — never trust the client's check alone. A stray
  // {{cohort}} typo would render empty in a real send, so block it here too.
  const tmpl = asTemplateRow(input);
  for (const tag of extractTags(tmpl)) {
    if (!isKnownTag(tag, tmpl)) return { error: "unknown_tag", tag };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("email_templates")
    .update({
      subject: input.subject,
      kicker: input.kicker,
      headline: input.headline,
      body_html: input.body_html,
      cta_label: input.cta_label,
      cta_href: input.cta_href,
      active: input.active,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("kind", input.kind);

  if (error) return { error: "save_failed" };

  await writeAuditLog(user.id, "email_template_update", { kind: input.kind });
  revalidatePath("/admin/email-templates");
  return { ok: true };
}

type SettingsInput = {
  from_address: string;
  app_url: string;
  company_name: string;
  cnpj: string;
  contact_email: string;
  address: string;
  footer_note: string;
};

export async function updateEmailSettings(
  input: SettingsInput,
): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireContentAdmin();

  const admin = createAdminClient();
  const { error } = await admin
    .from("email_settings")
    .update({
      from_address: input.from_address,
      app_url: input.app_url,
      company_name: input.company_name,
      cnpj: input.cnpj,
      contact_email: input.contact_email,
      address: input.address,
      footer_note: input.footer_note,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) return { error: "save_failed" };

  await writeAuditLog(user.id, "email_settings_update", {});
  revalidatePath("/admin/email-templates");
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendTestTemplateEmail(
  kind: string,
  to: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { user } = await requireContentAdmin();

  const target = (to ?? "").trim();
  if (!kind) return { ok: false, reason: "missing_kind" };
  if (!EMAIL_RE.test(target)) return { ok: false, reason: "invalid_email" };

  // sendTestEmail lives in @/lib/email (added by the email-infra agent). It
  // renders the template+settings from the DB against sample vars and sends via
  // Resend, returning { ok, reason? } where reason ∈ no_api_key | send_failed | …
  const result = await sendTestEmail(kind, target);

  await writeAuditLog(user.id, "email_test_send", {
    kind,
    to: target,
    ok: result.ok,
    reason: result.reason ?? null,
  });

  return result;
}
