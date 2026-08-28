import { requireContentAdminPage } from "@/lib/clinact/admin-gate";
import { listCases, getTaxonomy } from "@/lib/clinact/queries";
import { ClinactListClient } from "./clinact-list-client";

export const metadata = { title: "ClinAct" };
export const dynamic = "force-dynamic";

export default async function ClinactAdminPage() {
  await requireContentAdminPage();
  const [rows, taxonomy] = await Promise.all([listCases(), getTaxonomy()]);
  const specialtyNames = new Map(taxonomy.specialties.map((s) => [s.id, s.name]));
  return (
    <ClinactListClient
      rows={rows.map((r) => ({ ...r, specialty: r.specialty_id ? (specialtyNames.get(r.specialty_id) ?? r.specialty_text) : r.specialty_text }))}
    />
  );
}
