import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRight, Layers, CalendarCheck } from "lucide-react";
import { getReviewCounts } from "@/lib/review/queries";

export const metadata = { title: "Revisão" };

export default async function RevisaoHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const counts = user ? await getReviewCounts(user.id) : { dueTotal: 0, dueFlashcards: 0 };
  const due = counts.dueFlashcards;
  const estMin = Math.max(1, Math.min(20, Math.ceil(due * 0.5)));

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
          A revisão usa repetição espaçada: cada carta volta no momento certo para fixar na
          memória. Quanto mais você acerta, mais espaçada ela fica.
        </p>
      </header>

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
                {due} <span className="text-lg font-medium opacity-80">cartas</span>
              </div>
              <div className="mt-1 text-sm opacity-80">~{estMin} min · repetição espaçada</div>
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
            Você está em dia. Estude flashcards novos e eles voltam aqui para revisão na hora certa.
          </p>
          <Link
            href="/app/flashcards"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand"
          >
            <Layers className="h-4 w-4" />
            Ir para os flashcards
          </Link>
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Como funciona
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-brand">•</span> Acertou → a carta demora mais para voltar.
          </li>
          <li className="flex gap-2">
            <span className="text-brand">•</span> Errou → ela volta já no dia seguinte.
          </li>
          <li className="flex gap-2">
            <span className="text-brand">•</span> Só aparecem aqui conteúdos que você já estudou.
          </li>
        </ul>
      </div>
    </div>
  );
}
