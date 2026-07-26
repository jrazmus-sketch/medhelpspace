import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_EMAIL_SETTINGS,
  renderEmail,
  sampleVarsFor,
  type EmailTemplateRow,
  type EmailSettingsRow,
  type EmailVariable,
} from "@/lib/email-render";
import { EmailReviewClient, type ReviewItem } from "./email-review-client";

// Server half of the e-mail review surface: gate, fetch, and render each template
// with sample vars. renderEmail is pure, so the HTML is produced here and the
// client only lays it out — no template internals reach the browser as data.

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisão de e-mails" };

const CONTENT_ROLES = ["super_admin", "content_admin"];

// Ordered: first match wins, so specific prefixes must precede the lead-* catch-all.
// Slugs double as i18n keys (emailReview.group.<slug>).
const GROUPS: { slug: string; match: (kind: string) => boolean }[] = [
  { slug: "simulado", match: (k) => k.startsWith("lead-sim") },
  { slug: "flashcards", match: (k) => k.startsWith("lead-fc") },
  { slug: "leads", match: (k) => k.startsWith("lead-") },
  { slug: "admin", match: (k) => k.startsWith("admin-") },
  { slug: "membros", match: () => true },
];

function groupFor(kind: string): string {
  return (GROUPS.find((g) => g.match(kind)) ?? GROUPS[GROUPS.length - 1]).slug;
}

export default async function EmailReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Same stricter gate as the editor: reviewing copy is content work.
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
  if (!profile || !CONTENT_ROLES.includes(profile.role as string)) redirect("/admin");

  const sp = await searchParams;
  const rawGroup = Array.isArray(sp.grupo) ? sp.grupo[0] : sp.grupo;
  const selected = GROUPS.some((g) => g.slug === rawGroup) ? (rawGroup as string) : "simulado";

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
      .select("from_address, app_url, company_name, cnpj, contact_email, address, footer_note")
      .eq("id", 1)
      .maybeSingle(),
  ]);

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

  const all: EmailTemplateRow[] = (templateRows ?? []).map((r) => ({
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

  const counts = new Map<string, number>();
  for (const t of all) {
    const slug = groupFor(t.kind);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const items: ReviewItem[] = all
    .filter((t) => groupFor(t.kind) === selected)
    .map((t) => {
      const preview = renderEmail(t, settings, sampleVarsFor(t));
      return {
        kind: t.kind,
        name: t.name,
        description: t.description,
        subject: preview.subject,
        html: preview.html,
        active: t.active,
      };
    });

  return (
    <EmailReviewClient
      groups={GROUPS.filter((g) => (counts.get(g.slug) ?? 0) > 0).map((g) => ({
        slug: g.slug,
        count: counts.get(g.slug) ?? 0,
      }))}
      selected={selected}
      items={items}
    />
  );
}
