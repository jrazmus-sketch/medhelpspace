import { Brain } from "lucide-react";
import { requireActiveMembership } from "@/lib/membership-gate";
import { get60dAccess } from "@/lib/medhelp-60d";
import { getMemorecardsIndex } from "@/lib/memorecards";
import { Medhelp60NextCycle } from "@/components/content/medhelp-60d-next-cycle";
import { Medhelp60Locked } from "@/components/content/medhelp-60d-locked";
import { TrackHubAccordion } from "@/components/content/track-hub-accordion";
import { Coachmark } from "@/components/onboarding/coachmark";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import type { Crumb } from "@/lib/breadcrumbs";

// MedHelp 60D → MemoreCards (v2, Karina 2026-09-23). Reached from the 60D accordion.
//
// Same shape as the MedVoice and Revalida Up hubs — grande área → especialidade on
// the shared TrackHubAccordion — because she asked that students recognise the
// pattern at once. The list is Revalida Up's: every specialty with Revalida Up
// themes appears, and one whose cards are not produced yet reads "Em breve".
//
// Gated like Simulados 100Q: this page checks the 60D unlock so an early visitor
// sees the countdown, and the cards are only ever read after that check.

export const metadata = { title: "MemoreCards" };

export default async function MemorecardsIndexPage() {
  await requireActiveMembership();
  const { unlocked, daysUntilUnlock, nextCycle } = await get60dAccess();

  const crumbs: Crumb[] = [
    { label: "Início", href: "/app" },
    { label: "MedHelp 60D", href: "/app/medhelp-60d" },
    { label: "MemoreCards" },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app/medhelp-60d" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className="flex items-center justify-center rounded-[var(--radius)]"
            style={{
              width: 44,
              height: 44,
              background: "color-mix(in srgb, var(--brand) 12%, transparent)",
              color: "var(--brand)",
            }}
          >
            <Brain size={24} strokeWidth={1.8} />
          </span>
          <h1 className="text-3xl font-bold leading-tight">MemoreCards</h1>
        </div>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Revise os pontos-chave visualmente. Avance pelos cards no seu ritmo e continue pelos
          temas da especialidade em uma sequência contínua.
        </p>
      </header>

      {/* The how-to lives here, not on the viewer: on a phone the tip would push the
          card and its controls below the first screen. */}
      {unlocked && <Coachmark coachKey="memorecards" className="mb-6 mt-0" />}

      {unlocked ? (
        <MemorecardsIndex />
      ) : nextCycle ? (
        <Medhelp60NextCycle cohortName={nextCycle.cohortName} unlockDateLabel={nextCycle.unlockDateLabel} />
      ) : (
        <Medhelp60Locked sectionName="Os MemoreCards" daysUntilUnlock={daysUntilUnlock} />
      )}
    </div>
  );
}

async function MemorecardsIndex() {
  const groups = await getMemorecardsIndex();
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Conteúdo em preparação.</p>;
  }
  return <TrackHubAccordion groups={groups} ctaLabel="Revisar" accentColor="var(--brand)" />;
}
