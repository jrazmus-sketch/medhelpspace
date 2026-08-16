import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/queries/cohort-products";
import { buildRefUrl } from "@/lib/ambassadors/ref-link";
import {
  getAmbassadorForUser,
  getPanelData,
  MIN_PAYOUT_CENTS,
  type CommissionRow,
} from "@/lib/ambassadors/panel";
import { toDateKeyBR } from "@/lib/br-date";
import { MousePointerClick, ShoppingBag, Clock, Wallet } from "lucide-react";

export const metadata = { title: "Painel do Embaixador — MedHelpSpace" };
export const dynamic = "force-dynamic";

// Ambassador panel — consultation only in the first cycle (Contrato, cl. 7.4, 8.1).
//
// Deliberately NOT under /app: that layout requires an active cohort membership,
// and most ambassadors hold none. Access here is granted by having an
// `ambassadors` row, which is a different thing entirely from being a student.
//
// There is no withdrawal button by design (cl. 7.4) — the NFS-e arrives by
// e-mail and an admin records the payout. The data model behind this page
// already carries the full status ladder, so switching self-service on later is
// a form, not a migration.

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  liberada: "Liberada",
  em_analise: "Em análise",
  paga: "Paga",
  cancelada: "Cancelada",
};

const STATUS_STYLES: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-300",
  liberada: "bg-emerald-500/15 text-emerald-300",
  em_analise: "bg-sky-500/15 text-sky-300",
  paga: "bg-brand/15 text-brand",
  cancelada: "bg-muted text-muted-foreground",
};

function formatDateBR(value: string | null): string {
  const key = toDateKeyBR(value);
  if (!key) return "—";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

function StatCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {props.icon}
        <span className="text-[13px] font-medium">{props.label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{props.value}</p>
      {props.hint ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{props.hint}</p>
      ) : null}
    </div>
  );
}

function CommissionItem({ row }: { row: CommissionRow }) {
  const isAdjustment = row.kind === "adjustment";
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {STATUS_LABELS[row.status] ?? row.status}
          </span>
          {isAdjustment ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              Ajuste
            </span>
          ) : row.attributionSource ? (
            <span className="text-[11px] text-muted-foreground">
              {row.attributionSource === "coupon" ? "Cupom" : "Link"}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAdjustment
            ? (row.notes ?? "Ajuste de comissão")
            : `Venda de ${formatBRL(row.baseAmountCents)} · ${formatDateBR(row.confirmedAt)}`}
        </p>
        {row.status === "pendente" && row.releaseOn ? (
          <p className="mt-0.5 text-xs text-amber-300/90">
            Liberação prevista em {formatDateBR(row.releaseOn)}
          </p>
        ) : null}
      </div>
      <p
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          row.amountCents < 0 ? "text-red-300" : ""
        }`}
      >
        {row.amountCents < 0 ? "−" : ""}
        {formatBRL(Math.abs(row.amountCents))}
      </p>
    </li>
  );
}

export default async function EmbaixadorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // This route sits outside the proxy's protected prefixes, so it does its own
  // auth check rather than inheriting one.
  if (!user) redirect("/login?next=/embaixador");

  const ambassador = await getAmbassadorForUser(user.id);
  // Not an ambassador → the page simply doesn't exist for them. No hint that it
  // might, and no half-rendered shell.
  if (!ambassador) redirect("/app");

  const data = await getPanelData(ambassador);

  const host = (await headers()).get("host") ?? "medhelpspace.com.br";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const refUrl = buildRefUrl(`${proto}://${host}`, ambassador.code);

  const reachedMinimum = data.availableCents >= MIN_PAYOUT_CENTS;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header>
        <p className="text-[13px] font-medium uppercase tracking-wide text-brand">
          Programa de Embaixadores
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Seu painel</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Acompanhe seus cliques, vendas atribuídas e comissões. Os valores abaixo são
          calculados automaticamente — você não precisa somar nada para solicitar o repasse.
        </p>
      </header>

      {ambassador.status !== "active" ? (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed">
          Sua participação está <strong>{ambassador.status === "pending" ? "aguardando ativação" : "encerrada"}</strong>.
          Novas vendas não geram comissão, mas as comissões já registradas continuam devidas.
        </div>
      ) : null}

      {/* ── Cupom e link ─────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-border bg-surface-1 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Seu cupom e seu link</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Cupom (5% para o comprador)</p>
            <p className="mt-1 select-all break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
              {ambassador.code}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Link de indicação (30 dias)</p>
            <p className="mt-1 select-all break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              {refUrl}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Divulgue principalmente o <strong>cupom</strong>: ele funciona em qualquer aparelho e
          continua valendo mesmo que a pessoa compre semanas depois, em outro navegador. O link
          depende do navegador em que foi clicado.
        </p>
      </section>

      {/* ── Números ──────────────────────────────────────────────────────── */}
      {/* 2-up on phones (a 4-up row would squeeze "R$ 313,22" onto two lines at
          375px), 4-up from md where each card still gets ~180px. */}
      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Cliques"
          value={String(data.clicks)}
        />
        <StatCard
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Vendas"
          value={String(data.salesCount)}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Pendente"
          value={formatBRL(data.pendingCents)}
          hint="Liberada 30 dias após a confirmação do pagamento."
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Disponível"
          value={formatBRL(data.availableCents)}
          hint={
            reachedMinimum
              ? "Já supera o mínimo de R$ 200,00."
              : "Abaixo de R$ 200,00 — o saldo fica acumulado e não expira."
          }
        />
      </section>

      {/* ── Como receber ─────────────────────────────────────────────────── */}
      <section className="mt-4 rounded-xl border border-border bg-surface-1 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Como receber</h2>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">1.</strong> Todo mês, o fechamento considera as
            comissões liberadas até o último dia do mês anterior.
          </li>
          <li>
            <strong className="text-foreground">2.</strong> Você recebe o demonstrativo até o
            2º dia útil e emite a NFS-e pelo valor exato.
          </li>
          <li>
            <strong className="text-foreground">3.</strong> Envie o PDF até o 5º dia útil para{" "}
            <a className="text-brand underline" href="mailto:contato@medhelpspace.com.br">
              contato@medhelpspace.com.br
            </a>
            .
          </li>
          <li>
            <strong className="text-foreground">4.</strong> O pagamento é feito até o dia 15.
          </li>
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Neste primeiro ciclo o painel é apenas de consulta — não há botão de saque. Uma nota
          enviada fora do prazo entra no ciclo seguinte, sem perda de saldo.
        </p>
      </section>

      {/* ── Tabela de preços (fonte oficial, cl. 4.3) ────────────────────── */}
      {data.prices.length > 0 ? (
        <section className="mt-4 rounded-xl border border-border bg-surface-1 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Preços vigentes e sua comissão</h2>
          <div className="mt-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Turma</th>
                  <th className="pb-2 pr-3 text-right font-medium">Preço</th>
                  <th className="pb-2 pr-3 text-right font-medium">Com seu cupom</th>
                  <th className="pb-2 text-right font-medium">Sua comissão</th>
                </tr>
              </thead>
              <tbody>
                {data.prices.map((p) => (
                  <tr key={p.name} className="border-b border-border/60 last:border-b-0">
                    <td className="py-2.5 pr-3">{p.name}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                      {formatBRL(p.priceCents)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {formatBRL(p.afterCouponCents)}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">
                      {formatBRL(p.commissionCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Esta tabela é a fonte oficial: ela acompanha o preço vigente automaticamente. Os
            preços podem mudar, e a comissão é sempre 10% do valor efetivamente pago.
          </p>
        </section>
      ) : null}

      {/* ── Histórico de comissões ───────────────────────────────────────── */}
      <section className="mt-4 rounded-xl border border-border bg-surface-1 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Comissões</h2>
        {data.commissions.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Nenhuma venda atribuída ainda. Assim que a primeira compra com seu cupom ou link for
            confirmada, ela aparece aqui com a data prevista de liberação.
          </p>
        ) : (
          <ul className="mt-1">
            {data.commissions.map((c) => (
              <CommissionItem key={c.id} row={c} />
            ))}
          </ul>
        )}
      </section>

      {/* ── Repasses ─────────────────────────────────────────────────────── */}
      {data.payouts.length > 0 ? (
        <section className="mt-4 rounded-xl border border-border bg-surface-1 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Repasses</h2>
          <ul className="mt-1">
            {data.payouts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm">{formatDateBR(p.referenceMonth)}</p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABELS[p.status] ?? p.status}
                    {p.paidAt ? ` · pago em ${formatDateBR(p.paidAt)}` : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatBRL(p.totalCents)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Dúvidas?{" "}
        {/* inline-flex + min-height so the only standalone link on the page is a
            comfortable tap target rather than a 15px-tall sliver. */}
        <Link
          href="/suporte"
          className="inline-flex min-h-[44px] items-center px-2 text-brand underline"
        >
          Fale com o suporte
        </Link>
      </p>
    </main>
  );
}
