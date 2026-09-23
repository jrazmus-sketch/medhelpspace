import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActiveMembership } from "@/lib/membership-gate";
import { get60dAccess } from "@/lib/medhelp-60d";
import { getSpecialtyMemorecards } from "@/lib/memorecards";
import { availableThemes } from "@/lib/memorecards-shared";
import { MemorecardsViewer } from "@/components/content/memorecards-viewer";
import { SpecialtyIcon } from "@/components/content/specialty-icon";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import type { Crumb } from "@/lib/breadcrumbs";

// One specialty's MemoreCards: MedVoice's inner page, with the image viewer in place
// of the audio player. The 60D check runs BEFORE any card is read, so a locked
// student can never receive card URLs; they are sent to the section page, which
// shows the countdown.

export const metadata = { title: "MemoreCards" };

export default async function MemorecardsSpecialtyPage({
  params,
  searchParams,
}: {
  params: Promise<{ specialty: string }>;
  searchParams: Promise<{ tema?: string }>;
}) {
  const [{ specialty }, { tema }] = await Promise.all([params, searchParams]);
  await requireActiveMembership();
  const { unlocked } = await get60dAccess();
  if (!unlocked) redirect("/app/memorecards");

  const data = await getSpecialtyMemorecards(specialty);
  if (!data) notFound();
  const { spec, themes } = data;
  const ready = availableThemes(themes);

  const crumbs: Crumb[] = [
    { label: "Início", href: "/app" },
    { label: "MedHelp 60D", href: "/app/medhelp-60d" },
    { label: "MemoreCards", href: "/app/memorecards" },
    { label: spec.name },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 md:pt-7">
      {/* On a phone the card is the page: the trail and the orientation copy step
          aside so the first screen is the card itself. */}
      <div className="mb-2 hidden md:block">
        <VoltarButton fallbackHref="/app/memorecards" />
      </div>
      <div className="hidden md:block">
        <Breadcrumbs className="mb-6" crumbs={crumbs} />
      </div>

      <header className="mb-5 md:mb-7">
        <div className="flex items-center gap-3">
          <Link
            href="/app/memorecards"
            aria-label="Voltar para os MemoreCards"
            className="-ml-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground md:hidden"
          >
            <span aria-hidden="true" className="text-lg">←</span>
          </Link>
          <SpecialtyIcon specialtySlug={spec.slug} size={34} />
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold leading-tight md:text-3xl">{spec.name} MemoreCards</h1>
            {/* Karina's orientation line, as the subtitle: on a desktop it keeps the card
                high enough that the card AND its controls fit the first screen. */}
            <p className="mt-1 hidden max-w-prose text-sm text-muted-foreground md:block">
              Revise os pontos-chave visualmente. Avance pelos cards no seu ritmo e continue pelos
              temas da especialidade em uma sequência contínua.
            </p>
          </div>
        </div>
      </header>

      {ready.length > 0 ? (
        <MemorecardsViewer specialty={spec} themes={themes} initialSlug={tema ?? null} />
      ) : (
        <ComingSoon specialtyName={spec.name} themes={themes.map((t) => t.title)} />
      )}
    </div>
  );
}

// A specialty whose cards are still being produced: say so, show what is coming,
// and never an empty viewer.
function ComingSoon({ specialtyName, themes }: { specialtyName: string; themes: string[] }) {
  return (
    <div className="rounded-[var(--radius)] bg-surface-1 px-5 py-8 ring-1 ring-[var(--surface-2)] sm:px-8">
      <h2 className="text-lg font-semibold text-foreground">Em breve</h2>
      <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
        Os MemoreCards de {specialtyName} estão sendo produzidos. Estes são os temas que vão entrar:
      </p>
      <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-sm text-foreground sm:grid-cols-2">
        {themes.map((t) => (
          <li key={t} className="break-words">{t}</li>
        ))}
      </ul>
      <Link
        href="/app/memorecards"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
      >
        Escolher outra especialidade
      </Link>
    </div>
  );
}
