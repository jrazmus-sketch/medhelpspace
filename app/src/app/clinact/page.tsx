import Link from "next/link";
import { hasProductAccess } from "@/lib/clinact/access";

export const metadata = {
  title: "ClinAct — raciocínio clínico que termina em uma decisão | MedHelpSpace",
  description: "Casos clínicos curtos em quatro formatos: Decisão em 30 Segundos, Código Clínico, Ponto de Virada e Clínica em Cena.",
};
export const dynamic = "force-dynamic";

// Sales page placeholder. The real page (demos, screenshots, pricing) is build
// step 3 together with the subscription module. Public and dark-only, like
// /loja — this path is deliberately NOT in the theme-unlocked zone.
export default async function ClinactSalesPage() {
  const has = await hasProductAccess("clinact");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">MedHelpSpace</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">ClinAct</h1>
      <p className="mt-3 max-w-md text-lg text-muted-foreground">Raciocínio clínico que termina em uma decisão.</p>
      {has ? (
        <Link href="/clinact/treinar" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-brand px-8 text-base font-semibold text-brand-fg">Entrar nos casos</Link>
      ) : (
        <p className="mt-8 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">Em breve.</p>
      )}
      <Link href="/" className="mt-10 text-sm text-muted-foreground underline-offset-4 hover:underline">← medhelpspace.com.br</Link>
    </div>
  );
}
