import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailClicks, type EmailClickPersonType } from "@/lib/admin/email-clicks";
import { EmailClicksClient } from "./email-clicks-client";

export const metadata = { title: "Cliques de e-mail" };

// Email engagement spans leads (PII) + members, so gate to the same roles as the
// sibling commercial pages. The nav hides the entry for other roles; this server-side
// check is the real fence (defense-in-depth — a direct URL hit still can't read).
const ROLES = ["super_admin", "billing_admin"];
const PAGE_SIZE = 50;

export default async function EmailClicksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!ROLES.includes((profile?.role as string) ?? "member")) redirect("/admin");

  const sp = await searchParams;
  const type: EmailClickPersonType | "all" =
    sp.type === "member" || sp.type === "lead" || sp.type === "unknown" ? sp.type : "all";
  const search = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const data = await getEmailClicks({ page, pageSize: PAGE_SIZE, type, search });

  return <EmailClicksClient data={data} type={type} search={search} />;
}
