import type { Metadata } from "next";
import Link from "next/link";
import { getMagnetQuestions, MAGNET_FREE_IDS, MAGNET_GATED_IDS } from "@/lib/magnet/questions";
import { getResumeByToken } from "@/lib/magnet/result";
import { MagnetQuiz, type MagnetUtm, type MagnetResume } from "@/components/magnet/magnet-quiz";
import { FunnelBeacon } from "@/components/magnet/funnel-beacon";
import { ExitIntentCapture } from "@/components/magnet/exit-intent-capture";
import { TrustStrip } from "@/components/magnet/trust-strip";
import { SiteText } from "@/components/landing/site-text";
import { getCohortProduct } from "@/lib/queries/cohort-products";
import { getLandingStats } from "@/lib/landing/stats";
import { REVALIDA_2026_2_SLUG, REVALIDA_2027_1_SLUG } from "@/lib/magnet/links";
import type { RewardOffer } from "@/components/magnet/magnet-reward";

// PUBLIC, indexable landing page — lives OUTSIDE the /app gate, so it never hits
// requireActiveMembership(). The 5 free questions render server-side (instant +
// SEO); the 10 gated ones load only after email capture. FREE-FUNNEL-BUILD-SPEC §3.

export const metadata: Metadata = {
  title: "Simulado Revalida 1ª Etapa — 15 Questões Comentadas Grátis",
  description:
    "Faça um simulado honesto da 1ª etapa do Revalida: 15 questões comentadas, veja seu nível e receba um plano de estudo até a data da sua prova. Grátis, sem cartão.",
  alternates: { canonical: "/questoes-revalida" },
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

  // Segment-B resume: a "come back and finish" email link carries ?retomar=<token>.
  // Load the lead's stored answers + the gated questions so the quiz rehydrates where
  // they stopped. Null (unknown/verified/completed token) → normal fresh quiz.
  const retomar = pick("retomar");
  let resume: MagnetResume | undefined;
  if (retomar) {
    const r = await getResumeByToken(retomar);
    if (r) {
      const gatedQuestions = await getMagnetQuestions(MAGNET_GATED_IDS);
      resume = { ...r, gatedQuestions };
    }
  }

  // `?direto=1` (or any truthy value) skips the welcome interstitial and drops
  // straight into Q1 — the A/B "reduce time-to-Q1" lever, set on paid-ad URLs.
  const direto = Boolean(pick("direto"));

  // Live storefront prices for both selectable turmas, so the post-verify reward
  // shows the real price + its welcome discount (never a stale/hardcoded number).
  // Live content counts back the hero trust strip.
  const [p2026, p2027, stats] = await Promise.all([
    getCohortProduct(REVALIDA_2026_2_SLUG),
    getCohortProduct(REVALIDA_2027_1_SLUG),
    getLandingStats(),
  ]);
  const offers: Record<string, RewardOffer> = {};
  for (const p of [p2026, p2027]) {
    if (p) offers[p.slug] = { priceCents: p.priceCents, compareAtPriceCents: p.compareAtPriceCents };
  }

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
          <span className="text-xs text-muted-foreground">
            <SiteText as="span" k="magnet.header_tag" fallback="Simulado Honesto · 1ª etapa" />
          </span>
        </div>
      </header>

      <main className="flex-1 px-5 py-10 sm:py-14">
        {/* Hero / intro */}
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            <SiteText as="span" k="magnet.hero_eyebrow" fallback="Revalida · 1ª etapa" />
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <SiteText
              as="span"
              multiline
              k="magnet.hero_title"
              fallback="15 questões comentadas da 1ª etapa. De graça."
            />
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            <SiteText
              as="span"
              multiline
              k="magnet.hero_subhead"
              fallback="Sem promessa de aprovação. Resolva, veja exatamente onde você está e receba um plano de estudo até a data da sua prova. As 5 primeiras são abertas — depois é só o seu e-mail."
            />
          </p>
          <TrustStrip stats={stats} />
        </div>

        {freeQuestions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            <SiteText
              as="span"
              k="magnet.empty"
              fallback="Simulado em preparação. Volte em instantes."
            />
          </p>
        ) : (
          <MagnetQuiz
            freeQuestions={freeQuestions}
            utm={utm}
            offers={offers}
            resume={resume}
            startImmediately={direto}
          />
        )}
      </main>

      {/* Exit-intent "salvar para depois" — captures a leaving visitor's email before
          the Q5 gate. Skipped on a ?retomar resume (email already on file). */}
      {!resume && <ExitIntentCapture utm={utm} />}

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
