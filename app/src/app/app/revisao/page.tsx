import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRight, Layers, CalendarCheck, RotateCcw, ClipboardList, Target, Brain } from "lucide-react";
import { getReviewCounts, getWeakAreaForReview, getMemorecardRereadDue } from "@/lib/review/queries";
import { Coachmark } from "@/components/onboarding/coachmark";

export const metadata = { title: "Revisão" };

export default async function RevisaoHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [counts, weakArea, rereadDecks] = user
    ? await Promise.all([
        getReviewCounts(user.id),
        getWeakAreaForReview(user.id),
        getMemorecardRereadDue(user.id),
      ])
    : [
        { dueTotal: 0, dueFlashcards: 0, dueQuiz: 0, wrongTotal: 0 },
        { count: 0, names: [], specialtyIds: [] },
        [],
      ];
  const due = counts.dueTotal;
  const estMin = Math.max(1, Math.min(30, Math.ceil(due * 0.5)));

  const breakdown = [
    counts.dueQuiz > 0 ? `${counts.dueQuiz} ${counts.dueQuiz === 1 ? "questão" : "questões"}` : null,
    counts.dueFlashcards > 0 ? `${counts.dueFlashcards} flashcards` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-3xl px-[10px] sm:px-6 pt-7 pb-16">
      <header className="mb-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Revisão
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Mantenha o que já estudou fresco
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          A revisão usa repetição espaçada: cada item volta no momento certo para fixar na memória.
          Quanto mais você acerta, mais espaçado ele fica.
        </p>
      </header>

      <Coachmark coachKey="revisao" />

      {due > 0 ? (
        <Link
          href="/app/revisao/sessao"
          className="group block rounded-2xl bg-brand p-6 text-brand-fg transition-opacity hover:opacity-95"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest opacity-80">
                <CalendarCheck className="h-3.5 w-3.5" />
                Revisar hoje
              </div>
              <div className="mt-2 text-3xl font-black tabular-nums">
                {due} <span className="text-lg font-medium opacity-80">{due === 1 ? "item" : "itens"}</span>
              </div>
              <div className="mt-1 text-sm opacity-80">
                {breakdown ? `${breakdown} · ` : ""}~{estMin} min
              </div>
            </div>
            <ArrowRight className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            <CalendarCheck className="h-6 w-6 text-brand" />
          </div>
          <p className="mt-3 font-semibold text-foreground">Nada para revisar hoje</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Você está em dia. Resolva questões e flashcards — eles voltam aqui para revisão na hora
            certa.
          </p>
          <Link
            href="/app/estudo-por-questoes"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand"
          >
            <ClipboardList className="h-4 w-4" />
            Estudar questões
          </Link>
        </div>
      )}

      {/* Other modes */}
      {counts.wrongTotal > 0 && (
        <Link
          href="/app/revisao/sessao?mode=wrong"
          className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 p-4 transition-colors hover:border-brand/40"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-brand">
              <RotateCcw className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Só as que errei</p>
              <p className="text-xs text-muted-foreground">
                {counts.wrongTotal} {counts.wrongTotal === 1 ? "item" : "itens"} para recuperar
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {weakArea.count > 0 && (
        <Link
          href="/app/revisao/sessao?mode=weak"
          className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 p-4 transition-colors hover:border-brand/40"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-brand">
              <Target className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Pontos fracos</p>
              <p className="truncate text-xs text-muted-foreground">
                {weakArea.names.length > 0 ? weakArea.names.join(" · ") : "Suas especialidades mais fracas"}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {rereadDecks.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-brand">
              <Brain className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Reler memorecards</p>
              <p className="text-xs text-muted-foreground">
                {rereadDecks.length} {rereadDecks.length === 1 ? "conjunto" : "conjuntos"} para revisitar
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-col divide-y divide-border">
            {rereadDecks.slice(0, 5).map((d) => (
              <Link
                key={d.pageId}
                href={d.href}
                className="flex items-center justify-between gap-3 py-2 text-sm text-foreground transition-colors hover:text-brand"
              >
                <span className="truncate">{d.title}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Como funciona
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-brand">•</span> Acertou → o item demora mais para voltar.
          </li>
          <li className="flex gap-2">
            <span className="text-brand">•</span> Errou → ele volta já no dia seguinte (e entra em
            “só as que errei”).
          </li>
          <li className="flex gap-2">
            <span className="text-brand">•</span> Só aparecem aqui questões e flashcards que você já
            estudou.
          </li>
        </ul>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Layers className="h-3.5 w-3.5" />
        Questões e flashcards são intercalados na sessão para fixar melhor.
      </p>
    </div>
  );
}
