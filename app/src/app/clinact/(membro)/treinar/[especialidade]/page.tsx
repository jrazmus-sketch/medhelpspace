import { notFound } from "next/navigation";
import { loadLibrary, filterCases } from "@/lib/clinact/library";
import { FORMATS } from "@/lib/clinact/types";
import { FormatCard, Trail, caseCount } from "@/components/clinact/library-cards";

/**
 * Porta B, step 2 — inside a specialty, the four formats (Karina, 2026-09-02:
 * "em vez dos cards Questões / Simulados / MedVoice, teríamos os quatro
 * formatos"). The TEMA is never a layer here: the reader goes
 * Pneumologia → Clínica em Cena → o caso, never Pneumologia → Pneumonia.
 *
 * `casos` is a sibling STATIC route, so it never reaches this dynamic one.
 */
export async function generateMetadata({ params }: { params: Promise<{ especialidade: string }> }) {
  const { especialidade } = await params;
  const { specialties } = await loadLibrary();
  const found = specialties.find((s) => s.slug === especialidade);
  return { title: found ? found.name : "Especialidade" };
}

export default async function SpecialtyPage({ params }: { params: Promise<{ especialidade: string }> }) {
  const { especialidade } = await params;
  const { specialties, cases } = await loadLibrary();
  const specialty = specialties.find((s) => s.slug === especialidade);
  // Only specialties with published cases are listed, so an unknown or empty
  // one is a dead end rather than an empty shelf.
  if (!specialty) notFound();

  const mine = filterCases(cases, { specialtyId: specialty.id });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Trail items={[{ label: "Casos", href: "/clinact/treinar" }, { label: specialty.name }]} />
      <h1 className="mt-2 text-2xl font-bold">{specialty.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {caseCount(mine.length)} nesta especialidade. Escolha como quer treiná-la.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {FORMATS.map((format) => (
          <FormatCard
            key={format}
            format={format}
            count={filterCases(mine, { format }).length}
            href={`/clinact/treinar/casos?formato=${format}&especialidade=${specialty.slug}`}
          />
        ))}
      </div>
    </div>
  );
}
