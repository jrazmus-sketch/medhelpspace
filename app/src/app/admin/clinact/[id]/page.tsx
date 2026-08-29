import { notFound } from "next/navigation";
import { requireContentAdminPage } from "@/lib/clinact/admin-gate";
import { getCaseDoc, getTaxonomy } from "@/lib/clinact/queries";
import { CaseEditor } from "@/components/clinact/case-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = Number.isFinite(Number(id)) ? await getCaseDoc(Number(id)) : null;
  return { title: doc ? `${doc.title} · ClinAct` : "ClinAct" };
}

export default async function EditCasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireContentAdminPage();
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isFinite(caseId)) notFound();
  const [doc, taxonomy] = await Promise.all([getCaseDoc(caseId), getTaxonomy()]);
  if (!doc) notFound();
  return <CaseEditor key={`${doc.id}-${doc.revision}`} initial={doc} taxonomy={taxonomy} isNew={false} />;
}
