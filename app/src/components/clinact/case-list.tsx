import Link from "next/link";
import { Check, Clock, Lock } from "lucide-react";
import { FORMAT_LABELS, type CaseListRow } from "@/lib/clinact/types";

export const DIFFICULTY_LABELS: Record<string, string> = {
  basica: "Básica",
  intermediaria: "Intermediária",
  avancada: "Avançada",
};

export type DoneMap = Map<number, { score: number | null }>;

/**
 * The case rows, shared by both doors into the library (Karina, 2026-09-02):
 * format → specialty → case, and specialty → format → case reach the SAME
 * rows, the same ids and the same history — never a second library.
 *
 * What a card may show before the case is opened: title, format, specialty,
 * difficulty, duration and the neutral summary. What it may NOT show is the
 * TEMA — reading "Pneumonia" here hands over the reasoning the case exists to
 * train. Once the reader has finished the case there is nothing left to give
 * away, so the theme appears on those rows.
 */
export function CaseList({
  cases,
  done,
  specialtyName,
  hasAccess,
  showFormat = false,
  showSpecialty = true,
}: {
  cases: CaseListRow[];
  done: DoneMap;
  specialtyName: (id: number | null) => string | null;
  hasAccess: boolean;
  /** On mixed lists the format belongs on the row; inside one format it is noise. */
  showFormat?: boolean;
  /** Same for the specialty, when the reader arrived through it. */
  showSpecialty?: boolean;
}) {
  if (!cases.length) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Nenhum caso publicado aqui ainda.
      </div>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
      {cases.map((c) => {
        const finished = done.get(c.id);
        const playable = hasAccess || c.is_free;
        const meta = [
          showFormat ? FORMAT_LABELS[c.format] : null,
          showSpecialty ? specialtyName(c.specialty_id) ?? c.specialty_text : null,
          DIFFICULTY_LABELS[c.difficulty] ?? c.difficulty,
          // TEMA only once this reader has finished the case.
          finished ? c.topic_text : null,
        ].filter(Boolean) as string[];

        const body = (
          <>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium leading-snug">
                {c.title}
                {c.is_free && !hasAccess ? (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                    Grátis
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{meta.join(" · ")}</span>
                {c.est_minutes ? (
                  <span className="inline-flex items-center gap-0.5">
                    · <Clock className="h-3 w-3" /> {c.est_minutes} min
                  </span>
                ) : null}
              </p>
              {c.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.summary}</p> : null}
            </div>
            {finished ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="h-3 w-3" />
                {finished.score != null ? `${Math.round(Number(finished.score))}%` : "feito"}
              </span>
            ) : !playable ? (
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Disponível com a assinatura" />
            ) : null}
          </>
        );

        return (
          <li key={c.id}>
            {playable ? (
              <Link href={`/clinact/caso/${c.slug}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent/50">
                {body}
              </Link>
            ) : (
              <Link
                href="/clinact"
                title="Disponível com a assinatura"
                className="flex min-h-16 items-center gap-3 px-4 py-3 opacity-70 hover:opacity-100"
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
