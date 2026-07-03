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
import { getCohortsForSale } from "@/lib/queries/cohort-products";
import { getLandingStats } from "@/lib/landing/stats";

export const metadata = {
  title: "MedHelpSpace Revalida — Sistema de Aprovação",
  description:
    "O sistema feito só para o Revalida: questões comentadas, resumos narrativos, MedVoice, flashcards com repetição espaçada e um plano que se monta sozinho. Uma compra, sem mensalidade.",
};

// Hourly ISR: storefront pricing is re-read at most once an hour (so a sale that
// auto-closes drops within the hour). Admin price/sale edits also call
// revalidatePath("/") for instant refresh (step 5).
export const revalidate = 3600;

export default async function LandingPage() {
  // site_content is provided by the root layout's SiteContentProvider, so every
  // <SiteText> below is wired without a local provider here.
  const [cohorts, stats] = await Promise.all([getCohortsForSale(), getLandingStats()]);

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
        <FounderSection stats={stats} />
        <PricingCTA cohorts={cohorts} />
        <FaqSection />
      </main>
      <LandingFooter />
      <StickyCTABar />
    </div>
  );
}
