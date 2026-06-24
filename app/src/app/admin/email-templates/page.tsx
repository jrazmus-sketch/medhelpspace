import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_EMAIL_SETTINGS,
  type EmailTemplateRow,
  type EmailSettingsRow,
  type EmailVariable,
} from "@/lib/email-render";
import { EmailTemplatesClient } from "./email-templates-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-mails" };

const CONTENT_ROLES = ["super_admin", "content_admin"];

export default async function EmailTemplatesPage() {
  // Stricter gate than the admin layout: email templates are content work, so
  // support/billing admins are sent back to the dashboard.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !CONTENT_ROLES.includes(profile.role as string)) {
    redirect("/admin");
  }

  const admin = createAdminClient();
  const [{ data: templateRows }, { data: settingsRow }] = await Promise.all([
    admin
      .from("email_templates")
      .select(
        "kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order",
      )
      .order("sort_order"),
    admin
      .from("email_settings")
      .select(
        "from_address, app_url, company_name, cnpj, contact_email, address, footer_note",
      )
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const templates: EmailTemplateRow[] = (templateRows ?? []).map((r) => ({
    kind: r.kind as string,
    name: (r.name ?? "") as string,
    description: (r.description ?? "") as string,
    subject: (r.subject ?? "") as string,
    kicker: (r.kicker ?? "") as string,
    headline: (r.headline ?? "") as string,
    body_html: (r.body_html ?? "") as string,
    cta_label: (r.cta_label ?? "") as string,
    cta_href: (r.cta_href ?? "") as string,
    variables: (Array.isArray(r.variables) ? r.variables : []) as EmailVariable[],
    active: (r.active ?? true) as boolean,
    sort_order: (r.sort_order ?? 0) as number,
  }));

  const settings: EmailSettingsRow = settingsRow
    ? {
        from_address: (settingsRow.from_address ?? "") as string,
        app_url: (settingsRow.app_url ?? "") as string,
        company_name: (settingsRow.company_name ?? "") as string,
        cnpj: (settingsRow.cnpj ?? "") as string,
        contact_email: (settingsRow.contact_email ?? "") as string,
        address: (settingsRow.address ?? "") as string,
        footer_note: (settingsRow.footer_note ?? "") as string,
      }
    : DEFAULT_EMAIL_SETTINGS;

  return (
    <EmailTemplatesClient
      templates={templates}
      settings={settings}
      adminEmail={user.email ?? ""}
    />
  );
}
