import { ClipboardCheck } from "lucide-react";
import { requireActiveMembership } from "@/lib/membership-gate";
import { get60dAccess } from "@/lib/medhelp-60d";
import { Medhelp60NextCycle } from "@/components/content/medhelp-60d-next-cycle";
import { Medhelp60Locked } from "@/components/content/medhelp-60d-locked";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { Simulados100qGrid } from "@/components/content/simulados-100q-grid";

// MedHelp 60D → "Simulados 100Q". Reached from the 60D accordion.
//
// Gated twice on purpose: this page checks the 60D unlock date so the section
// can't be opened early by URL, and each simulado page enforces it again in the
// [slug] route via content_module_id. Neither check is redundant — this one exists
// so an early visitor gets the countdown instead of an empty grid.

export const metadata = { title: "Simulados 100Q" };

export default async function Simulados100qPage() {
  await requireActiveMembership();
  const { unlocked, daysUntilUnlock, nextCycle } = await get60dAccess();

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app/medhelp-60d" />
      </div>
      <Breadcrumbs className="mb-6" />

      <header className="mb-8">
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
            <ClipboardCheck size={24} strokeWidth={1.8} />
          </span>
          <h1 className="text-3xl font-bold leading-tight">Simulados 100Q</h1>
        </div>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Simulados completos de 100 questões, no formato e no peso das cinco grandes áreas
          da 1ª etapa. Use-os para medir desempenho, não para aprender conteúdo novo.
        </p>
      </header>

      {unlocked ? (
        <Simulados100qGrid />
      ) : nextCycle ? (
        <Medhelp60NextCycle
          cohortName={nextCycle.cohortName}
          unlockDateLabel={nextCycle.unlockDateLabel}
        />
      ) : (
        <Medhelp60Locked sectionName="Os Simulados 100Q" daysUntilUnlock={daysUntilUnlock} />
      )}
    </div>
  );
}
