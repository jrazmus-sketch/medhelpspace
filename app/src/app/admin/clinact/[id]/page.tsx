import { notFound } from "next/navigation";
import { requireContentAdminPage } from "@/lib/clinact/admin-gate";
import { getCaseDoc, getTaxonomy } from "@/lib/clinact/queries";
import { CaseEditor } from "@/components/clinact/case-editor";

export const dynamic = "force-dynamic";

export default async function EditCasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireContentAdminPage();
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isFinite(caseId)) notFound();
  const [doc, taxonomy] = await Promise.all([getCaseDoc(caseId), getTaxonomy()]);
  if (!doc) notFound();
  return <CaseEditor key={`${doc.id}-${doc.revision}`} initial={doc} taxonomy={taxonomy} isNew={false} />;
}
