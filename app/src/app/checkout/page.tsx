import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CheckoutClient } from "./checkout-client";
import { getCohortProduct } from "@/lib/queries/cohort-products";
import { getInstallmentOptions } from "@/lib/pagbank/api";

export const metadata = { title: "Finalizar compra — MedHelpSpace" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const { cohort: cohortSlug } = await searchParams;

  // Unknown or not-for-sale cohort → back to store
  const config = cohortSlug ? await getCohortProduct(cohortSlug) : null;
  if (!config) {
    redirect("/loja");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Guest checkout: anonymous visitors see the form with inline signup/login fields.
  // The charge route handles auth in the same POST as the charge itself.

  let userEmail = "";
  let userName = "";
  let alreadyMember = false;

  if (user) {
    // Block only if user has an ACTIVE membership in this specific cohort.
    // An expired membership, or a membership in a different cohort, should not block.
    const now = new Date().toISOString();
    const { data: memberships } = await supabase
      .from("user_cohort_memberships")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("cohort:cohorts(slug, membership_starts_at, membership_ends_at)")
      .eq("user_id", user.id);

    alreadyMember = (memberships ?? []).some((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (m as any).cohort as { slug: string; membership_starts_at: string; membership_ends_at: string } | null;
      if (!c) return false;
      return (
        c.slug === cohortSlug &&
        c.membership_starts_at <= now &&
        c.membership_ends_at >= now
      );
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    userEmail = user.email ?? "";
    userName = profile?.display_name ?? "";
  }

  // Default installment ladder (mainstream brands) for first paint — refined
  // client-side once the card BIN is known. Tolerate a PagBank outage: the card
  // form falls back to fetching/à-vista if this is empty.
  const initialInstallments = await getInstallmentOptions(config.priceCents).catch(() => []);

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <LandingNav embedded />

      <main className="px-5 py-12 md:px-8 md:py-20">
        <div className="mx-auto max-w-4xl">
          <CheckoutClient
            cohortSlug={cohortSlug!}
            cohortName={config.name}
            priceLabel={config.priceLabel}
            amountCents={config.priceCents}
            isLoggedIn={!!user}
            userEmail={userEmail}
            userName={userName}
            alreadyMember={alreadyMember}
            pagbankPublicKey={process.env.NEXT_PUBLIC_PAGBANK_PUBLIC_KEY ?? ""}
            initialInstallments={initialInstallments}
          />
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
