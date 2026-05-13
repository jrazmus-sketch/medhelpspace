import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { SystemSection } from "@/components/landing/system-section";
import { ThemeDemoSection } from "@/components/landing/theme-demo-section";
import { StatsSection } from "@/components/landing/stats-section";
import { MidCta } from "@/components/landing/mid-cta";
import { FaqSection } from "@/components/landing/faq-section";
import { LandingFooter } from "@/components/landing/landing-footer";

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
        <SystemSection />
        <ThemeDemoSection />
        <StatsSection />
        <MidCta />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
