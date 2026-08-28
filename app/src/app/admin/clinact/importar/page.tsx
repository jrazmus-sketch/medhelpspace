import { requireContentAdminPage } from "@/lib/clinact/admin-gate";
import { ImportClient } from "./import-client";

export const metadata = { title: "Importar casos · ClinAct" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireContentAdminPage();
  return <ImportClient />;
}
