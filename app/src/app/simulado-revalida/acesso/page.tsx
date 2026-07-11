import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimuladoQuestions, type SimuladoProgress } from "@/lib/magnet/simulado";
import { getCohortProduct } from "@/lib/queries/cohort-products";
import {
  WELCOME_COUPONS,
  SIMULADO_PATH,
  offerCheckoutUrl,
} from "@/lib/magnet/links";
import type { SessionOffer } from "@/components/magnet/flashcards-session";
import { SimuladoSession } from "@/components/magnet/simulado-session";

// Magic-link landing for the simulado funnel. The link in the delivery email
// (lead-sim-access) points here with ?t=<result_token>. The click IS the
// verification: we stamp verified_at (idempotent), then render the 100-question
// session — which resumes at the next unanswered question from sim_progress.
// Per-user, token-gated → noindex.

export const metadata: Metadata = {
  title: "Seu simulado Revalida — 100 questões reais",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const COHORT_LABEL: Record<string, string> = {
  "revalida-2026-2": "Revalida 2026.2",
  "revalida-2027-1": "Revalida 2027.1",
  "revalida-20272": "Revalida 2027.2",
};

function InvalidLink() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 text-center text-foreground">
      <div className="max-w-md">
        <div aria-hidden className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-3xl">
          🔗
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Link inválido ou expirado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não encontramos o seu acesso. Peça um novo simulado — leva 10 segundos.
        </p>
        <Link
          href={SIMULADO_PATH}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          Começar meu simulado grátis →
        </Link>
      </div>
    </div>
  );
}

export default async function SimuladoAcessoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.t;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) return <InvalidLink />;

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("id, email, first_name, target_cohort, verified_at, sim_progress, sim_completed_at")
    .eq("result_token", token)
    .maybeSingle();

  if (!lead) return <InvalidLink />;

  // The click is the confirmation (magic-link trust model) — stamp verified_at on
  // first open so the lead enters the verified drip. Idempotent.
  if (!lead.verified_at) {
    await admin
      .from("leads")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", lead.id);
  }

  const cohort = (lead.target_cohort as string | null) ?? "revalida-2027-1";
  const email = lead.email as string;
  const firstName = (lead.first_name as string | null) ?? null;

  // Question fetch degrades to [] (session shows an "em preparação" state) rather
  // than 500ing the page; getCohortProduct already returns null on error.
  const [questions, product] = await Promise.all([
    getSimuladoQuestions().catch(() => []),
    getCohortProduct(cohort),
  ]);

  // Build the sales offer for the report screen (skipped gracefully if the turma
  // isn't purchasable). Welcome coupon comes from the per-turma map.
  const welcome = WELCOME_COUPONS[cohort] ?? null;
  let offer: SessionOffer | null = null;
  if (product) {
    offer = {
      cohortName: product.name,
      priceLabel: product.priceLabel,
      compareAtLabel: product.compareAtPriceLabel,
      couponCode: welcome?.code ?? null,
      couponPercent: welcome?.percent ?? null,
      checkoutUrl: offerCheckoutUrl({
        email,
        cohort,
        coupon: welcome?.code ?? null,
        utmCampaign: "simulado-reward",
      }),
    };
  }

  // No single-turma product (undecided lead): surface the all-turma coupon + a link
  // to the store to pick a turma.
  const storeCoupon =
    !product && welcome
      ? {
          code: welcome.code,
          percent: welcome.percent,
          url: offerCheckoutUrl({ email, cohort, coupon: welcome.code, utmCampaign: "simulado-reward" }),
        }
      : null;

  const initialProgress = (lead.sim_progress as SimuladoProgress | null) ?? undefined;

  return (
    <SimuladoSession
      questions={questions}
      firstName={firstName}
      cohortLabel={COHORT_LABEL[cohort] ?? "sua turma"}
      offer={offer}
      storeCoupon={storeCoupon}
      token={token}
      initialProgress={initialProgress}
      initialCompleted={Boolean(lead.sim_completed_at)}
    />
  );
}
