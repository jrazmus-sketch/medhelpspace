import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { SixtyDSection } from "@/components/landing/sixty-d-section";
import { ThemeDemoSection } from "@/components/landing/theme-demo-section";
import { ComparisonSection } from "@/components/landing/comparison-section";
import { PlatformTour } from "@/components/landing/platform-tour";
import { StatsSection } from "@/components/landing/stats-section";
import { FounderSection } from "@/components/landing/founder-section";
import { MidCta } from "@/components/landing/mid-cta";
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
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <LandingNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <FeaturesSection />
        <SixtyDSection />
        <ThemeDemoSection />
        <ComparisonSection />
        <PlatformTour />
        <StatsSection />
        <FounderSection />
        <MidCta />
        <FaqSection />
      </main>
      <LandingFooter />
      {/* Fixed mobile bottom CTA — appears after scrolling past hero */}
      <StickyCTABar />
    </div>
  );
}
