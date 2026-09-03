import { notFound } from "next/navigation";
import { loadLibrary, filterCases } from "@/lib/clinact/library";
import { FORMATS } from "@/lib/clinact/types";
import { FormatCard, SECTION_LABEL, Trail, caseCount } from "@/components/clinact/library-cards";

/**
 * Porta B, step 2 — inside a specialty, the four formats. Deliberately built
 * in the shape of a Revalida specialty page (Karina, 2026-09-02): title,
 * a short orientation line, then the cards — with ClinAct's four formats
 * where Revalida lists its content types.
 *
 * The TEMA is never a layer here: the reader goes Pneumologia → Clínica em
 * Cena → o caso, never Pneumologia → Pneumonia.
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

      <header className="mb-8 mt-2">
        <h1 style={{ fontSize: "clamp(24px, 5vw, 36px)", fontWeight: 700, letterSpacing: "-.035em", lineHeight: 1.1, margin: 0 }}>
          {specialty.name}
        </h1>
        <p className="mt-2 text-sm leading-normal text-muted-foreground">
          Escolha como quer treinar esta especialidade. {caseCount(mine.length)} por aqui.
        </p>
      </header>

      <div style={SECTION_LABEL} className="mb-3.5">
        Formato
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FORMATS.map((format, i) => (
          <FormatCard
            key={format}
            format={format}
            index={i}
            count={filterCases(mine, { format }).length}
            href={`/clinact/treinar/casos?formato=${format}&especialidade=${specialty.slug}`}
          />
        ))}
      </div>
    </div>
  );
}
