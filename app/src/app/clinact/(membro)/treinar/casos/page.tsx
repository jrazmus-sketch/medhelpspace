import Link from "next/link";
import { loadLibrary, filterCases, scenarioCounts, toFormat, toScenario } from "@/lib/clinact/library";
import { FORMATS, FORMAT_LABELS, FORMAT_SKILL, SKILL_LABELS, type CaseFormat } from "@/lib/clinact/types";
import { scenarioLabel, type Scenario } from "@/lib/clinact/scenarios";
import { CaseList } from "@/components/clinact/case-list";
import { Trail, caseCount } from "@/components/clinact/library-cards";
import { ScenarioChips } from "@/components/clinact/scenario-chips";
import { cn } from "@/lib/utils";

export const metadata = { title: "Casos" };

type Params = { formato?: string; especialidade?: string; cenario?: string };

/**
 * Where both doors arrive — ONE case list, filtered. Porta A lands here with a
 * format and offers the specialties as chips; Porta B lands here with both
 * already chosen. Same cases, same ids, same history either way: there is no
 * second library (Karina, 2026-09-02).
 *
 * The clinical scenario (2026-10-13) is a third filter, offered on every view
 * and combined with the other two: Código Clínico + Cardiologia + Ambulatório
 * shows only the cases that meet all three. Every filter lives in the query
 * string, so reload, back/forward and a shared link keep the selection, and
 * the count is always the filtered result. "Ver todos os casos" (no format)
 * also offers the format row, so all three combine there too.
 */
export default async function CasosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const { viewer, cases, done, specialties, specialtyName } = await loadLibrary();

  const format = toFormat(sp.formato);
  const specialty = specialties.find((s) => s.slug === sp.especialidade) ?? null;
  const scenario = toScenario(sp.cenario);
  const list = filterCases(cases, { format, specialtyId: specialty?.id ?? null, scenario });

  const heading = format ? FORMAT_LABELS[format] : "Todos os casos";
  const query = (p: { formato?: string | null; especialidade?: string | null; cenario?: string | null }) => {
    const q = new URLSearchParams();
    if (p.formato) q.set("formato", p.formato);
    if (p.especialidade) q.set("especialidade", p.especialidade);
    if (p.cenario) q.set("cenario", p.cenario);
    const s = q.toString();
    return `/clinact/treinar/casos${s ? `?${s}` : ""}`;
  };
  const current = { formato: format, especialidade: specialty?.slug ?? null, cenario: scenario };

  // The trail records the door the reader came through: arriving with a
  // specialty means they went through it, so it leads.
  const trail: { label: string; href?: string }[] = [
    { label: "Casos", href: format || specialty || scenario ? "/clinact/treinar" : undefined },
  ];
  if (specialty) trail.push({ label: specialty.name, href: `/clinact/treinar/${specialty.slug}` });
  if (format) trail.push({ label: heading });

  // Each row counts within the OTHER active filters, so a chip never promises
  // cases the current combination does not have.
  const forFormatRow = filterCases(cases, { specialtyId: specialty?.id ?? null, scenario });
  const forSpecialtyRow = filterCases(cases, { format, scenario });
  const forScenarioRow = filterCases(cases, { format, specialtyId: specialty?.id ?? null });

  const chip = "inline-flex min-h-11 items-center rounded-full px-4 text-xs font-medium";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Trail items={trail} />
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold">{heading}</h1>
        {format ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-text">{SKILL_LABELS[FORMAT_SKILL[format]]}</p>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {`${caseCount(list.length)}${specialty ? ` em ${specialty.name}` : ""}${scenario ? ` · ${scenarioLabel(scenario)}` : ""}.`}
      </p>

      <div className="mt-4 space-y-3">
        {/* Format filter — only on the general listing ("Ver todos os casos");
            on a format page the format IS the page. */}
        {!format ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Formato">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">Formato:</span>
            <span className={cn(chip, "bg-brand text-brand-fg")} aria-current="true">
              Todos
            </span>
            {FORMATS.filter((f: CaseFormat) => filterCases(forFormatRow, { format: f }).length > 0).map((f) => (
              <Link key={f} href={query({ ...current, formato: f })} className={cn(chip, "border border-border hover:bg-accent/50")}>
                {FORMAT_LABELS[f]}
              </Link>
            ))}
          </div>
        ) : null}

        {/* Specialty filter — offered until a specialty is chosen. Arriving
            through a specialty (Porta B), the trail already carries it. */}
        {!specialty && specialties.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Especialidade">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">Especialidade:</span>
            <span className={cn(chip, "bg-brand text-brand-fg")} aria-current="true">
              Todas
            </span>
            {specialties
              .filter((s) => filterCases(forSpecialtyRow, { specialtyId: s.id }).length > 0)
              .map((s) => (
                <Link key={s.id} href={query({ ...current, especialidade: s.slug })} className={cn(chip, "border border-border hover:bg-accent/50")}>
                  {s.name}
                </Link>
              ))}
          </div>
        ) : null}

        {/* Scenario filter — always the same six chips; one with no case for
            this combination is faded and not a link (Karina 2026-10-13). */}
        <ScenarioChips
          label="Cenário:"
          counts={scenarioCounts(forScenarioRow)}
          active={scenario}
          hrefFor={(slug: Scenario) => query({ ...current, cenario: slug })}
          allHref={query({ ...current, cenario: null })}
        />
      </div>

      <CaseList
        cases={list}
        done={done}
        specialtyName={specialtyName}
        hasAccess={viewer.hasAccess}
        showFormat={!format}
        showSpecialty={!specialty}
      />
    </div>
  );
}
