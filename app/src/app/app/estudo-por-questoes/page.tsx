import { requireActiveMembership } from "@/lib/membership-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { getViewHubGroups } from "@/components/content/view-hub-renderer";
import { GeralSimuladosGrid } from "@/components/content/geral-simulados-grid";
import { EstudoTabs, type SimuladoSectionMeta } from "@/components/content/estudo-tabs";
import { getStudyTypeOverrides } from "@/lib/queries/study-types";
import { getSimuladoSectionOverrides } from "@/lib/queries/simulado-sections";

export default async function EstudoPorQuestoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireActiveMembership();
  const { tab } = await searchParams;
  const defaultTab = tab === "simulados" ? "simulados" : "quiz";

  // Fetch everything in parallel so tab switches are instant.
  //  - quiz tab: the Questões accordion (per-specialty hubs).
  //  - simulados tab: "Por área" reuses the same accordion machinery over
  //    view='simulados' hubs (Clínica Médica bundles its 12 subspecialties);
  //    "Geral" is a flat grid of cross-specialty mock exams rendered separately.
  const [quizGroups, simuladoPorAreaGroups, overridesMap, simSections, simuladoCount] =
    await Promise.all([
      getViewHubGroups("quiz", null),
      getViewHubGroups("simulados", null),
      getStudyTypeOverrides(),
      getSimuladoSectionOverrides(),
      countSimulados(),
    ]);

  const quiz = overridesMap.get("quiz")!;
  const simulados = overridesMap.get("simulados")!;

  // Section headings for the Simulados tab, DB-backed (simulado_sections) so
  // admins can rename them inline. id > 0 → a real row exists → editable.
  const geralRow = simSections.find((s) => s.key === "geral");
  const porAreaRow = simSections.find((s) => s.key === "por-temas");
  const toMeta = (
    row: { id: number; label: string; iconSlug: string } | undefined,
    fallbackLabel: string,
    fallbackIcon: string,
  ): SimuladoSectionMeta => ({
    label: row?.label ?? fallbackLabel,
    iconSlug: row?.iconSlug ?? fallbackIcon,
    editable:
      row && row.id > 0
        ? { table: "simulado_sections" as const, id: row.id, field: "label" as const }
        : undefined,
  });

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" />

      <EstudoTabs
        quizGroups={quizGroups}
        simuladoGeralSlot={<GeralSimuladosGrid />}
        simuladoPorAreaGroups={simuladoPorAreaGroups}
        simuladoSections={{
          geral: toMeta(geralRow, "Geral", "geral"),
          porArea: toMeta(porAreaRow, "Por área", "por-temas"),
        }}
        countOverrides={{ simulados: simuladoCount }}
        defaultTab={defaultTab}
        overrides={{
          quiz: { id: quiz.id, label: quiz.label, description: quiz.description },
          simulados: { id: simulados.id, label: simulados.label, description: simulados.description },
        }}
      />
    </div>
  );
}

// Total published simulados (Geral + Por área) — feeds the "N simulados" count on
// the selector card.
async function countSimulados(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("pages")
    .select("id", { count: "exact", head: true })
    .eq("view", "simulados")
    .eq("type", "h5p-quiz")
    .eq("status", "publish");
  return count ?? 0;
}
