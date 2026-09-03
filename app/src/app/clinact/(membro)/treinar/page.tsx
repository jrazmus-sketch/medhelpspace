import Link from "next/link";
import { RotateCcw, Sparkles } from "lucide-react";
import { loadLibrary } from "@/lib/clinact/library";
import { FORMATS, FORMAT_LABELS } from "@/lib/clinact/types";
import { FormatCard, SECTION_LABEL, SpecialtyCard } from "@/components/clinact/library-cards";

export const metadata = { title: "Casos" };

/**
 * The library home — the two doors Karina froze on 2026-09-02. Both lead to
 * the same cases; neither exposes the TEMA.
 */
export default async function TreinarPage() {
  const { viewer, specialties, countByFormat, dueReviews, cases } = await loadLibrary();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">Casos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Raciocínio clínico que termina em uma decisão. Um caso por vez.
      </p>

      {!viewer.hasAccess ? (
        <div className="mt-4 rounded-xl border border-brand/40 bg-brand/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-brand" /> Experimente grátis um caso de cada formato.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Os casos marcados como <strong>grátis</strong> estão liberados por completo. Os demais abrem com a assinatura.
          </p>
        </div>
      ) : null}

      {dueReviews.length ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <RotateCcw className="h-3.5 w-3.5" /> Revisões de hoje
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Casos que chegaram à data de rever. Refazer não muda a sua primeira nota — reexpõe o raciocínio.
          </p>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-amber-500/40 bg-surface-1">
            {dueReviews.map((c) => (
              <li key={c.id}>
                <Link href={`/clinact/caso/${c.slug}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{FORMAT_LABELS[c.format]}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    Rever
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Porta A — "como quero treinar?" ─────────────────────────────────── */}
      <section className="mt-8">
        <div style={SECTION_LABEL}>Treine uma habilidade</div>
        <p className="mb-3.5 mt-1.5 max-w-[54ch] text-[13.5px] leading-normal text-muted-foreground">
          Cada formato treina um jeito diferente de raciocinar. Escolha como você quer pensar hoje.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FORMATS.map((format, i) => (
            <FormatCard
              key={format}
              format={format}
              index={i}
              count={countByFormat[format]}
              href={`/clinact/treinar/casos?formato=${format}`}
            />
          ))}
        </div>
      </section>

      {/* ── Porta B — "o que quero treinar?" ────────────────────────────────── */}
      <section className="mt-10 border-t border-surface-2 pt-6">
        <div style={SECTION_LABEL}>Estude por especialidade</div>
        <p className="mb-3.5 mt-1.5 max-w-[54ch] text-[13.5px] leading-normal text-muted-foreground">
          Entre pela especialidade e escolha, lá dentro, em qual formato quer treiná-la.
        </p>
        {specialties.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {specialties.map((s, i) => (
              <SpecialtyCard key={s.id} name={s.name} count={s.count} index={i} href={`/clinact/treinar/${s.slug}`} />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma especialidade com casos publicados ainda.
          </div>
        )}
      </section>

      {cases.length ? (
        <p className="mt-8 text-center">
          <Link href="/clinact/treinar/casos" className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline">
            Ver todos os casos
          </Link>
        </p>
      ) : null}
    </div>
  );
}
