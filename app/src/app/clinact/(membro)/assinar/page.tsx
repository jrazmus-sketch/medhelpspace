import Link from "next/link";
import { getClinactViewer } from "@/lib/clinact/access";
import { createClient } from "@/lib/supabase/server";
import { getPublicKey } from "@/lib/pagbank/subscriptions";
import { subscriptionsUnavailable } from "@/lib/clinact/subscribe";
import {
  CLINACT_PLAN_LIST,
  annualOfferInMonthlies,
  chargeSchedule,
  formatBRL,
  planOffer,
  promoPriceLine,
  renewalLine,
} from "@/lib/clinact/plans";
import { todayKeyBR } from "@/lib/br-date";
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

  // The student is the account. Shown in the nota block so "the student himself"
  // as tomador is pre-filled, and so a different tomador is visibly NOT the
  // person who will use ClinAct.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
    : { data: null };
  const student = { name: (profile?.display_name as string | null) ?? "", email: user?.email ?? "" };

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
        student={student}
        plans={CLINACT_PLAN_LIST.map((p) => {
          // The same planOffer() the charge uses, on the same Brazilian date —
          // and the first charge travels back with the form, so the server
          // refuses to charge anything other than what this page showed.
          const offer = planOffer(p.key, todayKeyBR());
          return {
            key: p.key,
            label: p.label,
            price: formatBRL(p.amount_cents),
            firstCents: offer.first_cents,
            firstPrice: formatBRL(offer.first_cents),
            promo: offer.promotion
              ? { label: offer.promotion.label, line: promoPriceLine(offer), renewal: renewalLine(offer) }
              : null,
            schedule: chargeSchedule(offer),
            note:
              p.key === "anual"
                ? `Equivale a ${annualOfferInMonthlies(offer)} mensalidades por 12 meses`
                : "Cobrado todo mês",
          };
        })}
      />
    </div>
  );
}
