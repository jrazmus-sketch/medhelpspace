import { createAdminClient } from "@/lib/supabase/admin";
import { RevalidaUpLinksClient, type LinkIssue } from "./revalida-up-links-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revalida Up × Meu Plano" };

// Live check of the Meu Plano ↔ Revalida Up links (Karina 2026-11-15): the view is recomputed on every visit, so
// it reflects imports, renames and specialty moves as soon as they happen. It only warns — never links anything.
export default async function RevalidaUpLinksPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("revalida_up_link_check")
    .select("issue, page_id, slug, title, specialty, topic_id, topic_name")
    .order("specialty")
    .order("title");
  const rows: LinkIssue[] = (data ?? []).map((r) => ({
    issue: r.issue as LinkIssue["issue"],
    pageId: r.page_id as number,
    title: r.title as string,
    specialty: (r.specialty as string | null) ?? null,
    topicName: (r.topic_name as string | null) ?? null,
  }));
  return <RevalidaUpLinksClient rows={rows} unavailable={!!error} />;
}
