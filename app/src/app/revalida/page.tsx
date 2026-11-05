import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { IdentityBand } from "@/components/landing/identity-band";
import { ProblemSection } from "@/components/landing/problem-section";
import { StatsNumbers } from "@/components/landing/stats-numbers";
import { SystemShowcase } from "@/components/landing/system-showcase";
import { RevisaoSection } from "@/components/landing/revisao-section";
import { PlanoSection } from "@/components/landing/plano-section";
import { DesktopShowcase } from "@/components/landing/desktop-showcase";
import { SixtyDSection } from "@/components/landing/sixty-d-section";
import { FounderSection } from "@/components/landing/founder-section";
import { PricingCTA } from "@/components/landing/pricing-cta";
import { FaqSection } from "@/components/landing/faq-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { StickyCTABar } from "@/components/landing/sticky-cta-bar";
import { WhatsAppButton } from "@/components/marketing/whatsapp-button";
import { LandingEvents } from "@/components/analytics/landing-events";
import { getSitePagePublished } from "@/lib/queries/site-sections";
import { WHATSAPP_GATE_KEY } from "@/lib/whatsapp";
import { getCohortsForSale } from "@/lib/queries/cohort-products";
import { getPromoBanner } from "@/lib/cohort-promotions";
import { getLandingStats } from "@/lib/landing/stats";

// The Revalida sales page lives at /revalida since the MedHelpSpace home page
// (/, the two-product chooser) took the root (Karina 2026-11-05). Its share card
// is spelled out in full: Next does NOT deep-merge openGraph/twitter, and the
// root layout's defaults point at "/", not here.
const TITLE = "MedHelpSpace Revalida — Sistema de Aprovação";
const DESCRIPTION =
  "O sistema feito só para o Revalida: questões comentadas, resumos narrativos, MedVoice, flashcards com repetição espaçada e um plano que se monta sozinho. Uma compra, sem mensalidade.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/revalida" },
  openGraph: {
    siteName: "MedHelpSpace",
    title: "MedHelpSpace Revalida",
    description: DESCRIPTION,
    // og:url deliberately omitted — same reasoning as simulado-revalida/page.tsx.
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "https://www.medhelpspace.com.br/og-image.png",
        width: 1200,
        height: 630,
        alt: "MedHelpSpace Revalida",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MedHelpSpace Revalida",
    description: DESCRIPTION,
    images: ["https://www.medhelpspace.com.br/og-image.png"],
  },
};

// Hourly ISR: storefront pricing is re-read at most once an hour (so a sale that
// auto-closes drops within the hour). Admin price/sale edits also call
// revalidatePath("/revalida") for instant refresh (step 5).
export const revalidate = 3600;

export default async function LandingPage() {
  // site_content is provided by the root layout's SiteContentProvider, so every
  // <SiteText> below is wired without a local provider here.
  const [cohorts, stats, whatsappPublished] = await Promise.all([
    getCohortsForSale(),
    getLandingStats(),
    getSitePagePublished(WHATSAPP_GATE_KEY.revalida),
  ]);
  const promo = await getPromoBanner(cohorts);

  return (
    <div className="min-h-screen" style={{ background: "var(--lp-base)" }}>
      <div className="lp-grain" aria-hidden="true" />
      <LandingNav />
      <main>
        <HeroSection />
        <IdentityBand />
        <ProblemSection />
        <StatsNumbers stats={stats} />
        <SystemShowcase stats={stats} />
        <SixtyDSection />
        <RevisaoSection />
        <PlanoSection />
        <DesktopShowcase />
        <FounderSection />
        <PricingCTA cohorts={cohorts} promo={promo} />
        <FaqSection />
      </main>
      <LandingFooter />
      <StickyCTABar />
      <WhatsAppButton product="revalida" published={whatsappPublished} />
      {/* GA4 funnel: view_<section>_section + scroll_25/50/75/90 (Karina 2026-09-30) */}
      <LandingEvents />
    </div>
  );
}
