import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyPreviewToken } from "@/lib/clinact/preview-token";
import { getCaseDoc } from "@/lib/clinact/queries";
import { loadPlayer } from "@/lib/clinact/player-load";
import { CasePlayer } from "@/components/clinact/case-player";

export const metadata = { title: "Pré-visualização" };

// Signed preview (§3): the real player against a draft; the attempt is flagged
// is_preview and never counts. Only the admin who minted the link can use it.
export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claims = verifyPreviewToken(token);
  if (!claims) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (user.id !== claims.userId || !["super_admin", "content_admin"].includes(profile?.role ?? "")) notFound();
  const doc = await getCaseDoc(claims.caseId);
  if (!doc) notFound();
  const payload = await loadPlayer(doc, user.id, true);
  return <CasePlayer key={payload.attemptId} payload={payload} />;
}
