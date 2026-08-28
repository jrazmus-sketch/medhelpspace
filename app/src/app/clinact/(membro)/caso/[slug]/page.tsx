import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCaseDocBySlug } from "@/lib/clinact/queries";
import { loadPlayer } from "@/lib/clinact/player-load";
import { CasePlayer } from "@/components/clinact/case-player";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await getCaseDocBySlug(slug);
  return { title: doc?.title ?? "Caso" };
}

export default async function CasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await getCaseDocBySlug(slug);
  // Drafts are never reachable here — not even by admins (they have /preview).
  if (!doc || doc.status !== "published") notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound(); // layout already redirected; belt and braces
  const payload = await loadPlayer(doc, user.id, false);
  return <CasePlayer key={payload.attemptId} payload={payload} />;
}
