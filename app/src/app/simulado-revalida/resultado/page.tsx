import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SIM_SESSION_COOKIE,
  SIMULADO_TOTAL,
  type SimuladoAreaScore,
} from "@/lib/magnet/simulado";
import { SIMULADO_PATH } from "@/lib/magnet/links";

// PHASE 1 SCOPE — provisional.
//
// This page currently confirms delivery and shows the raw performance numbers so
// the exam and the server-side grading can be verified end to end. The full
// diagnosis specified by Karina — best/worst áreas, temas to review, "por onde
// começar", the first platform invitation, the commented review of all 100
// questions with filters, and the second invitation — is Phase 2 and replaces the
// body of this page.
//
// The invariant it already enforces is the important one: nothing here renders
// until the exam has actually been submitted. No partial diagnosis, ever.

export const metadata: Metadata = {
  title: "Seu resultado — Simulado Revalida",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Empty({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 text-center text-foreground">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <Link
          href={cta === "prova" ? "/simulado-revalida/prova" : SIMULADO_PATH}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          {cta === "prova" ? "Voltar para a prova →" : "Começar meu simulado grátis →"}
        </Link>
      </div>
    </div>
  );
}

export default async function SimuladoResultadoPage() {
  const token = (await cookies()).get(SIM_SESSION_COOKIE)?.value;
  if (!token) {
    return (
      <Empty
        title="Não encontramos o seu simulado"
        body="Abra o link que enviamos por e-mail, ou comece um novo simulado."
        cta="novo"
      />
    );
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("first_name, sim_completed_at, sim_score, sim_answered, sim_area_scores")
    .eq("result_token", token)
    .maybeSingle();

  if (!lead) {
    return (
      <Empty
        title="Não encontramos o seu simulado"
        body="Abra o link que enviamos por e-mail, ou comece um novo simulado."
        cta="novo"
      />
    );
  }

  // The rule: no diagnosis before the prova is handed in.
  if (!lead.sim_completed_at) {
    return (
      <Empty
        title="Sua prova ainda não foi entregue"
        body="O diagnóstico e o gabarito comentado são liberados quando você entregar o simulado."
        cta="prova"
      />
    );
  }

  const firstName = (lead.first_name as string | null) ?? null;
  const score = (lead.sim_score as number | null) ?? 0;
  const answered = (lead.sim_answered as number | null) ?? 0;
  const areas = ((lead.sim_area_scores as SimuladoAreaScore[] | null) ?? []).filter(
    (a) => a.total > 0,
  );
  const blank = SIMULADO_TOTAL - answered;
  const wrong = answered - score;
  const pct = Math.round((score / SIMULADO_TOTAL) * 100);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-brand">
            Seu desempenho
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {firstName ? `Prova entregue, ${firstName}!` : "Prova entregue!"}
          </h1>

          <div className="mt-5 inline-flex items-baseline gap-1.5 rounded-2xl border border-border bg-surface-1 px-6 py-4">
            <span className="font-display text-5xl font-extrabold tabular-nums text-brand">
              {score}
            </span>
            <span className="text-xl text-muted-foreground">/{SIMULADO_TOTAL}</span>
            <span className="ml-2 self-center rounded-full bg-brand-muted/50 px-2.5 py-1 text-xs font-semibold text-brand">
              {pct}% de acerto
            </span>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            <strong className="text-foreground tabular-nums">{score}</strong> certas ·{" "}
            <strong className="text-foreground tabular-nums">{wrong}</strong> erradas ·{" "}
            <strong className="text-foreground tabular-nums">{blank}</strong> não respondidas
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface-1/50 p-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Desempenho por grande área
          </p>
          <div className="mt-3 space-y-2.5">
            {areas.map((a) => {
              const rate = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0;
              return (
                <div key={a.key} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-foreground sm:w-44">
                    {a.label}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${
                        rate >= 70 ? "bg-emerald-500" : rate >= 40 ? "bg-brand" : "bg-amber-500"
                      }`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {a.correct}/{a.total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface-1/30 p-5 text-center text-sm text-muted-foreground">
          O diagnóstico completo e o gabarito comentado das 100 questões estão sendo preparados
          nesta página.
        </div>
      </div>
    </div>
  );
}
