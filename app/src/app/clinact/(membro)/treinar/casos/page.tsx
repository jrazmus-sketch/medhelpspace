import Link from "next/link";
import { loadLibrary, filterCases, toFormat } from "@/lib/clinact/library";
import { FORMAT_LABELS, FORMAT_SKILL, SKILL_LABELS } from "@/lib/clinact/types";
import { CaseList } from "@/components/clinact/case-list";
import { Trail, caseCount } from "@/components/clinact/library-cards";

export const metadata = { title: "Casos" };

/**
 * Where both doors arrive — ONE case list, filtered. Porta A lands here with a
 * format and offers the specialties as chips; Porta B lands here with both
 * already chosen. Same cases, same ids, same history either way: there is no
 * second library (Karina, 2026-09-02).
 */
export default async function CasosPage({
  searchParams,
}: {
  searchParams: Promise<{ formato?: string; especialidade?: string }>;
}) {
  const sp = await searchParams;
  const { viewer, cases, done, specialties, specialtyName } = await loadLibrary();

  const format = toFormat(sp.formato);
  const specialty = specialties.find((s) => s.slug === sp.especialidade) ?? null;
  const list = filterCases(cases, { format, specialtyId: specialty?.id ?? null });

  const heading = format ? FORMAT_LABELS[format] : "Todos os casos";
  const query = (params: { formato?: string; especialidade?: string }) => {
    const q = new URLSearchParams();
    if (params.formato) q.set("formato", params.formato);
    if (params.especialidade) q.set("especialidade", params.especialidade);
    const s = q.toString();
    return `/clinact/treinar/casos${s ? `?${s}` : ""}`;
  };

  // The trail records the door the reader came through: arriving with a
  // specialty means they went through it, so it leads.
  const trail: { label: string; href?: string }[] = [
    { label: "Casos", href: format || specialty ? "/clinact/treinar" : undefined },
  ];
  if (specialty) trail.push({ label: specialty.name, href: `/clinact/treinar/${specialty.slug}` });
  if (format) trail.push({ label: heading });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Trail items={trail} />
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold">{heading}</h1>
        {format ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{SKILL_LABELS[FORMAT_SKILL[format]]}</p>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {`${caseCount(list.length)}${specialty ? ` em ${specialty.name}` : ""}.`}
      </p>

      {/* Specialty filter — only offered on Porta A, where it is the next
          choice. Arriving through a specialty, the trail already carries it. */}
      {format && !specialty && specialties.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-xs font-medium text-brand-fg">Todas</span>
          {specialties
            .filter((s) => filterCases(cases, { format, specialtyId: s.id }).length > 0)
            .map((s) => (
              <Link
                key={s.id}
                href={query({ formato: format, especialidade: s.slug })}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs font-medium hover:bg-accent/50"
              >
                {s.name}
              </Link>
            ))}
        </div>
      ) : null}

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
