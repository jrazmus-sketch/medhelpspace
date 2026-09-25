import Link from "next/link";
import { getClinactViewer } from "@/lib/clinact/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicKey, getSubscriptionsEnv } from "@/lib/pagbank/subscriptions";
import { CLINACT_PLANS, formatBRL, type ClinactPlanKey } from "@/lib/clinact/plans";
import { SubscriptionActions } from "./subscription-actions";

export const metadata = { title: "Minha assinatura" };
export const dynamic = "force-dynamic";

/**
 * The subscriber's own subscription: what they pay, until when they have
 * access, which card is on file — and the two things they must be able to do
 * without writing to support: cancel, and change the card.
 *
 * Cancelling is not optional to offer. A subscription the customer cannot end
 * themselves is exactly what the CDC treats as abusive.
 */

const STATUS_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "off" }> = {
  ACTIVE: { text: "Ativa", tone: "ok" },
  OVERDUE: { text: "Pagamento pendente", tone: "warn" },
  PENDING_ACTION: { text: "Precisa de um novo cartão", tone: "warn" },
  SUSPENDED: { text: "Suspensa", tone: "warn" },
  PENDING: { text: "Processando", tone: "warn" },
  CANCELED: { text: "Cancelada", tone: "off" },
  EXPIRED: { text: "Encerrada", tone: "off" },
};

function dateBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function AssinaturaPage() {
  const viewer = await getClinactViewer();
  const admin = createAdminClient();

  const [{ data: sub }, { data: access }] = await Promise.all([
    admin
      .from("clinact_subscriptions")
      .select("plan_key, status, card_brand, card_last_digits")
      .eq("user_id", viewer.userId)
      .eq("environment", getSubscriptionsEnv())
      .maybeSingle(),
    admin
      .from("user_product_access")
      .select("paid_until")
      .eq("user_id", viewer.userId)
      .eq("product", "clinact")
      .maybeSingle(),
  ]);

  if (!sub) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold">Minha assinatura</h1>
        <p className="mt-1 text-sm text-muted-foreground">Você ainda não tem uma assinatura do ClinAct.</p>
        <Link
          href="/clinact/assinar"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-medium text-white"
        >
          Assinar
        </Link>
      </div>
    );
  }

  const plan = CLINACT_PLANS[sub.plan_key as ClinactPlanKey];
  const status = STATUS_LABEL[String(sub.status)] ?? { text: "—", tone: "warn" as const };
  const ended = sub.status === "CANCELED" || sub.status === "EXPIRED";
  const until = dateBR(access?.paid_until as string | undefined);

  // The card form needs this API's key; only fetched when the card can change.
  let publicKey: string | null = null;
  if (!ended) {
    try {
      publicKey = (await getPublicKey()).public_key;
    } catch {
      publicKey = null;
    }
  }

  const toneClass =
    status.tone === "ok"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status.tone === "warn"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">Minha assinatura</h1>

      <dl className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <dt className="text-sm text-muted-foreground">Plano</dt>
          <dd className="text-right font-medium">
            {plan ? `${plan.label} · ${formatBRL(plan.amount_cents)}` : "—"}
          </dd>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <dt className="text-sm text-muted-foreground">Situação</dt>
          <dd>
            <span className={`rounded-full px-2.5 py-1 text-sm font-medium ${toneClass}`}>{status.text}</span>
          </dd>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <dt className="text-sm text-muted-foreground">{ended ? "Acesso até" : "Acesso garantido até"}</dt>
          <dd className="text-right font-medium">{until ?? "—"}</dd>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <dt className="text-sm text-muted-foreground">Cartão</dt>
          <dd className="text-right font-medium capitalize">
            {sub.card_last_digits ? `${sub.card_brand ?? "cartão"} final ${sub.card_last_digits}` : "—"}
          </dd>
        </div>
      </dl>

      {sub.status === "OVERDUE" || sub.status === "PENDING_ACTION" ? (
        <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A última cobrança não foi aprovada. Troque o cartão abaixo para regularizar — a nova cobrança é
          feita no cartão novo.
        </p>
      ) : null}

      {ended ? (
        <div className="mt-6">
          <p className="text-sm text-muted-foreground">
            A assinatura está encerrada{until ? ` e o seu acesso vai até ${until}` : ""}. Para voltar, é só
            assinar de novo.
          </p>
          <Link
            href="/clinact/assinar"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-medium text-white"
          >
            Assinar de novo
          </Link>
        </div>
      ) : (
        <SubscriptionActions publicKey={publicKey} accessUntil={until} />
      )}
    </div>
  );
}
