import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { StatsNumbers } from "@/components/landing/stats-numbers";
import { CinematicFeatures } from "@/components/landing/cinematic-features";
import { SixtyDSection } from "@/components/landing/sixty-d-section";
import { PricingCTA } from "@/components/landing/pricing-cta";
import { FaqSection } from "@/components/landing/faq-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { StickyCTABar } from "@/components/landing/sticky-cta-bar";

export const metadata = {
  title: "MedHelpSpace Revalida — Sistema de Aprovação",
  description:
    "Prepare-se para o Revalida com método: questões comentadas, resumos narrativos, flashcards, MedVoice e muito mais. Revalida 2026.2 e 2027.1.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--lp-base)" }}>
      <div className="lp-grain" aria-hidden="true" />
      <LandingNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <StatsNumbers />
        <CinematicFeatures />
        <SixtyDSection />
        <PricingCTA />
        <FaqSection />
      </main>
      <LandingFooter />
      <StickyCTABar />
    </div>
  );
}
