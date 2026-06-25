import Link from "next/link";
import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SiteText } from "@/components/landing/site-text";
import { Check, Lock } from "lucide-react";
import { getCohortsForSale } from "@/lib/queries/cohort-products";
import type { CohortProduct } from "@/types/supabase";

const INCLUDED = [
  "Estudo por Questões — questões oficiais + simulados comentados",
  "Resumos Narrativos — casos clínicos com raciocínio e conduta",
  "MedVoice — treinamento de decisão em áudios curtos",
  "Fórmula MedHelp — atalhos de prova, macetes e mnemônicos",
  "Audiocards — flashcards em áudio com o que já caiu",
  "Guia de estudos completo",
  "Acesso em celular, tablet e computador",
  "Tema claro e escuro",
  "Atualizações contínuas",
];

const INCLUDED_60D = [
  "Revalida Up — mini-resumos: padrão + decisão treinada",
  "MemoreCards — cards visuais de alta fixação por especialidade",
  "Simulados completos (100 questões) para treinar o dia da prova",
];

export const metadata = {
  title: "Comprar — MedHelpSpace Revalida",
  description:
    "Escolha sua turma e comece agora. Acesso imediato, garantia de 7 dias.",
};

// Hourly ISR; admin price/sale edits also revalidatePath("/loja") for instant
// refresh (step 5).
export const revalidate = 3600;

export default async function LojaPage() {
  const cohorts = await getCohortsForSale();

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <LandingNav embedded />

      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-14 text-center">
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-1.5 text-sm text-foreground/40 transition-colors hover:text-foreground"
            >
              ← Voltar
            </Link>
            <h1
              className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              <SiteText as="span" k="loja.title" fallback="Comece sua preparação." />
            </h1>
            <p className="mt-4 text-base text-foreground/55 sm:text-lg">
              {cohorts.length === 0 ? (
                <SiteText
                  as="span"
                  multiline
                  k="loja.subhead_closed"
                  fallback="As inscrições para a próxima turma abrem em breve."
                />
              ) : (
                <SiteText
                  as="span"
                  multiline
                  k="loja.subhead"
                  fallback="Escolha a turma da sua prova. Acesso imediato ao sistema completo."
                />
              )}
            </p>
          </div>

          {cohorts.length === 0 ? (
            /* Empty state — no turma currently for sale */
            <div className="mx-auto max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
              <div className="mb-3 text-3xl">🔔</div>
              <h2
                className="text-xl font-bold text-foreground"
                style={{ fontFamily: "var(--font-bricolage)" }}
              >
                <SiteText as="span" k="loja.soon.title" fallback="Inscrições abertas em breve" />
              </h2>
              <p className="mt-2 text-sm text-foreground/55">
                <SiteText
                  as="span"
                  multiline
                  k="loja.soon.body"
                  fallback="Estamos preparando a próxima turma. Volte em breve para garantir sua vaga."
                />
              </p>
            </div>
          ) : (
            <>
              {/* Cohort cards */}
              <div
                className={
                  cohorts.length === 1
                    ? "mx-auto max-w-md"
                    : "grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8"
                }
              >
                {cohorts.map((cohort) => (
                  <CohortCard key={cohort.slug} cohort={cohort} />
                ))}
              </div>

              {/* Trust signals */}
              <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Check className="h-4 w-4 text-brand" />
                  <SiteText as="span" k="loja.trust.access" fallback="Acesso imediato após confirmação" />
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Check className="h-4 w-4 text-brand" />
                  <SiteText as="span" k="loja.trust.guarantee" fallback="Garantia incondicional de 7 dias" />
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Lock className="h-4 w-4 text-brand" />
                  <SiteText as="span" k="loja.trust.secure" fallback="Pagamento 100% seguro · PagBank" />
                </div>
              </div>

              {/* 60D note */}
              <div className="mt-12 rounded-2xl border border-brand/20 bg-brand/5 p-6 md:p-8">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xl">🔓</span>
                  <h3
                    className="text-lg font-bold text-foreground"
                    style={{ fontFamily: "var(--font-bricolage)" }}
                  >
                    <SiteText as="span" k="loja.60d.title" fallback="MedHelp 60D — já incluso em todas as turmas" />
                  </h3>
                </div>
                <p className="mb-4 text-sm text-foreground/60 sm:text-base">
                  <SiteText
                    as="span"
                    multiline
                    k="loja.60d.body"
                    fallback="A fase final do sistema é liberada automaticamente 60 dias antes da sua prova. Você não precisa fazer nada — o acesso abre na hora certa."
                  />
                </p>
                <ul className="flex flex-col gap-2">
                  {INCLUDED_60D.map((item, i) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-foreground/65">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <SiteText as="span" k={`loja.60d.item.${i}`} fallback={item} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

function CohortCard({ cohort }: { cohort: CohortProduct }) {
  // Cohorts are never promoted over each other — both cards render identically.
  // The choice is dictated by the user's exam date, not by a sales pitch.
  return (
    <div className="relative flex flex-col rounded-2xl bg-background border-2 border-brand shadow-lg transition-shadow">
      <div className="px-6 py-5 border-b border-brand/20">
        <div className="mb-1 text-xs font-bold uppercase tracking-widest text-brand/60">
          <SiteText as="span" k="loja.card.turma" fallback="Turma" />
        </div>
        <h2
          className="text-2xl font-extrabold text-foreground"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          {cohort.name}
        </h2>
      </div>

      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <div className="text-4xl font-extrabold tracking-tight text-foreground" style={{ fontFamily: "var(--font-bricolage)" }}>
            {cohort.priceLabel}
          </div>
          <p className="mt-1 text-sm text-foreground/45">
            <SiteText as="span" k="loja.card.installments" fallback="ou parcele em até 12x no cartão" />
          </p>
        </div>

        <IncludedList />

        <Link
          href={`/checkout?cohort=${cohort.slug}`}
          aria-label={`Comprar ${cohort.name}`}
          className="mt-auto block w-full rounded-xl bg-brand py-3.5 text-center text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95"
        >
          <SiteText as="span" k="loja.card.cta" fallback="Comprar agora" />
        </Link>
      </div>
    </div>
  );
}

function IncludedList() {
  return (
    <ul className="flex flex-col gap-2">
      {INCLUDED.map((item, i) => (
        <li key={item} className="flex items-start gap-2 text-sm text-foreground/65">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <SiteText as="span" k={`loja.included.${i}`} fallback={item} />
        </li>
      ))}
      <li className="mt-1 flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm font-medium text-brand">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <SiteText as="span" k="loja.included.lock" fallback="MedHelp 60D — liberado 60 dias antes da prova" />
      </li>
    </ul>
  );
}
