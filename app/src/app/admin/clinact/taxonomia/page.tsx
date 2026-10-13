import { requireContentAdminPage } from "@/lib/clinact/admin-gate";
import { getTaxonomyForAdmin } from "@/lib/clinact/queries";
import { TaxonomyClient } from "./taxonomy-client";

export const metadata = { title: "ClinAct — taxonomia" };
export const dynamic = "force-dynamic";

/**
 * ClinAct's own specialties and topics (Karina 2026-10-13). Independent of the
 * Revalida taxonomy: nothing here reads or writes `specialties` / `topics`.
 */
export default async function ClinactTaxonomyAdmin() {
  await requireContentAdminPage();
  const { specialties, topics } = await getTaxonomyForAdmin();
  return <TaxonomyClient specialties={specialties} topics={topics} />;
}
