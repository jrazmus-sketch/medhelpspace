import Link from "next/link";
import { Eye } from "lucide-react";
import { hasProductAccess } from "@/lib/clinact/access";
import { isViewerAdmin } from "@/lib/membership-gate";
import { getPageLayout, orderSections } from "@/lib/queries/site-sections";
import { CLINACT_SECTIONS } from "@/components/clinact/sales/sections";

export const metadata = {
  title: "ClinAct — raciocínio clínico que termina em uma decisão | MedHelpSpace",
  description: "Casos clínicos curtos em quatro formatos: Decisão em 30 Segundos, Código Clínico, Ponto de Virada e Clínica em Cena.",
};
export const dynamic = "force-dynamic";

/**
 * ClinAct sales page. Public and dark-only, like /loja — deliberately outside
 * the theme-unlocked zone.
 *
 * HER DECISION 6 (2026-09-01), which overrode my advice to publish early: the
 * page does not go public until signup + the four free cases + subscription
 * work end to end. So until `site_pages.published` is flipped, the public keeps
 * getting the placeholder and only admins see the real page — same draft /
 * published shape the cases already use, with no separate preview URL that
 * could leak.
 */
export default async function ClinactSalesPage() {
  const [has, isAdmin, layout] = await Promise.all([
    hasProductAccess("clinact"),
    isViewerAdmin(),
    getPageLayout("clinact"),
  ]);

  if (!layout.published && !isAdmin) return <Placeholder hasAccess={has} />;

  const sections = orderSections(CLINACT_SECTIONS, layout);

  return (
    <div className="min-h-screen bg-background">
      {!layout.published ? (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-center text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
            <Eye className="h-4 w-4" /> Página não publicada
          </span>{" "}
          <span className="text-muted-foreground">
            — só administradores estão vendo isto. O público continua vendo &ldquo;Em breve&rdquo;.
          </span>
        </div>
      ) : null}

      {sections.map(({ key, Section }) => (
        <Section key={key} hasAccess={has} />
      ))}
    </div>
  );
}

/** What the public sees until the flow is complete. */
function Placeholder({ hasAccess }: { hasAccess: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">MedHelpSpace</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">ClinAct</h1>
      <p className="mt-3 max-w-md text-lg text-muted-foreground">Raciocínio clínico que termina em uma decisão.</p>
      {hasAccess ? (
        <Link href="/clinact/treinar" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-brand px-8 text-base font-semibold text-brand-fg">
          Entrar nos casos
        </Link>
      ) : (
        <p className="mt-8 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">Em breve.</p>
      )}
      <Link href="/" className="mt-10 text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← medhelpspace.com.br
      </Link>
    </div>
  );
}
