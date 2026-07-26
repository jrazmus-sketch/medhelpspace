import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteContent } from "@/lib/queries/site-content";
import { getCohortProduct } from "@/lib/queries/cohort-products";
import {
  gradeSimulado,
  getSimuladoReviewItems,
  parseCutScore,
  SIM_SESSION_COOKIE,
  SIMULADO_TOTAL,
  type SimuladoProgress,
} from "@/lib/magnet/simulado";
import {
  SIMULADO_PATH,
  WELCOME_COUPONS,
  offerCheckoutUrl,
} from "@/lib/magnet/links";
import type { SessionOffer } from "@/components/magnet/flashcards-session";
import { SimuladoReport } from "@/components/magnet/simulado-report";

// The diagnosis + commented gabarito, released ONLY after the exam is submitted.
//
// This is the one page that loads the answers and the comentários. It is gated on
// sim_completed_at precisely so a second tab cannot be used to read the gabarito
// mid-exam — without that check the entire no-feedback design would be decorative.
//
// Per-candidate → noindex, never cached.

export const metadata: Metadata = {
  title: "Seu resultado — Simulado Revalida",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const COHORT_LABEL: Record<string, string> = {
  "revalida-2026-2": "Revalida 2026.2",
  "revalida-2027-1": "Revalida 2027.1",
  "revalida-20272": "Revalida 2027.2",
};

function Empty({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 text-center text-foreground">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <Link
          href={href}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          {cta}
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
        href={SIMULADO_PATH}
        cta="Começar meu simulado grátis →"
      />
    );
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("email, first_name, target_cohort, sim_completed_at, sim_progress, sim_flagged")
    .eq("result_token", token)
    .maybeSingle();

  if (!lead) {
    return (
      <Empty
        title="Não encontramos o seu simulado"
        body="Abra o link que enviamos por e-mail, ou comece um novo simulado."
        href={SIMULADO_PATH}
        cta="Começar meu simulado grátis →"
      />
    );
  }

  // The rule, enforced here and nowhere else: no diagnosis and no gabarito before
  // the prova is handed in. Partial answers never become a result.
  if (!lead.sim_completed_at) {
    return (
      <Empty
        title="Sua prova ainda não foi entregue"
        body="O diagnóstico e o gabarito comentado das 100 questões são liberados quando você entregar o simulado."
        href="/simulado-revalida/prova"
        cta="Voltar para a prova →"
      />
    );
  }

  const progress = (lead.sim_progress as SimuladoProgress | null) ?? {};
  const flagged = ((lead.sim_flagged as number[] | null) ?? []).map((n) => Number(n));
  const cohort = (lead.target_cohort as string | null) ?? "revalida-2027-1";
  const email = lead.email as string;

  // Re-grade at render rather than trusting the stored snapshot: it keeps the
  // report correct if a question is ever corrected after someone submitted, and it
  // is the only place temasToReview is derived.
  const [grade, items, siteContent, product] = await Promise.all([
    gradeSimulado(progress),
    getSimuladoReviewItems(progress, flagged),
    getSiteContent().catch(() => ({})),
    getCohortProduct(cohort),
  ]);

  const cutScore = parseCutScore(
    (siteContent as Record<string, { value: string } | undefined>)["sim.report.cut_score"]?.value,
  );

  // Offer for invitation #2. Skipped gracefully when the turma isn't purchasable
  // (e.g. an "ainda não decidi" lead, or a cohort closed for sale).
  const welcome = WELCOME_COUPONS[cohort] ?? null;
  const offer: SessionOffer | null = product
    ? {
        cohortName: product.name,
        priceLabel: product.priceLabel,
        compareAtLabel: product.compareAtPriceLabel,
        couponCode: welcome?.code ?? null,
        couponPercent: welcome?.percent ?? null,
        checkoutUrl: offerCheckoutUrl({
          email,
          cohort,
          coupon: welcome?.code ?? null,
          utmCampaign: "simulado-report",
        }),
      }
    : null;

  const storeCoupon =
    !product && welcome
      ? {
          code: welcome.code,
          percent: welcome.percent,
          url: offerCheckoutUrl({
            email,
            cohort,
            coupon: welcome.code,
            utmCampaign: "simulado-report",
          }),
        }
      : null;

  return (
    <SimuladoReport
      firstName={(lead.first_name as string | null) ?? null}
      score={grade.score}
      blank={grade.blank}
      wrong={grade.wrong}
      total={SIMULADO_TOTAL}
      cutScore={cutScore}
      areaScores={grade.areaScores}
      temasToReview={grade.temasToReview}
      items={items}
      offer={offer}
      storeCoupon={storeCoupon}
      cohortLabel={COHORT_LABEL[cohort] ?? "sua turma"}
      token={token}
    />
  );
}
