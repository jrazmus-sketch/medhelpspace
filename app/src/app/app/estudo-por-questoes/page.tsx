import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { getViewHubGroups } from "@/components/content/view-hub-renderer";
import { EstudoTabs } from "@/components/content/estudo-tabs";

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "var(--muted-2, #727272)", fontWeight: 600,
};

export default async function EstudoPorQuestoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireActiveMembership();
  const { tab } = await searchParams;
  const defaultTab = tab === "simulados" ? "simulados" : "quiz";

  // Fetch both data sets in parallel so tab switches are instant.
  const [quizGroups, simuladosGroups] = await Promise.all([
    getViewHubGroups("quiz", null),
    getViewHubGroups("simulados", null),
  ]);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" />

      <header style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: "clamp(24px, 5vw, 36px)", fontWeight: 700,
          letterSpacing: "-.035em", lineHeight: 1.1, margin: 0,
        }}>
          Estudo por Questões
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Escolha como quer praticar.
        </p>
      </header>

      <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Tipo de prática</div>
      <EstudoTabs
        quizGroups={quizGroups}
        simuladosGroups={simuladosGroups}
        defaultTab={defaultTab}
      />
    </div>
  );
}
