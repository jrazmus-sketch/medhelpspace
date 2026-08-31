import Link from "next/link";
import { getClinactViewer } from "@/lib/clinact/access";
import { getEvolution } from "@/lib/clinact/evolution";
import { FORMAT_LABELS, FORMATS, type CaseFormat } from "@/lib/clinact/types";
import { toDateKeyBR } from "@/lib/br-date";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Minha Evolução" };

// Simple version (spec §5) — ships in the pilot. The full Perfil de
// Raciocínio Clínico stays Phase 2. Everything here is a live query;
// repeats and previews never move these numbers (§2.3).

function fmtDate(v: string): string {
  const key = toDateKeyBR(v);
  if (!key) return "—";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-surface-1"}`}>
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function EvolucaoPage() {
  const viewer = await getClinactViewer();
  const ev = await getEvolution(viewer.userId);
  const confTotal = ev.confidence.baixa + ev.confidence.media + ev.confidence.alta;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">Minha Evolução</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Conta a <strong>primeira conclusão</strong> de cada caso. Refazer um caso treina — mas não muda estes números.
      </p>

      {ev.completed === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum caso concluído ainda.</p>
          <Link href="/clinact/treinar" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-fg">
            Começar um caso
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Treinos concluídos" value={String(ev.completed)} />
            <Stat label="Desempenho geral" value={ev.overall != null ? `${Math.round(ev.overall)}%` : "—"} />
            <Stat
              label="Erros com alta confiança"
              value={String(ev.highConfidenceErrors)}
              tone={ev.highConfidenceErrors > 0 ? "warn" : undefined}
              hint={ev.highConfidenceErrors > 0 ? "Tinha certeza — e não era. É aqui que mora o maior risco na prova e na vida real." : "Nenhum até agora."}
            />
          </div>

          {/* Per format */}
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por formato</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-border bg-surface-1">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {FORMATS.map((f: CaseFormat) => {
                    const row = ev.byFormat[f];
                    return (
                      <tr key={f}>
                        <td className="px-4 py-3 font-medium">{FORMAT_LABELS[f]}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{row ? `${row.count} caso(s)` : "—"}</td>
                        <td className="w-20 px-4 py-3 text-right font-semibold tabular-nums">{row ? `${Math.round(row.mean)}%` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Confidence */}
          {confTotal > 0 ? (
            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confiança nas decisões</h2>
              <div className="mt-2 space-y-2 rounded-xl border border-border bg-surface-1 p-4">
                {(["alta", "media", "baixa"] as const).map((c) => {
                  const n = ev.confidence[c];
                  const pct = Math.round((n / confTotal) * 100);
                  return (
                    <div key={c} className="flex items-center gap-3 text-sm">
                      <span className="w-14 capitalize">{c === "media" ? "Média" : c === "alta" ? "Alta" : "Baixa"}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-16 text-right tabular-nums text-muted-foreground">{n} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Case list */}
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Casos concluídos</h2>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
              {ev.cases.map((c) => (
                <li key={c.case_id}>
                  <Link href={`/clinact/caso/${c.slug}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{FORMAT_LABELS[c.format]}</span>
                        <span>· {fmtDate(c.finished_at)}</span>
                        {c.highConfidenceErrors > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3" /> {c.highConfidenceErrors} erro(s) com alta confiança
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {Math.round(c.score)}%
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
