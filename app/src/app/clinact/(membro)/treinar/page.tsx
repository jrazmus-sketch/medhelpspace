import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPublishedCases, getCanonicalAttempts, getTaxonomy } from "@/lib/clinact/queries";
import { FORMAT_LABELS, type CaseFormat } from "@/lib/clinact/types";
import { Check, Clock } from "lucide-react";

export const metadata = { title: "Casos" };

const DIFF: Record<string, string> = { basica: "Básica", intermediaria: "Intermediária", avancada: "Avançada" };

export default async function TreinarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [cases, canonical, taxonomy] = await Promise.all([
    listPublishedCases(),
    user ? getCanonicalAttempts(user.id) : Promise.resolve(new Map()),
    getTaxonomy(),
  ]);
  const spName = new Map(taxonomy.specialties.map((s) => [s.id, s.name]));
  const byFormat = new Map<CaseFormat, typeof cases>();
  for (const c of cases) byFormat.set(c.format, [...(byFormat.get(c.format) ?? []), c]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">Casos</h1>
      <p className="mt-1 text-sm text-muted-foreground">Raciocínio clínico que termina em uma decisão. Um caso por vez.</p>

      {cases.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum caso publicado ainda.</div>
      ) : (
        [...byFormat.entries()].map(([format, list]) => (
          <section key={format} className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-brand">{FORMAT_LABELS[format]}</h2>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
              {list.map((c) => {
                const done = canonical.get(c.id);
                return (
                  <li key={c.id}>
                    <Link href={`/clinact/caso/${c.slug}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent/50">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">{c.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>{(c.specialty_id && spName.get(c.specialty_id)) || c.specialty_text || "—"}</span>
                          {c.topic_text ? <span>· {c.topic_text}</span> : null}
                          <span>· {DIFF[c.difficulty] ?? c.difficulty}</span>
                          {c.est_minutes ? <span className="inline-flex items-center gap-0.5">· <Clock className="h-3 w-3" /> {c.est_minutes} min</span> : null}
                        </p>
                        {c.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.summary}</p> : null}
                      </div>
                      {done ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <Check className="h-3 w-3" /> {done.score != null ? `${Math.round(Number(done.score))}%` : "feito"}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
