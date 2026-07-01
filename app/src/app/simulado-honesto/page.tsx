import type { Metadata } from "next";
import Link from "next/link";
import { getMagnetQuestions, MAGNET_FREE_IDS } from "@/lib/magnet/questions";
import { MagnetQuiz, type MagnetUtm } from "@/components/magnet/magnet-quiz";
import { FunnelBeacon } from "@/components/magnet/funnel-beacon";

// PUBLIC, indexable landing page — lives OUTSIDE the /app gate, so it never hits
// requireActiveMembership(). The 5 free questions render server-side (instant +
// SEO); the 10 gated ones load only after email capture. FREE-FUNNEL-BUILD-SPEC §3.

export const metadata: Metadata = {
  title: "Simulado Revalida 1ª Etapa — 15 Questões Comentadas Grátis",
  description:
    "Faça um simulado honesto da 1ª etapa do Revalida: 15 questões comentadas, veja seu nível e receba um plano de estudo até 13 de setembro. Grátis, sem cartão.",
  alternates: { canonical: "/simulado-honesto" },
};

export const dynamic = "force-dynamic"; // reads UTM from the query string

export default async function SimuladoHonestoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const utm: MagnetUtm = {
    source: pick("utm_source"),
    medium: pick("utm_medium"),
    campaign: pick("utm_campaign"),
    term: pick("utm_term"),
    content: pick("utm_content"),
    // Google auto-tagging appends ?gclid= on ad clicks; the whole funnel is one
    // route so it survives in the query string through Q5 capture.
    gclid: pick("gclid"),
  };

  const freeQuestions = await getMagnetQuestions(MAGNET_FREE_IDS);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top-of-funnel beacon (invisible): records the 'landing' step. */}
      <FunnelBeacon utm={utm} />
      {/* Minimal brand bar — kept lean for Quality Score / conversion focus */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm font-bold tracking-tight">
            MedHelp<span className="text-brand">Space</span>
          </Link>
          <span className="text-xs text-muted-foreground">Simulado Honesto · 1ª etapa</span>
        </div>
      </header>

      <main className="flex-1 px-5 py-10 sm:py-14">
        {/* Hero / intro */}
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            Revalida 2026.2 · 1ª etapa
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            15 questões comentadas da 1ª etapa. De graça.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Sem promessa de aprovação. Resolva, veja exatamente onde você está e receba um
            plano de estudo até <strong className="text-foreground">13 de setembro</strong>. As 5
            primeiras são abertas — depois é só o seu e-mail.
          </p>
        </div>

        {freeQuestions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Simulado em preparação. Volte em instantes.
          </p>
        ) : (
          <MagnetQuiz freeQuestions={freeQuestions} utm={utm} />
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
