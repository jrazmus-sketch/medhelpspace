import type { Metadata } from "next";
import Link from "next/link";
import { getRewardByToken } from "@/lib/magnet/result";
import { MagnetReward } from "@/components/magnet/magnet-reward";
import { getCohortProduct } from "@/lib/queries/cohort-products";

// Durable "meu material" page — the fix for the original bug where the D0 email
// button dumped leads back to Q1 with only the 5 free questions. Resolves the lead
// by result_token and rebuilds the full reward (plan + flashcards + offer), so the
// link works cross-device and days later. FREE-FUNNEL-V2-SCOPE.md Group 3.
//
// Private token page — never indexed.
export const metadata: Metadata = {
  title: "Seu plano de estudos — MedHelpSpace",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic"; // token lookup per request

export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.lead;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const reward = token ? await getRewardByToken(token) : null;
  // Live storefront price for this turma → real price + welcome discount in the offer.
  const product = reward ? await getCohortProduct(reward.cohort) : null;
  const offer = product
    ? { priceCents: product.priceCents, compareAtPriceCents: product.compareAtPriceCents }
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm font-bold tracking-tight">
            MedHelp<span className="text-brand">Space</span>
          </Link>
          <span className="text-xs text-muted-foreground">Seu material · 1ª etapa</span>
        </div>
      </header>

      <main className="flex-1 px-5 py-10 sm:py-14">
        {reward ? (
          <>
            <div className="mx-auto mb-8 max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                Seu Simulado Honesto
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Seu resultado, seu plano e seus flashcards
              </h1>
            </div>
            <MagnetReward
              score={reward.score}
              plan={reward.plan}
              sampleCards={reward.sampleCards}
              email={reward.email}
              utm={{ source: "email", medium: "result-page", campaign: "resultado" }}
              cohort={reward.cohort}
              offer={offer}
            />
          </>
        ) : (
          <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface-1 p-8 text-center">
            <h1 className="text-xl font-bold tracking-tight">Link não encontrado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link de resultado não é válido ou expirou. Faça o simulado novamente para
              gerar um novo.
            </p>
            <Link
              href="/questoes-revalida"
              className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
            >
              Fazer o Simulado Honesto →
            </Link>
          </div>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground">
          <span>© MedHelpSpace</span>
          <span className="flex gap-4">
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-foreground">
              Termos
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
