import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getClinactViewer } from "@/lib/clinact/access";
import { getCaseBySlugAlias, getCaseDocBySlug } from "@/lib/clinact/queries";
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
  // A case that was renamed still answers to its old addresses: send the reader
  // to the current one instead of 404ing (Karina, 2026-09-02). Only reached when
  // no case holds this slug now, so it can never shadow a live case.
  if (!doc) {
    const moved = await getCaseBySlugAlias(slug);
    if (moved && moved.slug !== slug) permanentRedirect(`/clinact/caso/${moved.slug}`);
  }
  // Drafts are never reachable here — not even by admins (they have /preview).
  if (!doc || doc.status !== "published") notFound();
  const viewer = await getClinactViewer();
  // Free sample cases (one per format) open for any signed-in user; the rest
  // require the subscription.
  if (!viewer.hasAccess && !doc.is_free) redirect("/clinact");
  const payload = await loadPlayer(doc, viewer.userId, false);
  return <CasePlayer key={payload.attemptId} payload={payload} subscribeCta={!viewer.hasAccess} />;
}
