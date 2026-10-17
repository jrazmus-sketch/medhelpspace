import { notFound } from "next/navigation";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { TypeChip } from "@/components/content/type-chip";
import { SiteText } from "@/components/landing/site-text";
import { SimuladoCollectionGrid, countCollection } from "@/components/content/geral-simulados-grid";
import { collectionByKey } from "@/lib/simulado-collections";
import { resolveCollection } from "@/lib/simulado-collections-server";

const SIMULADOS_TAB = "/app/estudo-por-questoes?tab=simulados";

// One GERAL collection (Simulados Gerais / Questões Pegada INEP): its simulados as the
// same numbered card grid the GERAL section used to show flat (Karina 2026-10-17).
export default async function SimuladoCollectionPage({
  params,
}: {
  params: Promise<{ colecao: string }>;
}) {
  await requireActiveMembership();
  const { colecao } = await params;
  const c = collectionByKey(colecao);
  if (!c) notFound();

  const [copy, count] = await Promise.all([resolveCollection(c), countCollection(c.key)]);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref={SIMULADOS_TAB} />
      </div>
      <Breadcrumbs
        className="mb-6"
        crumbs={[
          { label: "Início", href: "/app" },
          { label: "Simulados", href: SIMULADOS_TAB },
          { label: copy.title },
        ]}
      />

      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1
            style={{
              fontSize: "clamp(20px, 5vw, 26px)",
              fontWeight: 600,
              letterSpacing: "-.025em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            <SiteText k={`${c.copyKey}.title`} fallback={c.title} />
          </h1>
          <TypeChip typeKey="simulados" size="md" />
        </div>
        <p
          className="mt-3 text-sm leading-relaxed sm:text-[15px]"
          style={{ color: "color-mix(in srgb, var(--foreground) 75%, transparent)", maxWidth: 640 }}
        >
          <SiteText k={`${c.copyKey}.desc`} fallback={c.description} />
        </p>
        <div
          className="mt-3"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".04em",
            color: "var(--muted-foreground)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {count} {count === 1 ? "simulado" : "simulados"}
        </div>
      </header>

      <SimuladoCollectionGrid collectionKey={c.key} />
    </div>
  );
}
