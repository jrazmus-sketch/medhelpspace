import Link from "next/link";
import { getClinactViewer } from "@/lib/clinact/access";
import { getPublicKey } from "@/lib/pagbank/subscriptions";
import { subscriptionsUnavailable } from "@/lib/clinact/subscribe";
import { CLINACT_PLAN_LIST, annualInMonthlies, formatBRL } from "@/lib/clinact/plans";
import { SubscribeForm } from "./subscribe-form";

export const metadata = { title: "Assinar" };
export const dynamic = "force-dynamic";

/**
 * The ClinAct subscription checkout.
 *
 * Reachable by URL while the sales page is still unpublished — the plan buttons
 * there will point here once Karina publishes it.
 *
 * The public key is fetched server-side and handed to the browser, which is
 * where the card gets encrypted: the number never reaches our server. It is
 * this API's OWN key, not the Orders one, and it differs per environment.
 */
export default async function AssinarPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string }>;
}) {
  // ?plano= comes from the sales page's plan buttons; only a known key is used.
  // (A logged-out visitor never gets here: the proxy sends them to /login with
  // this whole URL, ?plano= included, as `next`.)
  const { plano } = await searchParams;
  const initialPlan = CLINACT_PLAN_LIST.find((p) => p.key === plano)?.key;
  const viewer = await getClinactViewer();

  if (viewer.hasAccess) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold">Você já tem acesso</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A sua assinatura do ClinAct está ativa. Não é preciso assinar de novo.
        </p>
        <Link
          href="/clinact/treinar"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-medium text-white"
        >
          Ir para os casos
        </Link>
      </div>
    );
  }

  // Live site pointed at the sandbox: show nothing rather than sell against a
  // test environment. Otherwise fetch the key the browser encrypts with.
  let publicKey: string | null = null;
  if (!subscriptionsUnavailable()) {
    try {
      publicKey = (await getPublicKey()).public_key;
    } catch {
      // Fail visibly but calmly: no key means no safe way to collect a card.
      publicKey = null;
    }
  }

  if (!publicKey) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold">Assinatura indisponível</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Não foi possível iniciar o pagamento agora. Tente novamente em alguns minutos.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">Assinar o ClinAct</h1>
      <p className="mt-1 max-w-[54ch] text-sm text-muted-foreground">
        Acesso a todos os casos, à Minha Evolução e à revisão espaçada. Renova automaticamente até
        você cancelar.
      </p>

      <SubscribeForm
        publicKey={publicKey}
        initialPlan={initialPlan}
        plans={CLINACT_PLAN_LIST.map((p) => ({
          key: p.key,
          label: p.label,
          price: formatBRL(p.amount_cents),
          note:
            p.key === "anual"
              ? `Equivale a ${annualInMonthlies()} mensalidades por 12 meses`
              : "Cobrado todo mês",
        }))}
      />
    </div>
  );
}
