import { requireContentAdminPage } from "@/lib/clinact/admin-gate";
import { getTaxonomy } from "@/lib/clinact/queries";
import { seedSteps } from "@/lib/clinact/format-presets";
import { CaseEditor } from "@/components/clinact/case-editor";
import type { CaseDoc } from "@/lib/clinact/types";

export const metadata = { title: "Novo caso · ClinAct" };
export const dynamic = "force-dynamic";

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ formato?: string }> }) {
  await requireContentAdminPage();
  const { formato } = await searchParams;
  const format = (["codigo_clinico", "clinica_em_cena", "decisao_30s", "ponto_de_virada"].includes(formato ?? "") ? formato : "decisao_30s") as CaseDoc["format"];
  const taxonomy = await getTaxonomy();
  const initial: CaseDoc = {
    slug: "",
    format,
    title: "",
    difficulty: "intermediaria",
    primary_skill: "priorizar",
    est_minutes: 2,
    status: "draft",
    revision: 0,
    steps: seedSteps(format),
    clues: [],
  };
  return <CaseEditor initial={initial} taxonomy={taxonomy} isNew />;
}
