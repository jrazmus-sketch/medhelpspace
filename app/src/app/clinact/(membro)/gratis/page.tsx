import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Clock, MapPin } from "lucide-react";
import { loadLibrary } from "@/lib/clinact/library";
import { freeCaseSet } from "@/lib/clinact/library-filters";
import { scenarioLabel } from "@/lib/clinact/scenarios";
import { FORMAT_COLOR_VARS, FORMAT_LABELS, FORMAT_SKILL, SKILL_LABELS } from "@/lib/clinact/types";
import { FORMAT_ICONS } from "@/components/clinact/library-cards";
import { ClinactText } from "@/components/clinact/clinact-text";

export const metadata = { title: "Experimente o ClinAct" };

/**
 * The four free cases on their own (Karina 2026-11-03). Whoever clicks
 * "Experimente o ClinAct de graça" lands here after confirming the e-mail —
 * not in the full library, where the free case of each format sat at the end
 * of a list of locked ones. One case per format, in the fixed format order,
 * then — separately, never competing — the invitation to the full library.
 *
 * A subscriber has nothing to try: straight to the library, as before. Admins
 * stay, so the page can be reviewed.
 */
export default async function GratisPage() {
  const { viewer, cases, done, specialtyName } = await loadLibrary();
  if (viewer.hasAccess && !viewer.isAdmin) redirect("/clinact/treinar");

  const free = freeCaseSet(cases);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">
        <ClinactText k="clinact.app.gratis.title" />
      </h1>
      <p className="mt-1 max-w-[52ch] text-[15px] text-muted-foreground">
        <ClinactText k="clinact.app.gratis.sub" />
      </p>

      {free.length ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {free.map((c) => {
            const color = FORMAT_COLOR_VARS[c.format];
            const Icon = FORMAT_ICONS[c.format];
            const finished = done.get(c.id);
            const specialty = specialtyName(c.specialty_id) ?? c.specialty_text;
            const scenario = scenarioLabel(c.scenario);
            return (
              <li key={c.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-1">
                {/* The format in its own colour — the pairing the library teaches — as a
                    TINT with the hue as ink: white on the dark palette's pastels fails contrast. */}
                <div
                  className="flex items-center gap-3 border-b border-border px-4 py-3"
                  style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}
                >
                  <Icon size={20} strokeWidth={1.7} className="shrink-0" style={{ color }} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-[0.12em]" style={{ color }}>
                      {SKILL_LABELS[FORMAT_SKILL[c.format]]}
                    </p>
                    <p className="text-[15px] font-bold leading-tight text-foreground">{FORMAT_LABELS[c.format]}</p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">Grátis</span>
                    {finished ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <Check className="h-3 w-3" aria-hidden />
                        {finished.score != null ? `${Math.round(Number(finished.score))}%` : "Feito"}
                      </span>
                    ) : null}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold leading-snug">{c.title}</h2>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {specialty ? <li>{specialty}</li> : null}
                    {scenario ? (
                      <li className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {scenario}
                      </li>
                    ) : null}
                    {c.est_minutes ? (
                      <li className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> {c.est_minutes} min
                      </li>
                    ) : null}
                  </ul>
                  <Link
                    href={`/clinact/caso/${c.slug}`}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-base font-semibold text-brand-fg sm:mt-auto"
                  >
                    {finished ? "Fazer de novo" : "Começar caso"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Os casos gratuitos voltam em breve.
        </div>
      )}

      {/* The full library exists — said once, after the trial, never competing with it. */}
      <section className="mt-10 rounded-2xl border border-brand/40 bg-brand/10 p-5 text-center sm:p-6">
        <h2 className="text-lg font-semibold">
          <ClinactText k="clinact.app.gratis.mais_title" />
        </h2>
        <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted-foreground">
          <ClinactText k="clinact.app.gratis.mais_body" />
        </p>
        <Link
          href="/clinact#planos"
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-8 text-base font-semibold text-brand-fg"
        >
          <ClinactText k="clinact.app.gratis.mais_cta" />
        </Link>
      </section>
    </div>
  );
}
