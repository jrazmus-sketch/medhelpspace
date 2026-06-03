import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { getViewHubGroups } from "@/components/content/view-hub-renderer";
import { EstudoTabs } from "@/components/content/estudo-tabs";
import { getStudyTypeOverrides } from "@/lib/queries/study-types";

export default async function EstudoPorQuestoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireActiveMembership();
  const { tab } = await searchParams;
  const defaultTab = tab === "simulados" ? "simulados" : "quiz";

  // Fetch both data sets in parallel so tab switches are instant.
  const [quizGroups, simuladosGroups, overridesMap] = await Promise.all([
    getViewHubGroups("quiz", null),
    getViewHubGroups("simulados", null),
    getStudyTypeOverrides(),
  ]);

  const quiz = overridesMap.get("quiz")!;
  const simulados = overridesMap.get("simulados")!;

  // "Questões Revalida" tab gets an extra "Outros" section, empty for now —
  // content TBD. Deliberately NOT added to the simulados tab.
  quizGroups.push({ label: "Outros", iconSlug: "outros", items: [] });

  // Simulados tab is being reorganized into two simulated-test categories:
  //  - "Geral": a mixed simulado covering many specialties at once.
  //  - "Por Temas": a simulado focused on a single specialty (e.g. cardiologia).
  // Both empty placeholders for now — content TBD. The existing per-specialty
  // simulado pages are kept (their total feeds the card count below) and will be
  // re-homed into these sections later.
  const simuladosCount = simuladosGroups.reduce((sum, g) => sum + g.items.length, 0);
  const simuladosSections = [
    { label: "Geral", iconSlug: "geral", items: [] },
    { label: "Por Temas", iconSlug: "por-temas", items: [] },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" />

      <EstudoTabs
        quizGroups={quizGroups}
        simuladosGroups={simuladosSections}
        countOverrides={{ simulados: simuladosCount }}
        defaultTab={defaultTab}
        overrides={{
          quiz: { id: quiz.id, label: quiz.label, description: quiz.description },
          simulados: { id: simulados.id, label: simulados.label, description: simulados.description },
        }}
      />
    </div>
  );
}
