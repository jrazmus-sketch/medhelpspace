import { SiteText } from "@/components/landing/site-text";
import { getSimuladoAreaCounts } from "@/lib/magnet/simulado";

// "Isto é o que você recebe no final" — a preview of the report, shown on the
// landing page BEFORE we ask for 100 questions of someone's evening.
//
// Without it the offer is all cost and no visible payoff: a form asking for your
// e-mail in exchange for homework. The structure here is the real report's (score
// against the cut line, the five grandes áreas, the commented gabarito), and the
// área totals are read from the live set so they can't drift — but the performance
// numbers are illustrative and labelled "exemplo", because inventing a plausible
// score and passing it off as real would be exactly the wrong move for a brand
// whose whole positioning is honesty.

const EXAMPLE = [
  { key: "clinica-medica", correct: 24, rate: 62 },
  { key: "go", correct: 12, rate: 67 },
  { key: "pediatria", correct: 8, rate: 47 },
  { key: "cirurgia", correct: 11, rate: 69 },
  { key: "saude-coletiva", correct: 4, rate: 40 },
];

export async function SimuladoReportPreview() {
  const counts = await getSimuladoAreaCounts();
  const byKey = new Map(counts.map((c) => [c.key as string, c]));

  return (
    <section className="border-y border-border/60 bg-surface-1/20">
      <div className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-brand">
            <SiteText as="span" k="sim.preview.eyebrow" fallback="O que você recebe no final" />
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            <SiteText
              as="span"
              k="sim.preview.title"
              fallback="Um retrato honesto de onde você está"
            />
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            <SiteText
              as="span"
              multiline
              k="sim.preview.body"
              fallback="Ao entregar a prova, você vê seu desempenho nas cinco grandes áreas, os temas que merecem revisão e o gabarito comentado das 100 questões — por que a alternativa correta está certa e onde cada uma das outras engana."
            />
          </p>
        </div>

        {/* Stylised report card — same structure as the real thing. */}
        <div className="mx-auto mt-8 max-w-md overflow-hidden rounded-2xl border border-border/80 bg-surface-1/70 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="border-b border-border/60 px-5 py-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <SiteText as="span" k="sim.preview.card_label" fallback="Exemplo de relatório" />
            </p>
            <div className="mt-2 flex items-baseline justify-center gap-1.5">
              <span className="font-display text-4xl font-extrabold tabular-nums text-brand">59</span>
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
            <p className="mt-1.5 text-xs text-amber-400">
              <SiteText
                as="span"
                k="sim.preview.card_verdict"
                fallback="1 ponto abaixo da nota de corte de referência"
              />
            </p>
          </div>

          <div className="space-y-2.5 px-5 py-4">
            {EXAMPLE.map((row) => {
              const area = byKey.get(row.key);
              if (!area) return null;
              return (
                <div key={row.key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground sm:w-36">
                    {area.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${
                        row.rate >= 70 ? "bg-emerald-500" : row.rate >= 45 ? "bg-brand" : "bg-amber-500"
                      }`}
                      style={{ width: `${row.rate}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {row.correct}/{area.count}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border/60 bg-surface-2/40 px-5 py-3.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-brand">
              <SiteText as="span" k="sim.preview.card_comment_label" fallback="+ gabarito comentado" />
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              <SiteText
                as="span"
                multiline
                k="sim.preview.card_comment"
                fallback="Questão a questão: sua resposta, a alternativa correta, o comentário e o conceito-chave."
              />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
